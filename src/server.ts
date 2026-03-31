import express from "express";
import multer from "multer";
import { db } from "./db.ts";
import { status_tarefaTable, tarefaTable, tipo_prioridadeTable, usuarioTable, responsavel_tarefaTable, equipeTable, membro_equipeTable, roleTable, anexoTable } from "./db/schema.ts";
import { calculateMd5Hash } from "./hash.ts";
import cors from "cors";
import authRoutes from './authRoutes.ts';
import { verificarToken, signAccessToken } from './authMiddleware.ts';
import { and, eq, ilike, sql, asc, desc, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import fs from "fs";
import path from "path";

type AuthenticatedRequest = express.Request & { user?: string | object };

// Campos de formulário/JSON: aceita string ou número (ex.: cpf/telefone como number no JSON). Retorna string limpa ou undefined se inválido.
function campoTexto(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") {
    const t = v.trim();
    return t.length > 0 ? t : undefined;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
}

const app = express();

if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static("uploads"));
app.use(authRoutes);



/* ===================================================================== ROUTERS BANCO DE DADOS ===================================================================== */



// rota de teste para verificar token
app.get("/usuarios", verificarToken, async (req, res) => {
  res.json({ mensagem: "Acesso autorizado a usuários." });
});

// criar usuario — JSON ou multipart/form-data. Token na resposta para POST /usuarios/anexo se a foto for em outro passo.
app.post("/usuarios", upload.single("anexo"), async (req, res) => {
  try {

    const raw = req.body ?? {};
    // Front com JSON.stringify({ dataForms }) envia os campos aninhados; aceitar também objeto plano.
    const body =
      raw.dataForms && typeof raw.dataForms === "object" && !Array.isArray(raw.dataForms)
        ? raw.dataForms
        : raw;
    const nome = campoTexto(body.nome);
    const cpf = campoTexto(body.cpf);
    const telefone = campoTexto(body.telefone);
    const email = campoTexto(body.email);
    const senha = campoTexto(body.senha);

    if (!nome || !cpf || !telefone || !email || !senha) {
      return res.status(400).json({
        message:
          "Informe nome, cpf, telefone, email e senha (strings ou números para documentos). JSON: application/json. FormData: multipart com os mesmos nomes de campo; foto opcional no campo \"anexo\".",
        camposObrigatorios: {
          nome: Boolean(nome),
          cpf: Boolean(cpf),
          telefone: Boolean(telefone),
          email: Boolean(email),
          senha: Boolean(senha),
        },
      });
    }

    const senha_hash = calculateMd5Hash(senha);

    let id_role_fk = Number(
      body.id_role_fk ?? body.id_role ?? process.env.DEFAULT_ROLE_ID ?? 1
    );
    if (!Number.isFinite(id_role_fk) || id_role_fk < 1) {
      id_role_fk = 1;
    }

    const result = await db
      .insert(usuarioTable)
      .values({
        nome,
        cpf,
        telefone,
        email,
        senha_hash,
        id_role_fk,
      })
      .returning();

    const user = result[0];
    if (!user) {
      return res.status(500).json({ message: "Falha ao criar usuário." });
    }

    const file = req.file;
    let usuarioResposta = user;

    if (file) {
      const insertedAnexos = await db
        .insert(anexoTable)
        .values({
          url_caminho: `uploads/${file.filename}`,
          nome_original: file.originalname,
          mime_type: file.mimetype,
          id_usuario_envio_fk: user.id_usuario,
          dt_envio: new Date(),
        })
        .returning();

      const anexoRow = insertedAnexos[0];
      if (anexoRow) {
        await db
          .update(usuarioTable)
          .set({ id_avatar_fk: anexoRow.id_anexo })
          .where(eq(usuarioTable.id_usuario, user.id_usuario));
        usuarioResposta = { ...user, id_avatar_fk: anexoRow.id_anexo };
      }
    }

    const token = signAccessToken(user);
    res.status(201).json({ token, usuario: usuarioResposta });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao criar usuário." });
  }
});

