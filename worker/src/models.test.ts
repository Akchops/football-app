import { describe, expect, it } from 'vitest';
import { rankModels, thinkingLight, thinkingOff, type ListedModel } from './models';

const TEXT = ['generateContent', 'countTokens'];

function model(id: string, methods: string[] = TEXT): ListedModel {
  return { name: `models/${id}`, supportedGenerationMethods: methods };
}

/**
 * Shaped like the real list: stable models mixed in with everything that has
 * "flash" in its name and must never answer a Coach request - previews, image
 * and speech models, live models, the moving -latest aliases.
 */
const GOOGLE = [
  model('gemini-2.0-flash'),
  model('gemini-2.0-flash-001'),
  model('gemini-2.0-flash-lite'),
  model('gemini-2.5-flash'),
  model('gemini-2.5-flash-lite'),
  model('gemini-2.5-pro'),
  model('gemini-2.5-flash-image'),
  model('gemini-2.5-flash-preview-tts'),
  model('gemini-2.5-flash-native-audio-preview-09-2025', ['bidiGenerateContent']),
  model('gemini-live-2.5-flash-preview', ['bidiGenerateContent']),
  model('gemini-flash-latest'),
  model('gemini-flash-lite-latest'),
  model('gemini-3-flash-preview'),
  model('gemini-3.1-flash-lite-preview'),
  model('gemini-3.1-flash-image-preview'),
  model('gemini-embedding-001', ['embedContent']),
  model('gemma-3-27b-it'),
];

describe('rankModels', () => {
  it('puts the best stable full flash first for the Coach and clips', () => {
    expect(rankModels(GOOGLE, 'standard')[0]).toBe('gemini-2.5-flash');
  });

  it('puts the best stable lite first for schedule import', () => {
    expect(rankModels(GOOGLE, 'fast')[0]).toBe('gemini-2.5-flash-lite');
  });

  it('never ranks a preview, image, speech, live or -latest model while a stable one exists', () => {
    for (const purpose of ['standard', 'fast'] as const) {
      const ranked = rankModels(GOOGLE, purpose);
      const stable = ranked.filter((id) => !/preview/.test(id));
      // Stable models come first as a block; previews only ever trail them.
      expect(ranked.slice(0, stable.length)).toEqual(stable);
      for (const id of ranked) {
        expect(id).not.toMatch(/image|tts|audio|live|latest|embedding|gemma|pro/);
      }
    }
  });

  it('keeps a fallback behind the first choice', () => {
    // The worker tries the second entry when the first fails, so there has to
    // be one, and it has to be a different model.
    const standard = rankModels(GOOGLE, 'standard');
    expect(standard[1]).toBeDefined();
    expect(standard[1]).not.toBe(standard[0]);
    expect(standard.slice(0, 4)).toEqual(['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-001', 'gemini-2.5-flash-lite']);
  });

  it('moves to a new stable release by itself the day it appears', () => {
    const later = [...GOOGLE, model('gemini-3-flash'), model('gemini-3-flash-lite')];
    expect(rankModels(later, 'standard')[0]).toBe('gemini-3-flash');
    expect(rankModels(later, 'fast')[0]).toBe('gemini-3-flash-lite');
  });

  it('ranks 3.1 above 3 above 2.5', () => {
    const list = [model('gemini-2.5-flash'), model('gemini-3-flash'), model('gemini-3.1-flash')];
    expect(rankModels(list, 'standard')).toEqual(['gemini-3.1-flash', 'gemini-3-flash', 'gemini-2.5-flash']);
  });

  it('skips a model that cannot serve generateContent', () => {
    const list = [model('gemini-3-flash', ['countTokens']), model('gemini-2.5-flash')];
    expect(rankModels(list, 'standard')).toEqual(['gemini-2.5-flash']);
  });

  it('trusts names when the list carries no method information at all', () => {
    const list: ListedModel[] = [{ name: 'models/gemini-2.5-flash' }, { name: 'models/gemini-2.5-flash-lite' }];
    expect(rankModels(list, 'standard')).toEqual(['gemini-2.5-flash', 'gemini-2.5-flash-lite']);
  });

  it('falls back to a preview only when there is no stable model at all', () => {
    const previewsOnly = [model('gemini-3-flash-preview'), model('gemini-3.1-flash-image-preview'), model('gemini-embedding-001', ['embedContent'])];
    expect(rankModels(previewsOnly, 'standard')).toEqual(['gemini-3-flash-preview']);
  });

  it('tries preferred models first, in order, even one missing from the list', () => {
    expect(rankModels(GOOGLE, 'standard', { preferred: ['gemini-2.0-flash'] })[0]).toBe('gemini-2.0-flash');
    expect(rankModels(GOOGLE, 'standard', { preferred: ['gemini-9-flash'] })[0]).toBe('gemini-9-flash');
    // And the rest still follow, so a bad preference still has somewhere to go.
    expect(rankModels(GOOGLE, 'standard', { preferred: ['gemini-9-flash'] })[1]).toBe('gemini-2.5-flash');
    expect(rankModels(GOOGLE, 'standard', { preferred: ['gemini-2.0-flash', 'gemini-2.5-flash-lite'] }).slice(0, 3)).toEqual([
      'gemini-2.0-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.5-flash',
    ]);
  });

  it('ignores blank and repeated preferences', () => {
    expect(rankModels(GOOGLE, 'standard', { preferred: ['', '  ', 'gemini-2.0-flash', 'gemini-2.0-flash'] }).slice(0, 2)).toEqual([
      'gemini-2.0-flash',
      'gemini-2.5-flash',
    ]);
  });

  it('sends a model that just failed to the back rather than dropping it', () => {
    const ranked = rankModels(GOOGLE, 'standard', { coolingDown: new Set(['gemini-2.5-flash']) });
    expect(ranked[0]).toBe('gemini-2.0-flash');
    expect(ranked).toContain('gemini-2.5-flash');
    expect(ranked.at(-1)).toBe('gemini-2.5-flash');
  });

  it('returns nothing rather than a wrong model when nothing fits', () => {
    expect(rankModels([model('gemini-2.5-pro'), model('gemini-embedding-001', ['embedContent'])], 'standard')).toEqual([]);
    expect(rankModels([], 'fast')).toEqual([]);
  });
});

describe('thinkingOff', () => {
  it('uses a zero budget for Gemini 2.5, which accepts it', () => {
    expect(thinkingOff('gemini-2.5-flash')).toEqual({ thinkingConfig: { thinkingBudget: 0 } });
    expect(thinkingOff('gemini-2.5-flash-lite')).toEqual({ thinkingConfig: { thinkingBudget: 0 } });
  });

  it('never sends a zero budget to Gemini 3 or later, which rejects the whole request for it', () => {
    for (const id of ['gemini-3-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-4-flash']) {
      expect(thinkingOff(id)).toEqual({ thinkingConfig: { thinkingLevel: 'minimal' } });
    }
  });

  it('sends nothing to a model too old to think', () => {
    expect(thinkingOff('gemini-2.0-flash')).toEqual({});
    expect(thinkingOff('something-else')).toEqual({});
  });
});

describe('thinkingLight', () => {
  it('asks Gemini 3 and later for a short think', () => {
    expect(thinkingLight('gemini-3.6-flash')).toEqual({ thinkingConfig: { thinkingLevel: 'low' } });
    expect(thinkingLight('gemini-4-flash')).toEqual({ thinkingConfig: { thinkingLevel: 'low' } });
  });

  it('leaves older models to their own default', () => {
    expect(thinkingLight('gemini-2.5-flash')).toEqual({});
  });
});
