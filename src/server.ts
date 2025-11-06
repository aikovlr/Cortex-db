import express from "express";
import { db } from "./db.ts";
import { usuarioTable } from "./db/schema.ts";
import { calculateMd5Hash } from "./hash.ts";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// exemplo: listar usuários
app.get("/usuarios", async (req, res) => {
  const result = await db.select().from(usuarioTable);
  res.json(result);
});

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

app.listen(3000, () => console.log("Servidor rodando na porta 3000"));
