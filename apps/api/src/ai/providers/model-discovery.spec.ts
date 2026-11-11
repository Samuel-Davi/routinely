import { candidateModels, resolveModels, stripModelPrefix } from './model-discovery';

const available = [
  'models/gemini-2.5-flash',
  'models/gemini-2.5-flash-lite',
  'models/gemini-3.5-flash',
  'models/gemini-3.5-flash-lite',
  'models/gemini-3.6-flash',
  'models/gemini-3.8-flash',
  'models/gemini-3.1-flash-image',
  'models/gemini-3.1-flash-lite',
  'models/gemini-omni-flash-preview',
  'models/gemini-3.9-flash-preview',
];

describe('model discovery', () => {
  it('strips the models/ prefix', () => {
    expect(stripModelPrefix('models/gemini-x')).toBe('gemini-x');
    expect(stripModelPrefix('gemini-x')).toBe('gemini-x');
  });

  it('lists stable text Flash candidates, newest first, by kind', () => {
    expect(candidateModels(available, 'strong')).toEqual([
      'gemini-3.8-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-2.5-flash',
    ]);
    expect(candidateModels(available, 'fast')).toEqual([
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-2.5-flash-lite',
    ]);
  });

  it('keeps configured models that exist, without warnings', () => {
    expect(
      resolveModels({ model: 'gemini-3.5-flash-lite', retryModel: 'gemini-3.6-flash' }, available),
    ).toEqual({ model: 'gemini-3.5-flash-lite', retryModel: 'gemini-3.6-flash', warnings: [] });
  });

  it('falls back to the newest existing model of the same kind and warns', () => {
    const resolved = resolveModels(
      { model: 'gemini-9-flash-lite', retryModel: 'gemini-9.9-flash' },
      available,
    );
    expect(resolved.model).toBe('gemini-3.5-flash-lite');
    expect(resolved.retryModel).toBe('gemini-3.8-flash');
    expect(resolved.warnings).toHaveLength(2);
    expect(resolved.warnings[0]).toContain('GEMINI_MODEL');
    expect(resolved.warnings[1]).toContain('GEMINI_RETRY_MODEL');
  });

  it('uses the other tier when a kind has no candidate, and keeps config when none exist', () => {
    const onlyStrong = ['models/gemini-3.6-flash'];
    const resolved = resolveModels(
      { model: 'gemini-x-flash-lite', retryModel: 'gemini-3.6-flash' },
      onlyStrong,
    );
    expect(resolved).toMatchObject({ model: 'gemini-3.6-flash', retryModel: 'gemini-3.6-flash' });
    expect(resolved.warnings[0]).toContain('não há substituto');

    const none = resolveModels({ model: 'a', retryModel: 'b' }, []);
    expect(none).toMatchObject({ model: 'a', retryModel: 'b' });
  });
});
