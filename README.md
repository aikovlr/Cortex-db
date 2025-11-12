# Cortex-db

Este repositório contém uma API simples em Node.js/TypeScript que utiliza Express, Drizzle ORM e PostgreSQL para gerenciar usuários e tarefas.

Conteúdo principal:
- Servidor Express em `src/server.ts`
- Configuração da conexão com o banco em `src/db.ts`
- Esquema (Drizzle) em `src/db/schema.ts`
- Configuração do Drizzle em `drizzle.config.ts`

## Sobre

A aplicação fornece endpoints para criação de usuários, autenticação (JWT) e operações básicas sobre tarefas. Foi feita com foco em facilidade de uso e como ponto de partida para um projeto maior.

## Pré-requisitos

- Node.js (recomenda-se v18+)
- npm
- PostgreSQL rodando (local ou remoto)

## Variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto com as variáveis abaixo (ambas são necessárias para o projeto rodar):

- `DATABASE_URL` — string de conexão do PostgreSQL. Exemplo:

  DATABASE_URL=postgres://usuario:senha@localhost:5432/nome_do_banco

- `JWT_SECRET` — string secreta usada para assinar/verificar tokens JWT (obrigatório). Exemplo:

  JWT_SECRET=minha_super_chave_secreta

Sugestão: adicione um arquivo `.env.example` (versão pública sem valores reais) contendo as chaves acima como referência para quem clonar o repositório.

## Instalação

No PowerShell (Windows):

```powershell
git clone <URL-DO-REPO>
cd Cortex-db
npm install
```

Crie o `.env` com a `DATABASE_URL` antes de iniciar o servidor.

## Executando o servidor

Para rodar em modo de desenvolvimento (usa `nodemon` e `ts-node`):

```powershell
npm run start
```

Observação: a variável `JWT_SECRET` precisa estar definida (no `.env` ou no ambiente) antes de iniciar o servidor; caso contrário o aplicativo lançará erro na inicialização.

O servidor por padrão escuta a porta `3000`.

## Endpoints principais

- POST /usuarios — cria um usuário
  - Corpo (JSON): `{ nome, cpf, telefone, email, senha }`

- POST /login — autentica e retorna um token JWT
  - Corpo (JSON): `{ email, senha }`
  - Retorna: `{ mensagem, token, nome }`

- GET /tarefas — (protegido) lista tarefas do usuário autenticado
  - Cabeçalho: `Authorization: Bearer <token>`

- POST /tarefa — (protegido) cria uma tarefa
  - Corpo (JSON): `{ titulo, descricao, dt_vencimento, pontuacao, prioridade, id_categoria_fk, id_criador_fk, email_responsavel }`
  - Observação: o endpoint procura o responsável pelo campo `email_responsavel` e usa o `id` do usuário autenticado como criador quando disponível.

- GET /tarefas/:id — (protegido) obtém uma tarefa por id

## Migrações / Esquema (Drizzle)

O projeto inclui `drizzle.config.ts` e uma definição de esquema em `src/db/schema.ts`.


O projeto inclui `drizzle-kit` nas devDependencies e já tem scripts no `package.json` para facilitar o trabalho com migrations. Duas opções:

1) Usando os scripts do projeto (recomendado):

```powershell
npm run drizzle:generate    # gera arquivos a partir do schema em ./drizzle
npm run drizzle:push        # aplica/push das migrations para o banco (verifique a config)
```

2) Usando o CLI diretamente via npx (equivalente):

```powershell
npx drizzle-kit generate --schema ./src/db/schema.ts --out ./drizzle
# ou para aplicar/push (verifique a documentação da versão instalada):
npx drizzle-kit push --config drizzle.config.ts
```

Se preferir, abra `src/db/schema.ts` e gere o SQL manualmente ou aplique os comandos SQL diretamente no seu banco.

## Exemplos rápidos (curl / PowerShell)

1) Criar usuário:

```powershell
curl -X POST http://localhost:3000/usuarios -H "Content-Type: application/json" -d '{"nome":"Fulano","cpf":"00000000000","telefone":"999999999","email":"fulano@exemplo.com","senha":"minhasenha"}'
```

2) Login e uso do token (exemplo simplificado):

```powershell
curl -X POST http://localhost:3000/login -H "Content-Type: application/json" -d '{"email":"fulano@exemplo.com","senha":"minhasenha"}'
# -> receberá um JSON com o campo `token`.

# usar o token para acessar rota protegida:
curl http://localhost:3000/tarefas -H "Authorization: Bearer <TOKEN_AQUI>"
```

## Observações e próximos passos sugeridos

- Mover a chave JWT para variável de ambiente (`JWT_SECRET`) e evitar hardcode.
- Adicionar scripts de migration no `package.json` para facilitar uso do `drizzle-kit`.
- Criar testes automatizados e validação de entrada (por exemplo, com `zod` ou `joi`).

## Estrutura rápida de arquivos

- `src/server.ts` — inicialização do Express e definição de rotas
- `src/db.ts` — inicialização do Drizzle com `DATABASE_URL`
- `src/db/schema.ts` — esquema/definição das tabelas (Drizzle)

---