// upload de foto de perfil para usuário autenticado. Retorna dados do anexo criado e vinculado como avatar.
app.post("/usuarios/anexo", verificarToken, upload.single("anexo"), async (req: AuthenticatedRequest, res) => {
  try {

    if (!req.user || typeof req.user !== "object" || !("id" in req.user)) {
      return res.status(401).json({ message: "Usuário não autenticado." });
    }
    const id_usuario = Number((req.user as { id: number }).id);

    const file = req.file as Express.Multer.File;
    if (!file) {
      return res.status(400).json({ error: "Nenhum arquivo enviado" });
    }

    const result = await db.insert(anexoTable).values({
      url_caminho: `uploads/${file.filename}`,
      nome_original: file.originalname,
      mime_type: file.mimetype,
      id_usuario_envio_fk: id_usuario,
      dt_envio: new Date(),
    }).returning();

    const anexo = result[0];
    if (!anexo) {
      return res.status(500).json({ error: "Falha ao registrar anexo." });
    }

    await db
      .update(usuarioTable)
      .set({ id_avatar_fk: anexo.id_anexo })
      .where(eq(usuarioTable.id_usuario, id_usuario));

    res.status(201).json(anexo);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Erro ao salvar anexo." });
  }
});

// dados da conta do usuário autenticado (sem senha)
app.get("/usuarios/me", verificarToken, async (req: AuthenticatedRequest, res) => {
  try {

    if (!req.user || typeof req.user !== "object" || !("id" in req.user)) {
      return res.status(401).json({ message: "Usuário não autenticado." });
    }
    const id_usuario = Number((req.user as { id: number }).id);

    const rows = await db
      .select({
        id_usuario: usuarioTable.id_usuario,
        nome: usuarioTable.nome,
        cpf: usuarioTable.cpf,
        telefone: usuarioTable.telefone,
        email: usuarioTable.email,
        dt_criacao: usuarioTable.dt_criacao,
        id_role_fk: usuarioTable.id_role_fk,
        id_avatar_fk: usuarioTable.id_avatar_fk,
        role_nome: roleTable.nome,
      })
      .from(usuarioTable)
      .leftJoin(roleTable, eq(usuarioTable.id_role_fk, roleTable.id_role))
      .where(eq(usuarioTable.id_usuario, id_usuario))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return res.status(404).json({ message: "Usuário não encontrado." });
    }

    res.status(200).json(row);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao buscar dados do usuário." });
  }
});

// foto de perfil do usuário autenticado 
app.get("/usuarios/me/avatar", verificarToken, async (req: AuthenticatedRequest, res) => {
  try {

    if (!req.user || typeof req.user !== "object" || !("id" in req.user)) {
      return res.status(401).json({ message: "Usuário não autenticado." });
    }
    const id_usuario = Number((req.user as { id: number }).id);

    const rows = await db
      .select({
        url_caminho: anexoTable.url_caminho,
        mime_type: anexoTable.mime_type,
        nome_original: anexoTable.nome_original,
      })
      .from(usuarioTable)
      .innerJoin(anexoTable, eq(usuarioTable.id_avatar_fk, anexoTable.id_anexo))
      .where(eq(usuarioTable.id_usuario, id_usuario))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return res.status(404).json({ message: "Nenhuma foto de perfil cadastrada." });
    }

    const filePath = path.join(process.cwd(), row.url_caminho);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "Arquivo da foto não encontrado no servidor." });
    }

    const urlPublica = `/${row.url_caminho.replace(/\\/g, "/")}`;
    res.status(200).json({
      url: urlPublica,
      mime_type: row.mime_type,
      nome_original: row.nome_original,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao buscar foto de perfil." });
  }
});

// Remover foto de perfil do usuário autenticado
app.delete("/usuarios/me/avatar", verificarToken, async (req: AuthenticatedRequest, res) => {
  try {

    if (!req.user || typeof req.user !== "object" || !("id" in req.user)) {
      return res.status(401).json({ message: "Usuário não autenticado." });
    }
    const id_usuario = Number((req.user as { id: number }).id);

    const result = await db
      .select({
        id_avatar_fk: usuarioTable.id_avatar_fk,
        url_caminho: anexoTable.url_caminho,
      })
      .from(usuarioTable)
      .leftJoin(anexoTable, eq(usuarioTable.id_avatar_fk, anexoTable.id_anexo))
      .where(eq(usuarioTable.id_usuario, id_usuario))
      .limit(1);

    const row = result[0];
    if (!row || !row.id_avatar_fk || !row.url_caminho) {
      return res.status(404).json({ message: "Nenhuma foto de perfil cadastrada." });
    }

    await db.update(usuarioTable)
      .set({ id_avatar_fk: null })
      .where(eq(usuarioTable.id_usuario, id_usuario));

    await db.delete(anexoTable)
      .where(eq(anexoTable.id_anexo, row.id_avatar_fk));

    const filePath = path.join(process.cwd(), row.url_caminho);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.status(200).json({ message: "Foto de perfil removida com sucesso." });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao remover foto de perfil." });
  }
});

