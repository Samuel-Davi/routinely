// Idempotent seed: the single MVP user, default preferences and a few examples.
// Plain ESM (no TypeScript) so it runs in the production image without dev tooling.
import { PrismaClient } from '@prisma/client';

const SEED_USER_ID = process.env.DEFAULT_USER_ID ?? '00000000-0000-4000-8000-000000000001';
const prisma = new PrismaClient();

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Deadline `days` from now, snapped to the next full hour. */
const inDays = (days) => new Date(Math.ceil((Date.now() + days * DAY) / HOUR) * HOUR);

const commitments = [
  {
    title: 'Trabalho',
    daysOfWeek: [1, 2, 3, 4, 5],
    startTime: '08:00',
    endTime: '12:00',
    category: 'WORK',
    color: 'blue',
  },
  {
    title: 'Trabalho',
    daysOfWeek: [1, 2, 3, 4, 5],
    startTime: '13:00',
    endTime: '17:00',
    category: 'WORK',
    color: 'blue',
  },
  {
    title: 'Academia',
    daysOfWeek: [1, 3, 5],
    startTime: '18:00',
    endTime: '19:00',
    category: 'HEALTH',
    color: 'green',
  },
  {
    title: 'Aula de inglês',
    daysOfWeek: [2, 4],
    startTime: '19:00',
    endTime: '20:30',
    category: 'STUDY',
    color: 'purple',
    requiresTravel: true,
  },
];

const tasks = [
  {
    title: 'Preparar apresentação do projeto',
    description: 'Slides e roteiro para a reunião com o cliente.',
    priority: 'URGENT',
    deadline: inDays(3),
    complexity: 4,
    estimatedMinutes: 180,
    splittable: true,
    aiRationale: 'Exige pesquisa, estrutura e revisão; pode ser dividida em etapas.',
  },
  {
    title: 'Estudar para a prova de estatística',
    description: 'Capítulos 4 a 6 e lista de exercícios.',
    priority: 'HIGH',
    deadline: inDays(6),
    complexity: 4,
    estimatedMinutes: 240,
    splittable: true,
    aiRationale: 'Conteúdo denso; sessões separadas ajudam a fixar.',
  },
  {
    title: 'Revisar relatório mensal',
    description: '',
    priority: 'MEDIUM',
    deadline: inDays(5),
    complexity: 2,
    estimatedMinutes: 60,
    splittable: false,
    aiRationale: 'Revisão direta de um documento já escrito.',
  },
  {
    title: 'Organizar documentos do imposto',
    description: 'Separar recibos e informes de rendimento.',
    priority: 'LOW',
    deadline: inDays(12),
    complexity: 2,
    estimatedMinutes: 90,
    splittable: true,
    aiRationale: 'Trabalho mecânico, sem muita exigência de foco.',
  },
  {
    title: 'Agendar consulta médica',
    description: '',
    priority: 'MEDIUM',
    deadline: inDays(4),
    complexity: 1,
    estimatedMinutes: 15,
    splittable: false,
    aiRationale: 'Tarefa rápida: uma ligação ou agendamento online.',
  },
];

async function main() {
  await prisma.user.upsert({
    where: { id: SEED_USER_ID },
    update: {},
    create: { id: SEED_USER_ID, name: 'Usuário Routinely' },
  });
  await prisma.preferences.upsert({
    where: { userId: SEED_USER_ID },
    update: {},
    create: { userId: SEED_USER_ID, timezone: process.env.DEFAULT_TIMEZONE ?? 'America/Manaus' },
  });

  if (process.env.SEED_EXAMPLES === 'false') return;

  const [commitmentCount, taskCount] = await Promise.all([
    prisma.fixedCommitment.count({ where: { userId: SEED_USER_ID } }),
    prisma.task.count({ where: { userId: SEED_USER_ID } }),
  ]);
  // Only add examples to an empty account, so restarts never duplicate data.
  if (commitmentCount > 0 || taskCount > 0) return;

  await prisma.fixedCommitment.createMany({
    data: commitments.map((commitment) => ({ ...commitment, userId: SEED_USER_ID })),
  });
  await prisma.task.createMany({
    data: tasks.map((task) => ({
      ...task,
      userId: SEED_USER_ID,
      estimationStatus: 'DONE',
      estimationSource: 'AI',
    })),
  });
}

main()
  .then(() => console.log('Seed concluído.'))
  .catch((error) => {
    console.error('Seed falhou:', error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
