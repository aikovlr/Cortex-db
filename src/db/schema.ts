import { desc } from "drizzle-orm";
import { integer, pgTable, varchar, timestamp} from "drizzle-orm/pg-core";

export const usuarioTable = pgTable('usuario', {
    id_usuario: integer('id_usuario').primaryKey().generatedAlwaysAsIdentity(),
    nome: varchar('nome', {length: 255}).notNull(),
    cpf: varchar('cpf', {length: 14}).notNull().unique(),
    telefone: varchar('telefone', {length: 20}).notNull(),
    email: varchar('email', {length: 255}).notNull().unique(),
    senha_hash: varchar('senha_hash', {length: 255}).notNull(),
    dt_criacao: timestamp('dt_criacao').notNull().defaultNow(),
});

export const equipeTable = pgTable('equipe', {
    id_equipe: integer('id_equipe').primaryKey().generatedAlwaysAsIdentity(),
    nome: varchar('nome', {length: 255}).notNull(),
    descricao: varchar('descricao', {length: 1000}),
    id_criador_fk: integer('id_criador_fk')
        .notNull()
        .references(() => usuarioTable.id_usuario, { onDelete: 'restrict' }),
    dt_criacao: timestamp('dt_criacao').notNull().defaultNow(),
});

export const membro_equipeTable = pgTable('membro_equipe', {
    id_membro: integer('id_membro').primaryKey().generatedAlwaysAsIdentity(),
    id_usuario_fk: integer('id_usuario_fk')
        .notNull()
        .references(() => usuarioTable.id_usuario, { onDelete: 'restrict' }),
    id_equipe_fk: integer('id_equipe_fk')
        .notNull()
        .references(() => equipeTable.id_equipe, { onDelete: 'restrict' }),
    id_role_fk: integer('id_role_fk')
        .notNull()
        .references(() => roleTable.id_role, { onDelete: 'restrict' }),
    dt_entrada: timestamp('dt_entrada').defaultNow().notNull(),
});

export const roleTable = pgTable('role', {
    id_role: integer('id_role').primaryKey().generatedAlwaysAsIdentity(),
    nome: varchar('nome', {length: 50}).notNull(),
    descricao: varchar('descricao', {length: 255}),
});

export const tarefaTable = pgTable('tarefa', {
    id_tarefa: integer('id_tarefa').primaryKey().generatedAlwaysAsIdentity(),
    titulo: varchar('titulo', {length: 255}).notNull(),
    descricao: varchar('descricao', {length: 1000}),
    dt_vencimento: varchar('dt_vencimento', {length: 50}).notNull(),
    pontuacao: integer('pontuacao'),
    id_prioridade_fk: integer('id_prioridade_fk')
        .references(() => tipo_prioridadeTable.id_prioridade, { onDelete: 'restrict' }),
    id_equipe_fk: integer('id_equipe_fk')
        .references(() => equipeTable.id_equipe, { onDelete: 'restrict' }),
    deletado_em: timestamp('deletado_em'),
    id_status_fk: integer('id_status_fk')
        .notNull()
        .references(() => status_tarefaTable.id_status, { onDelete: 'restrict' }),
    id_categoria_fk: integer('id_categoria_fk')
        .notNull()
        .references(() => categoriaTable.id_categoria, { onDelete: 'restrict' }),
    id_criador_fk: integer('id_criador_fk')
        .notNull()
        .references(() => usuarioTable.id_usuario, { onDelete: 'restrict' }),
    dt_criacao: timestamp('dt_criacao').notNull().defaultNow(),
});

export const responsavel_tarefaTable = pgTable('responsavel_tarefa', {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    id_usuario_fk: integer('id_usuario_fk')
        .notNull()
        .references(() => usuarioTable.id_usuario, { onDelete: 'restrict' }),
    id_tarefa_fk: integer('id_tarefa_fk')
        .notNull()
        .references(() => tarefaTable.id_tarefa, { onDelete: 'restrict' }),
});

export const ticket_tarefaTable = pgTable('ticket_tarefa', {
    id_ticket_tarefa: integer('id_ticket_tarefa').primaryKey().generatedAlwaysAsIdentity(),
    id_tarefa_fk: integer('id_tarefa_fk')
        .notNull()
        .references(() => tarefaTable.id_tarefa, { onDelete: 'restrict' }),
    id_usuario_fk: integer('id_usuario_fk')
        .notNull()
        .references(() => usuarioTable.id_usuario, { onDelete: 'restrict' }),
    tipo_ticket: varchar('tipo_ticket', {length: 20}).notNull(),
    motivo: varchar('motivo', {length: 100}).notNull(),
    descricao: varchar('descricao', {length: 1000}),
    dt_criacao: timestamp('dt_criacao').notNull().defaultNow(),
});

export const tipo_prioridadeTable = pgTable('tipo_prioridade', {
    id_prioridade: integer('id_prioridade').primaryKey().generatedAlwaysAsIdentity(),
    nome: varchar('nome', {length: 20}).notNull()
});

export const status_tarefaTable = pgTable('status_tarefa', {
    id_status: integer('id_status').primaryKey().generatedAlwaysAsIdentity(),
    nome: varchar('nome', {length: 20}).notNull()
});

export const categoriaTable = pgTable('categoria', {
    id_categoria: integer('id_categoria').primaryKey().generatedAlwaysAsIdentity(),
    nome: varchar('nome', {length: 50}).notNull(),
    descricao: varchar('descricao', {length: 255}).notNull(),
    id_usuario_fk: integer('id_usuario_fk')
        .notNull()
        .references(() => usuarioTable.id_usuario, { onDelete: 'restrict' }),
});

export const anexoTable = pgTable('anexo', {
    id_anexo: integer('id_anexo').primaryKey().generatedAlwaysAsIdentity(),
    url_caminho: varchar('url_caminho', {length: 255}).notNull(),
    nome_original: varchar('nome_original', {length: 255}).notNull(),
    mime_type: varchar('mime_type', {length: 100}).notNull(),
    id_tarefa_fk: integer('id_tarefa_fk')
        .notNull()
        .references(() => tarefaTable.id_tarefa, { onDelete: 'cascade' }),
    id_usuario_envio_fk: integer('id_usuario_envio_fk')
        .notNull()
        .references(() => usuarioTable.id_usuario, { onDelete: 'restrict' }),
    dt_envio: timestamp('dt_envio').notNull().defaultNow(),
});

export const notificacaoTable = pgTable('notificacao', {
    id_notificacao: integer('id_notificacao').primaryKey().generatedAlwaysAsIdentity(),
    id_usuario_fk: integer('id_usuario_fk')
        .notNull()
        .references(() => usuarioTable.id_usuario, { onDelete: 'restrict' }),
    titulo: varchar('titulo', {length: 150}).notNull(),
    mensagem: varchar('mensagem', {length: 255}).notNull(),
    lida: integer('lida').notNull().default(0),
    dt_envio: timestamp('dt_envio').notNull().defaultNow(),
    tipo: varchar('tipo', {length: 30}).notNull(),
});

