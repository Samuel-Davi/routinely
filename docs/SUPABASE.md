# Usando o Supabase como banco

O Routinely usa PostgreSQL via Prisma. Localmente o banco é o serviço `db` do Docker Compose; em produção basta trocar duas variáveis de ambiente para usar o Supabase. Nenhuma alteração de código é necessária.

## Por que duas URLs

O `schema.prisma` declara:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL") // runtime: conexão via pooler
  directUrl = env("DIRECT_URL")   // migrations: conexão direta
}
```

- **`DATABASE_URL`** é usada pela aplicação. No Supabase ela deve passar pelo **pooler** (Supavisor, modo _transaction_, porta `6543`), que suporta muitas conexões curtas.
- **`DIRECT_URL`** é usada pelo `prisma migrate`. Migrations precisam de uma conexão de sessão (porta `5432`), porque o modo _transaction_ não suporta os comandos que elas executam.

## Passo a passo

1. Crie um projeto em https://supabase.com e anote a senha do banco.
2. No painel, abra **Connect** e copie as strings em _ORMs → Prisma_.
3. Configure as variáveis (no `.env` ou no provedor de hospedagem da API):

   ```bash
   # Pooler em modo transaction (runtime)
   DATABASE_URL="postgresql://postgres.<ref>:<senha>@aws-0-<regiao>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
   # Pooler em modo session (migrations)
   DIRECT_URL="postgresql://postgres.<ref>:<senha>@aws-0-<regiao>.pooler.supabase.com:5432/postgres"
   ```

   - `pgbouncer=true` desativa _prepared statements_, incompatíveis com o modo transaction.
   - `connection_limit=1` é recomendado em ambientes serverless; em um servidor de longa duração (como o container da API) use um valor maior, por exemplo `5`.
   - Se a senha tiver caracteres especiais, codifique-a (URL encode).

4. Aplique as migrations e o seed:

   ```bash
   pnpm --filter @routinely/api prisma:deploy
   pnpm --filter @routinely/api prisma:seed
   ```

   No `docker compose`, o serviço `migrate` (stage `migrate` do Dockerfile) faz isso antes de a API subir; numa plataforma, use-o como _release command_.

5. Suba a API apontando para o Supabase. Com Docker Compose, o serviço `db` deixa de ser necessário: sobrescreva `DATABASE_URL`/`DIRECT_URL` do serviço `api` (por exemplo, em um `docker-compose.override.yml`) e remova o `depends_on: db`.

## Autenticação

O login é da própria API (e-mail + senha, cookies httpOnly; ver ADR-023), **independente do Supabase**: o Supabase aqui é só o Postgres. Ao trocar para ele, nada muda no login. Pontos de atenção:

- Toda tabela tem `userId`; a API filtra por ele em todos os repositórios, e o `userId` vem só do token verificado.
- **A API agora exige sessão em todas as rotas** (exceto `/health` e `/auth/*`). Ainda assim, não exponha o Postgres, e deixe `CORS_ORIGINS` só com a origem do front.
- Defina `JWT_SECRET` (≥ 32 caracteres, `openssl rand -base64 48`) e mantenha-o fora do git.
- Para reivindicar os dados existentes (usuário de seed), rode `claim-owner` uma vez (ver README, "Primeiro acesso").
- Row Level Security é opcional como defesa em profundidade: a API usa a conexão do Prisma (papel dono), então o RLS não substitui o filtro por `userId`.

## Observações

- O Supabase já expõe as tabelas pela API REST (PostgREST). Como o Routinely acessa o banco só pela API NestJS, mantenha o RLS **ativado sem políticas** nas tabelas (ou revogue o acesso dos papéis `anon`/`authenticated`) para que elas não fiquem acessíveis publicamente.
- O Prisma cria os tipos enum e as tabelas no schema `public`. Não há extensões obrigatórias.
