/**
 * AI quality harness (`pnpm eval:ai`). Calls the REAL Gemini API with your key, so it is never
 * part of CI. It runs fixed scenarios through the same pipeline as the app (AI proposes, the
 * validator decides, the heuristic completes) and reports measurable metrics per model and
 * planning strategy.
 *
 * Options: --models a,b  --strategies times,order,order-day  --scenarios real,light
 *          --reps 2  --delay-ms 4000  --thinking minimal|low|medium|high
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AI_PLANNING_STRATEGIES, type AiPlanningStrategy } from '@routinely/shared';
import { RoutineProposer } from '../src/ai/generate-routine';
import { LlmClient, defaultTiming } from '../src/ai/llm-client';
import type { LlmProvider, ModelTier, StructuredInput, TokenUsage } from '../src/ai/llm-provider';
import { GeminiProvider } from '../src/ai/providers/gemini.provider';
import { candidateModels } from '../src/ai/providers/model-discovery';
import type { AppConfig } from '../src/config/config.module';
import { buildPlanningInput, buildProposeFn } from '../src/routines/ai-request';
import {
  planRoutine,
  validateAllocations,
  type PlanningContext,
  type ProposeFn,
} from '../src/routines/engine';
import {
  aggregate,
  adherence,
  shortBlocks,
  toMarkdown,
  type Aggregate,
  type RunMetrics,
} from './metrics';
import { SCENARIOS, type Scenario } from './scenarios';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i] as string;
  if (arg !== '--' && arg.startsWith('--')) args.set(arg.slice(2), process.argv[(i += 1)] ?? '');
}
const list = (name: string, fallback: string[]) =>
  args.get(name) ? (args.get(name) as string).split(',').filter(Boolean) : fallback;

/** Wraps a provider to record latency and token usage of every call. */
class RecordingProvider implements LlmProvider {
  readonly name: string;
  latencyMs = 0;
  usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  errors: string[] = [];
  constructor(private readonly inner: LlmProvider) {
    this.name = inner.name;
  }
  isConfigured = () => this.inner.isConfigured();
  modelFor = (tier: ModelTier) => this.inner.modelFor(tier);
  async generateStructured<T>(input: StructuredInput<T>): Promise<T> {
    const startedAt = Date.now();
    try {
      return await this.inner.generateStructured({
        ...input,
        onUsage: (usage) => {
          this.usage.inputTokens += usage.inputTokens;
          this.usage.outputTokens += usage.outputTokens;
        },
      });
    } catch (error) {
      this.errors.push((error as { kind?: string }).kind ?? 'ERROR');
      throw error;
    } finally {
      this.latencyMs += Date.now() - startedAt;
    }
  }
}

function contextOf(scenario: Scenario): PlanningContext {
  return {
    prefs: scenario.prefs,
    commitments: scenario.commitments,
    rangeStart: scenario.rangeStart,
    rangeEnd: scenario.rangeEnd,
    now: scenario.now,
    fixedBlocks: [],
  };
}

async function runOnce(
  scenario: Scenario,
  strategy: AiPlanningStrategy | 'heuristic',
  model: string,
  apiKey: string,
  thinking: string | undefined,
): Promise<RunMetrics> {
  const context = contextOf(scenario);
  const recorder = new RecordingProvider(
    new GeminiProvider({
      apiKey,
      model,
      // Same model for the retry tier, so the comparison is about the model under test.
      retryModel: model,
      timeoutMs: 45_000,
      maxOutputTokens: 8192,
      thinkingLevel: thinking as 'minimal' | 'low' | 'medium' | 'high' | undefined,
    }),
  );
  const llm = new LlmClient(
    recorder,
    { LLM_MAX_ATTEMPTS: 4, LLM_BACKOFF_BASE_MS: 6000 } as AppConfig,
    defaultTiming,
  );
  const proposer = new RoutineProposer(llm);
  const titles = new Map(scenario.tasks.map((task) => [task.id, task.title]));
  const commitmentOf = new Map(
    scenario.tasks.flatMap((task) =>
      task.commitment ? [[task.id, task.commitment] as const] : [],
    ),
  );
  const buildInput = buildPlanningInput(context, titles, commitmentOf, scenario.instruction);

  let calls = 0;
  let validFirstTry: boolean | null = strategy === 'heuristic' ? null : false;
  let propose: ProposeFn | undefined;
  if (strategy !== 'heuristic') {
    const base = buildProposeFn(strategy, proposer, context, buildInput);
    propose = async (request) => {
      calls += 1;
      const first = calls === 1;
      try {
        const blocks = await base(request);
        if (first) {
          validFirstTry = validateAllocations(blocks, request.tasks, context).issues.length === 0;
        }
        return blocks;
      } catch (error) {
        if (first) validFirstTry = false;
        throw error;
      }
    };
  }

  const result = await planRoutine({ tasks: scenario.tasks, context, propose });
  return {
    source: result.source,
    validFirstTry,
    neededFallback: result.source !== 'AI',
    shortBlocks: shortBlocks(result.blocks, scenario.tasks),
    unscheduled: result.unscheduled.length,
    adherence: adherence(result.blocks, scenario.tasks),
    aiCalls: calls,
    inputTokens: recorder.usage.inputTokens,
    outputTokens: recorder.usage.outputTokens,
    latencyMs: recorder.latencyMs,
    errors: recorder.errors,
    // 4 attempts, all rate-limited, and nothing came back: the quota ran out.
    quotaLimited:
      strategy !== 'heuristic' &&
      recorder.errors.filter((e) => e === 'RATE_LIMIT').length >= 4 &&
      recorder.usage.inputTokens === 0,
  } as RunMetrics;
}

