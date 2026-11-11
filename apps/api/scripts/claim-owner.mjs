// Gives the pre-login seed user (who owns all existing data) an e-mail and a password, so the
// data you already have is yours after login. Nothing else is touched.
//
//   pnpm --filter @routinely/api claim-owner -- --email voce@exemplo.com
//   docker compose run --rm -it migrate node scripts/claim-owner.mjs --email voce@exemplo.com
//
// The password is asked on the terminal (hidden) and never printed or logged. For automation
// only, CLAIM_PASSWORD may be set instead (it ends up in the environment/shell history).
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import { emailSchema, passwordSchema } from '@routinely/shared';

const SEED_USER_ID = process.env.DEFAULT_USER_ID ?? '00000000-0000-4000-8000-000000000001';

const argv = process.argv.slice(2);
const arg = (name) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
};
const force = argv.includes('--force');

/** Reads a line without echoing it. */
function askHidden(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const muted = new Writable({ write: (_chunk, _enc, done) => done() });
    const rl = createInterface({ input: process.stdin, output: muted, terminal: true });
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const email = emailSchema.safeParse(arg('email') ?? '');
    if (!email.success) throw new Error('Informe um e-mail válido: --email voce@exemplo.com');

    const owner = await prisma.user.findUnique({ where: { id: SEED_USER_ID } });
    if (!owner)
      throw new Error('Usuário de seed não encontrado (banco novo? Faça o cadastro pelo app).');
    if (owner.passwordHash && !force) {
      throw new Error('O dono dos dados já tem senha. Use --force para trocá-la.');
    }
    const taken = await prisma.user.findUnique({ where: { email: email.data } });
    if (taken && taken.id !== owner.id)
      throw new Error('Este e-mail já está em uso por outra conta.');

    let password = process.env.CLAIM_PASSWORD;
    if (!password) {
      if (!process.stdin.isTTY)
        throw new Error('Rode em um terminal interativo (ou use docker compose run -it).');
      password = await askHidden('Nova senha: ');
      const again = await askHidden('Repita a senha: ');
      if (password !== again) throw new Error('As senhas não conferem.');
    }
    const strength = passwordSchema.safeParse(password);
    if (!strength.success) throw new Error(`Senha fraca: ${strength.error.issues[0]?.message}.`);

    await prisma.user.update({
      where: { id: owner.id },
      data: {
        email: email.data,
        passwordHash: await hash(password, {
          algorithm: 2,
          memoryCost: 19_456,
          timeCost: 2,
          parallelism: 1,
        }),
      },
    });
    // Sessions opened under an older password (if any) must not survive a password change.
    await prisma.refreshToken.deleteMany({ where: { userId: owner.id } });
    console.log(
      `Pronto: ${email.data} agora é o dono dos dados existentes. Entre pelo app com essa conta.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Falhou.');
  process.exit(1);
});
