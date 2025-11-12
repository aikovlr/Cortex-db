import { integer, pgTable, varchar, timestamp} from "drizzle-orm/pg-core";

export const usuarioTable = pgTable('usuario', {
    id_usuario: integer('id_usuario').primaryKey().generatedAlwaysAsIdentity(),
    nome: varchar('nome', {length: 255}).notNull(),
    cpf: varchar('cpf', {length: 14}).notNull().unique(),
    telefone: varchar('telefone', {length: 20}).notNull(),
    email: varchar('email', {length: 255}).notNull().unique(),
    senha_hash: varchar('senha_hash', {length: 255}).notNull(),
    dt_criacao: timestamp('dt_criacao').notNull().defaultNow(),
    id_tipo_usuario_fk: integer('id_tipo_usuario_fk')
        .notNull()
        .references(() => tipoUsuarioTable.id_tipo_usuario, { onDelete: 'restrict' }),
});

export const tipoUsuarioTable = pgTable('tipo_usuario', {
    id_tipo_usuario: integer('id_tipo_usuario').primaryKey().generatedAlwaysAsIdentity(),
    nome: varchar('nome', {length: 100}).notNull(),
});

export const tarefaTable = pgTable('tarefa', {
    id_tarefa: integer('id_tarefa').primaryKey().generatedAlwaysAsIdentity(),
    titulo: varchar('titulo', {length: 255}).notNull(),
    descricao: varchar('descricao', {length: 1000}),
    dt_vencimento: varchar('dt_vencimento', {length: 50}).notNull(),
    pontuacao: integer('pontuacao'),
    id_prioridade_fk: integer('id_prioridade_fk')
        .references(() => tipo_prioridadeTable.id_prioridade, { onDelete: 'restrict' }),
    id_status_fk: integer('id_status_fk')
        .notNull()
        .references(() => status_tarefaTable.id_status, { onDelete: 'restrict' }),
    id_categoria_fk: integer('id_categoria_fk')
        .notNull()
        .references(() => categoriaTable.id_categoria, { onDelete: 'restrict' }),
    id_criador_fk: integer('id_criador_fk')
        .notNull()
        .references(() => usuarioTable.id_usuario, { onDelete: 'restrict' }),
    id_responsavel_fk: integer('id_responsavel_fk')
        .references(() => usuarioTable.id_usuario, { onDelete: 'restrict' }),
    dt_criacao: timestamp('dt_criacao').notNull().defaultNow(),
});

export const tipo_prioridadeTable = pgTable('prioridade', {
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
    descricao: varchar('descricao', {length: 255}).notNull()
});
