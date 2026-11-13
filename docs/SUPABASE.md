# Usando o Supabase como banco

O Routinely usa PostgreSQL via Prisma. Localmente o banco é o serviço `db` do Docker Compose; em produção basta trocar duas variáveis de ambiente para usar o Supabase.

## Por que duas URLs

O `schema.prisma` declara:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL") // runtime
  directUrl = env("DIRECT_URL")   // migrations
}
```

- **`DATABASE_URL`** é usada pela aplicação.
- **`DIRECT_URL`** é usada pelo `prisma migrate`, que precisa de uma conexão de **sessão**: o modo _transaction_ do pooler (porta `6543`) não suporta os comandos que as migrations executam.

## Qual string usar

O Supabase oferece três formas de conectar. No plano gratuito, a **conexão direta** (`db.<ref>.supabase.co`) é só IPv6, e hospedagens sem IPv6 de saída (como o plano grátis do Render) não a alcançam. O **Session pooler** (porta `5432`) é IPv4 em todos os planos, serve a processos de longa duração (o container da API) e também roda migrations.

| Cenário                                        | `DATABASE_URL`                                 | `DIRECT_URL`                     |
| ---------------------------------------------- | ---------------------------------------------- | -------------------------------- |
| Produção (API em container, sem IPv6 de saída) | Session pooler (`5432`)                        | a mesma Session pooler           |
| Ambiente com IPv6 ou serverless                | Transaction pooler (`6543`, `?pgbouncer=true`) | Session pooler ou conexão direta |

O deploy descrito em [`DEPLOY.md`](DEPLOY.md) usa a primeira linha.

## Passo a passo

1. Crie um projeto em https://supabase.com e anote a senha do banco. Prefira uma senha só com letras e números: caracteres especiais precisam de _URL encode_.
2. No painel, abra **Connect**, escolha _Type_ = **URI** e _Method_ = **Session pooler**.
3. Configure as variáveis (no `.env` ou no provedor de hospedagem da API):

   ```bash
   DATABASE_URL="postgresql://postgres.<ref>:<senha>@aws-<n>-<regiao>.pooler.supabase.com:5432/postgres"
   DIRECT_URL="postgresql://postgres.<ref>:<senha>@aws-<n>-<regiao>.pooler.supabase.com:5432/postgres"
   ```

   Se optar pelo Transaction pooler no runtime, use a porta `6543` com `?pgbouncer=true` (desativa _prepared statements_) e `connection_limit` adequado (`1` em serverless; maior em servidor de longa duração).

4. Aplique as migrations (o seed só serve a bancos de desenvolvimento):

   ```bash
   pnpm --filter @routinely/api prisma:deploy
   ```

   No `docker compose`, o serviço `migrate` (stage `migrate` do Dockerfile) faz isso antes de a API subir. Em produção, o workflow de deploy roda `prisma migrate deploy` antes de publicar o código.

5. Suba a API apontando para o Supabase. Com Docker Compose, o serviço `db` deixa de ser necessário: sobrescreva `DATABASE_URL`/`DIRECT_URL` do serviço `api` (por exemplo, em um `docker-compose.override.yml`) e remova o `depends_on: db`.

## Autenticação

O login é da própria API (e-mail + senha, cookies httpOnly; ver ADR-023), **independente do Supabase**: o Supabase aqui é só o Postgres. Ao trocar para ele, nada muda no login. Pontos de atenção:

- Toda tabela tem `userId`; a API filtra por ele em todos os repositórios, e o `userId` vem só do token verificado.
- **A API agora exige sessão em todas as rotas** (exceto `/health` e `/auth/*`). Ainda assim, não exponha o Postgres, e deixe `CORS_ORIGINS` só com a origem do front.
- Defina `JWT_SECRET` (≥ 32 caracteres, `openssl rand -base64 48`) e mantenha-o fora do git.
- Para reivindicar os dados existentes (usuário de seed), rode `claim-owner` uma vez (ver README, "Local development").
- Row Level Security é opcional como defesa em profundidade: a API usa a conexão do Prisma (papel dono), então o RLS não substitui o filtro por `userId`.

## Observações

- O Supabase já expõe as tabelas pela API REST (PostgREST). Como o Routinely acessa o banco só pela API NestJS, mantenha o RLS **ativado sem políticas** nas tabelas (ou revogue o acesso dos papéis `anon`/`authenticated`) para que elas não fiquem acessíveis publicamente.
- O Prisma cria os tipos enum e as tabelas no schema `public`. Não há extensões obrigatórias.