// atualizar dados do usuário autenticado e opcionalmente foto de perfil.
app.put("/usuarios/me", verificarToken, upload.single("anexo"), async (req: AuthenticatedRequest, res) => {
  try {

    if (!req.user || typeof req.user !== "object" || !("id" in req.user)) {
      return res.status(401).json({ message: "Usuário não autenticado." });
    }
    const id_usuario = Number((req.user as { id: number }).id);

    const { nome, telefone, email, senhaNova } = req.body;

    // 1. Preparar objeto de atualização de dados básicos
    const dadosParaAtualizar: any = {
      nome: nome,
      telefone: telefone,
      email: email,
    };

    // 2. Se enviou senha nova, faz o hash e adiciona no update
    if (senhaNova && senhaNova.trim() !== "") {
      dadosParaAtualizar.senha_hash = calculateMd5Hash(senhaNova);
    }

    // 3. Executa a atualização dos dados textuais
    await db.update(usuarioTable)
      .set(dadosParaAtualizar)
      .where(eq(usuarioTable.id_usuario, id_usuario));

    // 4. Se enviou uma nova foto, processa o anexo
    if (req.file) {
      const file = req.file;
      const insertedAnexos = await db.insert(anexoTable).values({
        url_caminho: `uploads/${file.filename}`,
        nome_original: file.originalname,
        mime_type: file.mimetype,
        id_usuario_envio_fk: id_usuario,
        dt_envio: new Date(),
      }).returning();

      const anexoRow = insertedAnexos[0];
      if (anexoRow) {
        // Vincula o novo anexo como avatar atual
        await db.update(usuarioTable)
          .set({ id_avatar_fk: anexoRow.id_anexo })
          .where(eq(usuarioTable.id_usuario, id_usuario));
      }
    }

    res.status(200).json({ message: "Perfil atualizado com sucesso!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao atualizar perfil." });
  }
});

// criar equipe
app.post("/equipe", verificarToken, async (req: AuthenticatedRequest, res) => {
  try {

    if (!req.user || typeof req.user !== "object" || !("id" in req.user)) {
      return res.status(401).json({ message: "Usuário não autenticado." });
    }

    const { nome, descricao } = req.body;

    const result = await db.insert(equipeTable).values({
      nome,
      descricao,
      id_criador_fk: Number(req.user.id),
    }).returning();

    await db.insert(membro_equipeTable).values([{
      id_usuario_fk: Number(req.user.id),
      id_equipe_fk: result[0]!.id_equipe,
      id_role_fk: 1, // Criador
    }]);

    console.log("AUTH HEADER:", req.headers.authorization);
    res.status(201).json(result);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao criar equipe." });
  }
});

