import express from "express";
import { db } from "./db.ts";
import { status_tarefaTable, tarefaTable, tipo_prioridadeTable, usuarioTable, } from "./db/schema.ts";
import { calculateMd5Hash } from "./hash.ts";
import cors from "cors";
import authRoutes from './authRoutes.ts';
import { verificarToken } from './authMiddleware.ts';
import { and, eq, ilike } from "drizzle-orm";

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
    senha_hash,
    id_tipo_usuario_fk: 3, // comum
  }).returning();

  res.status(201).json(result);
});

// criar tarefa

app.post("/tarefa", verificarToken, async (req: AuthenticatedRequest, res) => {
  const { titulo, descricao, dt_vencimento, pontuacao, prioridade, id_categoria_fk, id_criador_fk, email_responsavel } = req.body;
  console.log(req.body);

  const responsavel = await db
    .select()
    .from(usuarioTable)
    .where(eq(usuarioTable.email, email_responsavel))
    .limit(1);

  if (responsavel.length === 0) {
    return res.status(400).json({ message: 'Usuário responsável não encontrado.' });
  }

  const result = await db.insert(tarefaTable).values({
    titulo,
    descricao,
    dt_vencimento,
    pontuacao,
    id_prioridade_fk: prioridade,
    id_status_fk: 1, // Pendente
    id_criador_fk: req.user && typeof req.user === 'object' && 'id' in req.user ? req.user.id : id_criador_fk,
    id_responsavel_fk: responsavel[0]?.id_usuario,
    id_categoria_fk,
  }).returning();

  res.status(201).json(result);
});

// buscar tarefas do usuário autenticado

app.get("/tarefas", verificarToken, async (req: AuthenticatedRequest, res) => {
  if (!req.user || typeof req.user !== 'object' || !('id' in req.user)) {
    return res.status(401).json({ message: 'Usuário não autenticado.' });
  }

  const search = req.query.search as string | undefined;

  const id_usuario = req.user.id as number;
  let filtroTitulo = undefined;

  if (search) {
    filtroTitulo = ilike(tarefaTable.titulo, `%${search}%`);
  }

  try {
    // Busca tarefas do usuário autenticado
    const tarefas = await db
      .select({
        id_tarefa: tarefaTable.id_tarefa,
        titulo: tarefaTable.titulo,
        descricao: tarefaTable.descricao,
        dt_vencimento: tarefaTable.dt_vencimento,
        pontuacao: tarefaTable.pontuacao,
        id_responsavel_fk: tarefaTable.id_responsavel_fk,
        nome_responsavel: usuarioTable.nome,
        status: status_tarefaTable.nome,
        prioridade: tipo_prioridadeTable.nome,
      })
      .from(tarefaTable)
      .where(and(eq(tarefaTable.id_responsavel_fk, id_usuario), filtroTitulo))
      .leftJoin(usuarioTable, eq(tarefaTable.id_responsavel_fk, usuarioTable.id_usuario))
      .leftJoin(status_tarefaTable, eq(tarefaTable.id_status_fk, status_tarefaTable.id_status))
      .leftJoin(tipo_prioridadeTable, eq(tarefaTable.id_prioridade_fk, tipo_prioridadeTable.id_prioridade))
    
    res.status(200).json(tarefas);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao buscar tarefas.' });
  }
});

app.get("/tarefas/:id", verificarToken, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const tarefa = await db
    .select()
    .from(tarefaTable)
    .where(eq(tarefaTable.id_tarefa, Number(id)))
    .limit(1);
  if (tarefa.length === 0) {
    return res.status(404).json({ message: 'Tarefa não encontrada.' });
  }
  res.json(tarefa[0]);
});

app.listen(3000, () => console.log("Servidor rodando na porta 3000"));

