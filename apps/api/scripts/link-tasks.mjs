// Links tasks to fixed commitments when the title ends with "(Commitment name)".
//   node scripts/link-tasks.mjs --dry-run   (default) prints the proposal, changes nothing
//   node scripts/link-tasks.mjs --apply     links and removes the suffix, in one transaction
import { PrismaClient } from '@prisma/client';

const apply = process.argv.includes('--apply');
const prisma = new PrismaClient();
const fold = (text) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();

/** Pure: proposal for each task, given the user's commitments. */
export function propose(tasks, commitments) {
  return tasks
    .filter((task) => !task.commitmentId)
    .flatMap((task) => {
      const match = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(task.title);
      if (!match || !match[1].trim()) return [];
      const candidates = commitments.filter(
        (item) => item.userId === task.userId && fold(item.title) === fold(match[2]),
      );
      if (candidates.length === 0) return [];
      // Same title on several rows (e.g. morning + afternoon shift): ambiguous, do not guess.
      if (candidates.length > 1) {
        return [{ task, newTitle: match[1].trim(), commitment: null, reason: 'ambiguous' }];
      }
      return [{ task, newTitle: match[1].trim(), commitment: candidates[0], reason: 'ok' }];
    });
}

async function main() {
  const [tasks, commitments] = await Promise.all([
    prisma.task.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.fixedCommitment.findMany(),
  ]);
  const proposals = propose(tasks, commitments);
  const rows = proposals.filter((item) => item.reason === 'ok');
  console.log(apply ? 'MODE: apply\n' : 'MODE: dry-run (nothing is written)\n');
  console.table(
    proposals.map((item) => ({
      taskId: item.task.id.slice(0, 8),
      before: item.task.title,
      after: item.newTitle,
      commitment: item.commitment?.title ?? `(skipped: ${item.reason})`,
    })),
  );
  console.log(`${rows.length} link(s) proposed, ${proposals.length - rows.length} skipped.`);
  if (!apply) return console.log('Run again with --apply to write these changes.');
  await prisma.$transaction(
    rows.map((item) =>
      prisma.task.update({
        where: { id: item.task.id },
        // Title is cosmetic here, so the AI estimate is kept (no re-estimation).
        data: { commitmentId: item.commitment.id, title: item.newTitle },
      }),
    ),
  );
  console.log('Applied.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().finally(() => prisma.$disconnect());
}