// buscar equipes do usuário autenticado
app.get("/equipe", verificarToken, async (req: AuthenticatedRequest, res) => {
  try {

    if (!req.user || typeof req.user !== 'object' || !('id' in req.user)) {
      return res.status(401).json({ message: 'Usuário não autenticado.' });
    }
    const id_usuario = (req.user as { id: number }).id;

    const search = req.query.search as string | undefined;
    let filtroNome = undefined;

    if (search) {
      filtroNome = ilike(equipeTable.nome, `%${search}%`);
    }

    const equipes = await db
      .select({
        id_equipe: equipeTable.id_equipe,
        nome: equipeTable.nome,
        descricao: equipeTable.descricao,
        dt_criacao: equipeTable.dt_criacao,
        id_usuario: membro_equipeTable.id_usuario_fk,
      })
      .from(equipeTable)
      .where(and(eq(membro_equipeTable.id_usuario_fk, id_usuario), filtroNome))
      .leftJoin(membro_equipeTable, eq(equipeTable.id_equipe, membro_equipeTable.id_equipe_fk))
      .leftJoin(usuarioTable, eq(membro_equipeTable.id_usuario_fk, usuarioTable.id_usuario));

    res.status(200).json(equipes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao buscar equipes.' });
  }
});

// adicionar membro à equipe
app.post("/membro_equipe", verificarToken, async (req: AuthenticatedRequest, res) => {
  try {

    if (!req.user || typeof req.user !== "object" || !("id" in req.user)) {
      return res.status(401).json({ message: "Usuário não autenticado." });
    }

    const { email, isAdmin, id_equipe_fk } = req.body;
    const id_role_fk = isAdmin ? 2 : 3; // 2 para Admin, 3 para Membro

    const usuario = await db
      .select()
      .from(usuarioTable)
      .where(eq(usuarioTable.email, email))
      .limit(1);

    const membroExistente = await db
      .select()
      .from(membro_equipeTable)
      .where(
        and(
          eq(membro_equipeTable.id_usuario_fk, usuario[0]!.id_usuario),
          eq(membro_equipeTable.id_equipe_fk, id_equipe_fk)
        )
      )
      .limit(1);

    if (membroExistente.length) {
      return res.status(400).json({
        message: "Usuário já é membro desta equipe."
      });
    }

    if (usuario.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado.' });
    }
    if (!id_equipe_fk) {
      return res.status(400).json({ message: 'ID da equipe é obrigatório.' });
    }

    const result = await db.insert(membro_equipeTable).values({
      id_usuario_fk: usuario[0]!.id_usuario,
      id_equipe_fk: Number(id_equipe_fk),
      id_role_fk
    }).returning();

    res.status(201).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao adicionar membro à equipe.' });
  }
});

// buscar membros da equipe
app.get("/membro_equipe", verificarToken, async (req: AuthenticatedRequest, res) => {
  try {

    if (!req.user || typeof req.user !== 'object' || !('id' in req.user)) {
      return res.status(401).json({ message: 'Usuário não autenticado.' });
    }

    const id_equipe = Number(req.query.id_equipe);

    if (!id_equipe) {
      return res.status(400).json({ message: "Equipe inválida." });
    }

    const search = req.query.search as string | undefined;
    let filtroNome = undefined;

    if (search) {
      filtroNome = ilike(usuarioTable.nome, `%${search}%`);
    }

    const membros = await db
      .select({
        id_membro: membro_equipeTable.id_membro,
        nome: usuarioTable.nome,
        cargo: roleTable.nome,
        id_role_fk: membro_equipeTable.id_role_fk,
        dt_entrada: membro_equipeTable.dt_entrada,
        tarefas_atribuidas: sql<number>`COUNT(${responsavel_tarefaTable.id_tarefa_fk}) FILTER (WHERE ${tarefaTable.id_equipe_fk} = ${id_equipe})`
      })
      .from(membro_equipeTable)
      .leftJoin(usuarioTable, eq(membro_equipeTable.id_usuario_fk, usuarioTable.id_usuario))
      .leftJoin(roleTable, eq(membro_equipeTable.id_role_fk, roleTable.id_role))
      .leftJoin(responsavel_tarefaTable, eq(responsavel_tarefaTable.id_usuario_fk, usuarioTable.id_usuario))
      .leftJoin(tarefaTable, eq(responsavel_tarefaTable.id_tarefa_fk, tarefaTable.id_tarefa))
      .where(and(eq(membro_equipeTable.id_equipe_fk, id_equipe), filtroNome))
      .groupBy(
        membro_equipeTable.id_membro,
        usuarioTable.nome,
        roleTable.nome,
        membro_equipeTable.dt_entrada,
        membro_equipeTable.id_role_fk,
        roleTable.id_role
      )
      .orderBy(asc(roleTable.id_role), desc(membro_equipeTable.dt_entrada));

    res.status(200).json(membros);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao buscar membros da equipe." });
  }
});

// buscar dados do membro da equipe autenticado para uma equipe específica 
app.get("/membro_equipe/me", verificarToken, async (req: AuthenticatedRequest, res) => {
  try {

    if (!req.user || typeof req.user !== "object" || !("id" in req.user)) {
      return res.status(401).json({ message: "Usuário não autenticado." });
    }

    const { id_equipe } = req.query;

    if (!id_equipe || isNaN(Number(id_equipe))) {
      return res.status(400).json({ message: "id_equipe inválido." });
    }

    const membro = await db
      .select()
      .from(membro_equipeTable)
      .where(and(
        eq(membro_equipeTable.id_usuario_fk, Number(req.user.id)),
        eq(membro_equipeTable.id_equipe_fk, Number(id_equipe))
      ))
      .limit(1);

    if (membro.length === 0) {
      return res.status(404).json({ message: "Usuário não pertence à equipe." });
    }

    res.status(200).json({
      id: membro[0]!.id_usuario_fk,
      id_role_fk: membro[0]!.id_role_fk
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao buscar usuário na equipe." });
  }
});

// promover membro da equipe a admin 
app.put("/membro_equipe/:id_membro/promover", verificarToken, async (req: AuthenticatedRequest, res) => {
  try {

    if (!req.user || typeof req.user !== "object" || !("id" in req.user)) {
      return res.status(401).json({ message: "Usuário não autenticado." });
    }

    const { id_membro } = req.params;
    const id = Number(id_membro);

    if (!id || isNaN(id)) {
      return res.status(400).json({ message: "id_membro inválido." });
    }

    const membro = await db
      .select()
      .from(membro_equipeTable)
      .where(eq(membro_equipeTable.id_membro, id))
      .limit(1);

    if (membro.length === 0) {
      return res.status(404).json({ message: "Membro da equipe não encontrado." });
    }

    const equipe = await db
      .select()
      .from(equipeTable)
      .where(eq(equipeTable.id_equipe, membro[0]!.id_equipe_fk))
      .limit(1);

    if (equipe.length === 0) {
      return res.status(404).json({ message: "Equipe não encontrada." });
    }

    if (equipe[0]!.id_criador_fk !== Number(req.user.id)) {
      return res.status(403).json({ message: "Apenas o criador da equipe pode promover membros." });
    }

    if (membro[0]!.id_usuario_fk === Number(req.user.id)) {
      return res.status(400).json({ message: "O dono não pode alterar o próprio cargo." });
    }

    if (membro[0]!.id_role_fk === 2) {
      return res.status(400).json({ message: "Membro já é admin." });
    }

    const result = await db
      .update(membro_equipeTable)
      .set({ id_role_fk: 2 })
      .where(eq(membro_equipeTable.id_membro, id))
      .returning();

    if (result.length === 0) {
      return res.status(404).json({ message: "Membro da equipe não encontrado." });
    }

    res.status(200).json({ message: "Membro promovido a admin com sucesso." });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao promover membro da equipe." });
  }
});

// remover membro da equipe (somente para admins e dono, sem remover o dono)
app.delete("/membro_equipe/:id_membro", verificarToken, async (req: AuthenticatedRequest, res) => {
  try {

    if (!req.user || typeof req.user !== "object" || !("id" in req.user)) {
      return res.status(401).json({ message: "Usuário não autenticado." });
    }

    const { id_membro } = req.params;

    const membroAlvo = await db
      .select()
      .from(membro_equipeTable)
      .where(eq(membro_equipeTable.id_membro, Number(id_membro)))
      .limit(1);

    if (membroAlvo.length === 0) {
      return res.status(404).json({ message: "Membro da equipe não encontrado." });
    }

    const userEquipe = await db
      .select()
      .from(membro_equipeTable)
      .where(and(
        eq(membro_equipeTable.id_usuario_fk, Number(req.user.id)),
        eq(membro_equipeTable.id_equipe_fk, membroAlvo[0]!.id_equipe_fk)
      ))
      .limit(1);

    if (userEquipe.length === 0) {
      return res.status(403).json({ message: "Usuário não é membro da equipe." });
    }

    const roleUser = userEquipe[0]!.id_role_fk;
    const roleAlvo = membroAlvo[0]!.id_role_fk;

    if (roleUser !== 1 && roleUser >= roleAlvo) {
      return res.status(403).json({
        message: "Você não pode remover um membro com cargo igual ou superior ao seu."
      });
    }

    if (req.user.id === membroAlvo[0]!.id_usuario_fk) {
      return res.status(403).json({ message: "Você não pode remover a si mesmo da equipe." });
    }

    if (roleAlvo === 1) {
      return res.status(403).json({
        message: "O dono da equipe não pode ser removido."
      });
    }

    const result = await db
      .delete(membro_equipeTable)
      .where(eq(membro_equipeTable.id_membro, Number(id_membro)))
      .returning();

    if (result.length === 0) {
      return res.status(404).json({ message: "Membro da equipe não encontrado." });
    }

    res.status(200).json({ message: "Membro da equipe removido com sucesso." });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao remover membro da equipe." });
  }
});

// Criar tarefa com atribuição individual ou para equipe
app.post("/tarefa", verificarToken, async (req: AuthenticatedRequest, res) => {
  try {

    const {
      titulo, descricao, dt_vencimento, pontuacao, prioridade, id_categoria_fk, id_criador_fk, email_responsavel, id_equipe_fk, tipo_atribuicao } = req.body;

    if (!tipo_atribuicao) {
      return res.status(400).json({ message: "tipo_atribuicao obrigatório" });
    }

    const novaTarefa = await db.transaction(async (tx) => {

      const result = await tx.insert(tarefaTable).values({
        titulo,
        descricao,
        dt_vencimento,
        pontuacao: Number(pontuacao),
        id_prioridade_fk: prioridade,
        id_status_fk: 1,
        id_criador_fk: req.user && typeof req.user === 'object' && 'id' in req.user ? req.user.id : id_criador_fk,
        id_categoria_fk,
        id_equipe_fk: tipo_atribuicao === "equipe" ? id_equipe_fk : null,
      }).returning();

      const idTarefa = result[0]!.id_tarefa;

      let inserts: any[] = [];

      if (tipo_atribuicao === "individual") {
        if (!email_responsavel) {
          throw new Error("Email obrigatório");
        }

        const responsavel = await tx
          .select()
          .from(usuarioTable)
          .where(eq(usuarioTable.email, email_responsavel))
          .limit(1);

        if (responsavel.length === 0) {
          throw new Error("Usuário não encontrado");
        }

        inserts = [{
          id_usuario_fk: responsavel[0]!.id_usuario,
          id_tarefa_fk: idTarefa
        }];
      }

      if (tipo_atribuicao === "equipe") {
        if (!id_equipe_fk) {
          throw new Error("Equipe obrigatória");
        }

        const membros = await tx
          .select()
          .from(membro_equipeTable)
          .where(eq(membro_equipeTable.id_equipe_fk, Number(id_equipe_fk)));

        if (membros.length === 0) {
          throw new Error("Equipe sem membros");
        }

        const usuariosUnicos = [...new Set(membros.map(m => m.id_usuario_fk))];

        inserts = usuariosUnicos.map(idUsuario => ({
          id_usuario_fk: idUsuario,
          id_tarefa_fk: idTarefa
        }));
      }

      if (inserts.length === 0) {
        throw new Error("Nenhum responsável válido");
      }

      await tx.insert(responsavel_tarefaTable)
        .values(inserts)
        .onConflictDoNothing();

      const inserted = await tx
        .select()
        .from(responsavel_tarefaTable)
        .where(eq(responsavel_tarefaTable.id_tarefa_fk, idTarefa));

      const idsEsperados = inserts.map(i => i.id_usuario_fk);
      const idsInseridos = inserted.map(i => i.id_usuario_fk);

      const todosInseridos = idsEsperados.every(id => idsInseridos.includes(id));

      if (!todosInseridos) {
        throw new Error("Nem todos os usuários foram atribuídos");
      }

      return result[0];
    });

    return res.status(201).json({ id: novaTarefa?.id_tarefa, novaTarefa });

  } catch (error: any) {
    console.error("ERRO:", error);

    return res.status(400).json({
      message: error.message || "Erro ao criar tarefa"
    });
  }
});

// Buscar tarefas criadas e/ou atribuidas ao usuário autenticado
app.get("/tarefas", verificarToken, async (req: AuthenticatedRequest, res) => {
  try {

    if (!req.user || typeof req.user !== "object" || !("id" in req.user)) {
      return res.status(401).json({ message: "Usuário não autenticado." });
    }

    const search = req.query.search as string | undefined;

    const id_usuario = (req.user as { id: number }).id;

    const tipo_tarefa = req.query.tipo_tarefa as string | undefined;

    const condicoes: SQL[] = [];

    if (tipo_tarefa === "atribuida") {
      condicoes.push(eq(responsavel_tarefaTable.id_usuario_fk, id_usuario));
    } else if (tipo_tarefa === "criada") {
      condicoes.push(eq(tarefaTable.id_criador_fk, id_usuario));
    }

    if (search) {
      condicoes.push(ilike(tarefaTable.titulo, `%${search}%`));
    }

    const tarefas = await db
      .select({
        id_tarefa: tarefaTable.id_tarefa,
        titulo: tarefaTable.titulo,
        descricao: tarefaTable.descricao,
        dt_vencimento: tarefaTable.dt_vencimento,
        pontuacao: tarefaTable.pontuacao,
        id_equipe_fk: tarefaTable.id_equipe_fk,
        id_responsavel: responsavel_tarefaTable.id_usuario_fk,
        status: status_tarefaTable.nome,
        prioridade: tipo_prioridadeTable.nome,
        responsavel: sql<string>`
        CASE 
          WHEN ${tarefaTable.id_equipe_fk} IS NOT NULL THEN ${equipeTable.nome}
          ELSE ${usuarioTable.nome}
        END
        `,
        tipo_responsavel: sql<string>`
        CASE 
          WHEN ${tarefaTable.id_equipe_fk} IS NOT NULL THEN 'equipe'
          ELSE 'usuario'
        END
        `,
      })

      .from(tarefaTable)

      .leftJoin(responsavel_tarefaTable, eq(tarefaTable.id_tarefa, responsavel_tarefaTable.id_tarefa_fk))
      .leftJoin(equipeTable, eq(tarefaTable.id_equipe_fk, equipeTable.id_equipe))
      .leftJoin(usuarioTable, eq(responsavel_tarefaTable.id_usuario_fk, usuarioTable.id_usuario))
      .leftJoin(status_tarefaTable, eq(tarefaTable.id_status_fk, status_tarefaTable.id_status))
      .leftJoin(tipo_prioridadeTable, eq(tarefaTable.id_prioridade_fk, tipo_prioridadeTable.id_prioridade))

      .where(condicoes.length > 0 ? and(...condicoes) : sql`true`)

      .orderBy(desc(tipo_prioridadeTable.id_prioridade), asc(tarefaTable.dt_vencimento));

    res.status(200).json(tarefas);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao buscar tarefas." });
  }
});

// Buscar detalhes tarefa para inject
app.get("/tarefas/:id", verificarToken, async (req: AuthenticatedRequest, res) => {
  try {

    const { id } = req.params;

    if (!req.user || typeof req.user !== "object" || !("id" in req.user)) {
      return res.status(401).json({ message: "Usuário não autenticado." });
    }

    const criadorTable = alias(usuarioTable, "criador");
    const responsavelTable = alias(usuarioTable, "responsavel");
    const tarefa = await db
      .select({
        id_tarefa: tarefaTable.id_tarefa,
        titulo: tarefaTable.titulo,
        descricao: tarefaTable.descricao,
        dt_vencimento: tarefaTable.dt_vencimento,
        pontuacao: tarefaTable.pontuacao,

        criador_nome: criadorTable.nome,
        responsavel: sql<string>`
        CASE 
          WHEN ${tarefaTable.id_equipe_fk} IS NOT NULL THEN ${equipeTable.nome}
          ELSE ${responsavelTable.nome}
        END
      `,
        tipo_responsavel: sql<string>`
        CASE 
          WHEN ${tarefaTable.id_equipe_fk} IS NOT NULL THEN 'equipe'
          ELSE 'usuario'
        END
      `,

        status: status_tarefaTable.nome,
        prioridade: tipo_prioridadeTable.nome
      })

      .from(tarefaTable)

      .leftJoin(responsavel_tarefaTable, eq(tarefaTable.id_tarefa, responsavel_tarefaTable.id_tarefa_fk))
      .leftJoin(responsavelTable, eq(responsavel_tarefaTable.id_usuario_fk, responsavelTable.id_usuario))
      .leftJoin(criadorTable, eq(tarefaTable.id_criador_fk, criadorTable.id_usuario))

      .leftJoin(equipeTable, eq(tarefaTable.id_equipe_fk, equipeTable.id_equipe))
      .leftJoin(status_tarefaTable, eq(tarefaTable.id_status_fk, status_tarefaTable.id_status))
      .leftJoin(tipo_prioridadeTable, eq(tarefaTable.id_prioridade_fk, tipo_prioridadeTable.id_prioridade))

      .where(eq(tarefaTable.id_tarefa, Number(id)))
      .limit(1);

    if (tarefa.length === 0) {
      return res.status(404).json({ message: "Tarefa não encontrada." });
    }

    res.status(200).json(tarefa[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao buscar tarefas" })
  }
});

// enviar anexo tarefa
app.post("/tarefas/:id/anexo", verificarToken, upload.array("anexo"), async (req: AuthenticatedRequest, res) => {
  try {

    const { id } = req.params;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({ message: "Nenhum arquivo enviado." });
    }

    if (!req.user || typeof req.user !== "object" || !("id" in req.user)) {
      return res.status(401).json({ message: "Usuário não autenticado." });
    }

    const id_usuario = (req.user as { id: number }).id;

    const anexos = files.map(file => ({
      url_caminho: `uploads/${file.filename}`,
      nome_original: file.originalname,
      mime_type: file.mimetype,
      id_tarefa_fk: Number(id),
      id_usuario_envio_fk: id_usuario,
      dt_envio: new Date()
    }));

    await db.insert(anexoTable).values(anexos);

    res.status(201).json(anexos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao enviar anexo." });
  }
}
);

// atualizar dados da tarefa (somente criador)
app.put("/tarefas/:id", verificarToken, async (req: AuthenticatedRequest, res) => {
  try {

    if (!req.user || typeof req.user !== "object" || !("id" in req.user)) {
      return res.status(401).json({ message: "Usuário não autenticado." });
    }
    const { id } = req.params;
    const { titulo, descricao, dt_vencimento, pontuacao, id_criador_fk } = req.body;

    const result = await db.update(tarefaTable)
      .set({ titulo, descricao, dt_vencimento, pontuacao, id_criador_fk })
      .where(eq(tarefaTable.id_tarefa, Number(id)))
      .returning();

    if (result.length === 0) {
      return res.status(404).json({ message: "Tarefa não encontrada." });
    }

    res.status(200).json({ message: "Tarefa atualizada com sucesso." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao atualizar tarefa." });
  }
});

// deletar tarefa
app.delete("/tarefas/:id", verificarToken, async (req: AuthenticatedRequest, res) => {
  try {

    if (!req.user || typeof req.user !== "object" || !("id" in req.user)) {
      return res.status(401).json({ message: "Usuário não autenticado." });
    }
    const { id } = req.params;

    const result = await db.delete(tarefaTable)
      .where(eq(tarefaTable.id_tarefa, Number(id)))
      .returning();
    if (result.length === 0) {
      return res.status(404).json({ message: "Tarefa não encontrada." });
    }

    res.status(200).json({ message: "Tarefa removida com sucesso." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao remover tarefa." });
  }
});

// atualizar anexos da tarefa 
app.put("/tarefas/:id/anexo", verificarToken, upload.array("anexo"), async (req: AuthenticatedRequest, res) => {
  try {

    const { id } = req.params;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({ message: "Nenhum arquivo enviado." });
    }
    if (!req.user || typeof req.user !== "object" || !("id" in req.user)) {
      return res.status(401).json({ message: "Usuário não autenticado." });
    }

    const id_usuario = (req.user as { id: number }).id;

    const anexos = files.map(file => ({
      url_caminho: `uploads/${file.filename}`,
      nome_original: file.originalname,
      mime_type: file.mimetype,
      id_tarefa_fk: Number(id),
      id_usuario_envio_fk: id_usuario,
      dt_envio: new Date()
    }));

    await db.insert(anexoTable).values(anexos);

    res.status(200).json(anexos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao atualizar anexos." });
  }
});

// deletar anexo da tarefa
app.delete("/tarefas/:id/anexo/:id_anexo", verificarToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { id, id_anexo } = req.params;

    const idTarefa = Number(id);
    const idAnexo = Number(id_anexo);

    if (isNaN(idTarefa) || isNaN(idAnexo)) {
      return res.status(400).json({ message: "IDs inválidos." });
    }

    if (!req.user || typeof req.user !== "object" || !("id" in req.user)) {
      return res.status(401).json({ message: "Usuário não autenticado." });
    }

    console.log(req.params);

    const anexo = await db
      .select()
      .from(anexoTable)
      .where(and(eq(anexoTable.id_anexo, Number(id_anexo)), eq(anexoTable.id_tarefa_fk, Number(id))))
      .limit(1);

    if (anexo.length === 0) {
      return res.status(404).json({ message: "Anexo não encontrado para esta tarefa." });
    }

    await db.delete(anexoTable)
      .where(and(eq(anexoTable.id_anexo, Number(id_anexo)), eq(anexoTable.id_tarefa_fk, Number(id))));

    const filePath = path.join(process.cwd(), anexo[0]!.url_caminho);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.status(200).json({ message: "Anexo removido com sucesso." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao remover anexo." });
  }
});

// buscar anexo de tarefas
app.get("/anexo/:id_tarefa", verificarToken, async (req, res) => {
  try {

    const { id_tarefa } = req.params;

    const anexos = await db
      .select()
      .from(anexoTable)
      .where(eq(anexoTable.id_tarefa_fk, Number(id_tarefa)));

    res.json(anexos);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar anexos" });
  }
});

// Download de anexo das tarefas
app.get("/anexo/download/:nome", verificarToken, (req: AuthenticatedRequest, res) => {
  try {

    const nomeArquivo = req.params.nome;

    if (!nomeArquivo) {
      return res.status(400).json({ message: "Nome do arquivo não informado" });
    }

    const filePath = path.join(process.cwd(), "uploads", nomeArquivo);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "Arquivo não encontrado" });
    }

    return res.download(filePath);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao baixar arquivo" });
  }
});

app.listen(3000, () => console.log("Servidor rodando na porta 3000"));