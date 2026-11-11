import { loadPrompt, renderPrompt, sanitizeForPrompt } from './prompt-loader';

describe('prompt loader', () => {
  it.each([
    'estimate-task.system',
    'estimate-task.user',
    'generate-routine.system',
    'generate-routine.user',
  ])('loads %s without its version header', (name) => {
    const prompt = loadPrompt(name);
    expect(prompt.length).toBeGreaterThan(50);
    expect(prompt.startsWith('<!--')).toBe(false);
    expect(loadPrompt(name)).toBe(prompt);
  });

  it('renders placeholders and fails loudly on a missing value', () => {
    expect(renderPrompt('Olá {{name}}, {{count}} tarefas', { name: 'Ana', count: 2 })).toBe(
      'Olá Ana, 2 tarefas',
    );
    expect(() => renderPrompt('{{missing}}', {})).toThrow('Missing prompt value: missing');
  });

  it('sanitizes user text', () => {
    expect(sanitizeForPrompt('  a "b"\n\nc  ', 100)).toBe("a 'b' c");
    expect(sanitizeForPrompt('abcdef', 3)).toBe('abc');
  });
});