async function main(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set (put it in .env).');

  // Strongest stable Flash available for this key, discovered like the app does at boot.
  const probe = new GeminiProvider({
    apiKey,
    model: 'gemini-3.5-flash-lite',
    retryModel: 'gemini-3.5-flash-lite',
    timeoutMs: 30_000,
    maxOutputTokens: 256,
  });
  const { available } = await probe.resolveModels();
  const strongest = candidateModels(available, 'strong')[0];
  const models = list('models', [
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
    ...(strongest ? [strongest] : []),
  ]);
  const strategies = list('strategies', [...AI_PLANNING_STRATEGIES]) as AiPlanningStrategy[];
  const scenarios = SCENARIOS.filter((s) =>
    list(
      'scenarios',
      SCENARIOS.map((x) => x.id),
    ).includes(s.id),
  );
  const reps = Number(args.get('reps') ?? 2);
  const delayMs = Number(args.get('delay-ms') ?? 4000);
  const thinking = args.get('thinking');

  console.log(
    `Models: ${models.join(', ')} | strategies: ${strategies.join(', ')} | scenarios: ${scenarios
      .map((s) => s.id)
      .join(', ')} | reps: ${reps}${thinking ? ` | thinking: ${thinking}` : ''}\n`,
  );

  const rows: Aggregate[] = [];
  const detail: unknown[] = [];

  // Reference: the deterministic heuristic alone (no AI, no cost).
  const base = [];
  for (const scenario of scenarios) {
    base.push(await runOnce(scenario, 'heuristic', 'none', apiKey, undefined));
  }
  rows.push(aggregate('(sem IA)', 'heuristic', base));

  const exhausted = new Set<string>();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = join(__dirname, 'results');
  mkdirSync(dir, { recursive: true });
  const save = () => {
    const markdown = toMarkdown(rows);
    writeFileSync(join(dir, `${stamp}.md`), `${markdown}\n`);
    writeFileSync(join(dir, `${stamp}.json`), JSON.stringify({ rows, detail }, null, 2));
    return markdown;
  };

  for (const model of models) {
    for (const strategy of strategies) {
      const runs: RunMetrics[] = [];
      for (const scenario of scenarios) {
        for (let rep = 1; rep <= reps; rep += 1) {
          if (exhausted.has(model)) continue;
          const metrics = await runOnce(scenario, strategy, model, apiKey, thinking);
          runs.push(metrics);
          detail.push({ model, strategy, scenario: scenario.id, rep, ...metrics });
          console.log(
            `${model} | ${strategy} | ${scenario.id} #${rep}: ${metrics.source}, first-valid=${metrics.validFirstTry}, short=${metrics.shortBlocks}, unscheduled=${metrics.unscheduled}, ${metrics.inputTokens}/${metrics.outputTokens} tok, ${(metrics.latencyMs / 1000).toFixed(1)}s${metrics.errors.length ? `, errors=${metrics.errors.join('+')}` : ''}`,
          );
          if (metrics.quotaLimited) {
            exhausted.add(model);
            console.log(`!! ${model}: quota exhausted, skipping its remaining runs`);
          }
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
      if (runs.length > 0) rows.push(aggregate(model, strategy, runs));
      save(); // keep partial results if the process is interrupted
    }
  }

  const markdown = save();
  console.log(`\n${markdown}\n`);
  console.log(`Saved to apps/api/eval/results/${stamp}.{md,json}`);
}

main().catch((error: unknown) => {
  // Never print the API key: only the message of our own errors.
  console.error(error instanceof Error ? error.message : 'eval failed');
  process.exit(1);
});
