import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const cache = new Map<string, string>();

/**
 * Loads a versioned prompt file from `ai/prompts`. The first line is an HTML
 * comment carrying the prompt name and version; it is not sent to the model.
 */
export function loadPrompt(name: string): string {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;
  const raw = readFileSync(join(__dirname, 'prompts', `${name}.md`), 'utf8');
  const prompt = raw.replace(/^<!--[\s\S]*?-->\s*/, '').trim();
  cache.set(name, prompt);
  return prompt;
}

/** Replaces `{{key}}` placeholders. Unknown placeholders are a programming error. */
export function renderPrompt(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = values[key];
    if (value === undefined) throw new Error(`Missing prompt value: ${key}`);
    return String(value);
  });
}

/** Keeps user text from breaking out of the quoted field in the prompt. */
export function sanitizeForPrompt(text: string, maxLength: number): string {
  return text.replace(/\s+/g, ' ').replace(/"/g, "'").trim().slice(0, maxLength);
}
