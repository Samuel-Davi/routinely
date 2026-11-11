/** A model id as returned by `models.list` (`models/gemini-3.5-flash-lite` → `gemini-3.5-flash-lite`). */
export const stripModelPrefix = (name: string): string => name.replace(/^models\//, '');

/** Text models only: image, audio, embedding, live, robotics and similar variants are excluded. */
const NON_TEXT = /(image|tts|audio|live|embedding|imagen|veo|robotics|computer-use|native|learnlm)/;

function versionOf(id: string): number[] {
  const match = /^gemini-(\d+(?:\.\d+)*)/.exec(id);
  return match?.[1] ? match[1].split('.').map(Number) : [0];
}

function compareVersionsDesc(a: string, b: string): number {
  const va = versionOf(a);
  const vb = versionOf(b);
  for (let index = 0; index < Math.max(va.length, vb.length); index += 1) {
    const diff = (vb[index] ?? 0) - (va[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return a.localeCompare(b);
}

export type ModelKind = 'fast' | 'strong';

/** Stable (non-preview/experimental) Flash models, newest first. `fast` = flash-lite, `strong` = flash. */
export function candidateModels(available: readonly string[], kind: ModelKind): string[] {
  return available
    .map(stripModelPrefix)
    .filter((id) => id.startsWith('gemini-') && /flash/.test(id) && !NON_TEXT.test(id))
    .filter((id) => !/(preview|exp)/.test(id))
    .filter((id) => (kind === 'fast' ? /flash-lite/.test(id) : !/flash-lite/.test(id)))
    .sort(compareVersionsDesc);
}

export interface ModelResolution {
  model: string;
  retryModel: string;
  /** Human-readable notes (never include credentials). */
  warnings: string[];
}

/**
 * Keeps the configured models when they exist; otherwise falls back to the newest model
 * of the same kind, and finally to whatever the other tier resolved to.
 */
export function resolveModels(
  configured: { model: string; retryModel: string },
  available: readonly string[],
): ModelResolution {
  const ids = new Set(available.map(stripModelPrefix));
  const warnings: string[] = [];
  const pick = (wanted: string, kind: ModelKind, label: string): string | undefined => {
    if (ids.has(wanted)) return wanted;
    const fallback = candidateModels(available, kind)[0];
    warnings.push(
      fallback
        ? `${label} "${wanted}" não existe para esta chave; usando "${fallback}".`
        : `${label} "${wanted}" não existe para esta chave e não há substituto.`,
    );
    return fallback;
  };
  const model = pick(configured.model, 'fast', 'GEMINI_MODEL');
  const retryModel = pick(configured.retryModel, 'strong', 'GEMINI_RETRY_MODEL');
  return {
    model: model ?? retryModel ?? configured.model,
    retryModel: retryModel ?? model ?? configured.retryModel,
    warnings,
  };
}
