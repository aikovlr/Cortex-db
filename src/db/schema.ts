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
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    titulo: varchar('titulo', {length: 255}).notNull(),
    descricao: varchar('descricao', {length: 1000}).notNull(),
    dt_vencimento: varchar('dt_vencimento', {length: 50}).notNull(),
    pontuacao: integer('pontuacao').notNull(),
    usuario_id: integer('usuario_id')
        .notNull()
        .references(() => usuarioTable.id_usuario, { onDelete: 'restrict' }),
});



