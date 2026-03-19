import express from "express";
import { db } from "./db.ts";
import { status_tarefaTable, tarefaTable, tipo_prioridadeTable, usuarioTable, responsavel_tarefaTable, equipeTable, membro_equipeTable, roleTable } from "./db/schema.ts";
import { calculateMd5Hash } from "./hash.ts";
import cors from "cors";
import authRoutes from './authRoutes.ts';
import { verificarToken } from './authMiddleware.ts';
import { and, eq, ilike, sql, asc, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import e from "express";

type AuthenticatedRequest = express.Request & { user?: string | object };

const app = express();

app.use(cors());
app.use(express.json());

app.use(authRoutes);

app.get("/usuarios", verificarToken, async (req, res) => {
  res.json({ mensagem: "Acesso autorizado a usuários." });
});

// criar usuario
app.post("/usuarios", async (req, res) => {
  const { nome, cpf, telefone, email, senha } = req.body;

  const senha_hash = calculateMd5Hash(senha);

  const result = await db.insert(usuarioTable).values({
    nome,
    cpf,
    telefone,
    email,
    senha_hash
  }).returning();

  res.status(201).json(result);
});

// criar equipe
app.post("/equipe", verificarToken, async (req: AuthenticatedRequest, res) => {
  const { nome, descricao } = req.body;

  if (!req.user || typeof req.user !== "object" || !("id" in req.user)) {
    return res.status(401).json({ message: "Usuário não autenticado." });
  }

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
});

// buscar equipes do usuário autenticado
app.get("/equipe", verificarToken, async (req: AuthenticatedRequest, res) => {
  if (!req.user || typeof req.user !== 'object' || !('id' in req.user)) {
    return res.status(401).json({ message: 'Usuário não autenticado.' });
  }
  const id_usuario = req.user.id as number;

  const search = req.query.search as string | undefined;
  let filtroNome = undefined;

  if (search) {
    filtroNome = ilike(equipeTable.nome, `%${search}%`);
  }

  try {
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
});

// buscar membros da equipe
app.get("/membro_equipe", verificarToken, async (req: AuthenticatedRequest, res) => {

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

  try {

    const membros = await db
      .select({
        id_membro: membro_equipeTable.id_membro,
        nome: usuarioTable.nome,
        cargo: roleTable.nome,
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
        roleTable.id_role
      )

      .orderBy(asc(roleTable.id_role), desc(membro_equipeTable.dt_entrada));

    res.status(200).json(membros);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao buscar membros da equipe." });
  }

});

app.post("/tarefa", verificarToken, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      titulo, descricao, dt_vencimento, pontuacao, prioridade, id_categoria_fk, id_criador_fk, email_responsavel, id_equipe_fk, tipo_atribuicao } = req.body;
    if (!tipo_atribuicao) {
      return res.status(400).json({ message: "tipo_atribuicao obrigatório" });
    }

    await db.transaction(async (tx) => {
      
      // cria tarefa
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
      
      // ATRIBUIR INDIVIDUAL
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
        
        // ATRIBUIR PARA EQUIPE
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
        
        // remove duplicados
        const usuariosUnicos = [...new Set(membros.map(m => m.id_usuario_fk))];
        
        inserts = usuariosUnicos.map(idUsuario => ({
          id_usuario_fk: idUsuario,
          id_tarefa_fk: idTarefa
        }));
      }
      
      // VALIDAÇÃO FINAL
      if (inserts.length === 0) {
        throw new Error("Nenhum responsável válido");
      }
      
      // INSERT com proteção contra duplicado
      await tx.insert(responsavel_tarefaTable)
      .values(inserts)
      .onConflictDoNothing();
      
      // GARANTE que todos foram inseridos
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
      
      res.status(201).json({ message: "Tarefa criada com sucesso" });
    });
    
  } catch (error: any) {
    console.error("ERRO:", error);
    
    return res.status(400).json({
      message: error.message || "Erro ao criar tarefa"
    });
  }
});

// buscar tarefas do usuário autenticado

app.get("/tarefas", verificarToken, async (req: AuthenticatedRequest, res) => {
  if (!req.user || typeof req.user !== "object" || !("id" in req.user)) {
    return res.status(401).json({ message: "Usuário não autenticado." });
  }

  const search = req.query.search as string | undefined;

  const id_usuario = req.user.id as number;
  let filtroTitulo = undefined;

  if (search) {
    filtroTitulo = ilike(tarefaTable.titulo, `%${search}%`);
  }

  try {
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
        prioridade: tipo_prioridadeTable.nome
      })

      .from(tarefaTable)

      .leftJoin(responsavel_tarefaTable, eq(tarefaTable.id_tarefa, responsavel_tarefaTable.id_tarefa_fk))
      .leftJoin(status_tarefaTable, eq(tarefaTable.id_status_fk, status_tarefaTable.id_status))
      .leftJoin(tipo_prioridadeTable, eq(tarefaTable.id_prioridade_fk, tipo_prioridadeTable.id_prioridade))

      .where(and(eq(responsavel_tarefaTable.id_usuario_fk, id_usuario), filtroTitulo))

      .orderBy(desc(tipo_prioridadeTable.id_prioridade), asc(tarefaTable.dt_vencimento));

    res.status(200).json(tarefas);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao buscar tarefas." });
  }
});

app.get("/tarefas/:id", verificarToken, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;

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
      responsavel_nome: responsavelTable.nome,
      equipe_nome: equipeTable.nome,

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

  res.json(tarefa[0]);
});

app.listen(3000, () => console.log("Servidor rodando na porta 3000"));

