import { describe, expect, it } from 'vitest';
import { PITCH, accentFor, contrast } from './appearance';

describe('accentFor', () => {
  const kits = ['#38bdf8', '#f472b6', '#facc15', '#1e3a8a', '#000000', '#ffffff', '#dc2626', PITCH];

  it('makes any kit colour readable as the accent in dark mode', () => {
    for (const kit of kits) expect(contrast(accentFor(kit, true).accent, '#1c1c1e')).toBeGreaterThanOrEqual(4.5);
  });

  it('and in light mode', () => {
    for (const kit of kits) expect(contrast(accentFor(kit, false).accent, '#f2f2f7')).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps a colour that already reads as it is', () => {
    expect(accentFor('#38bdf8', true).accent).toBe('#38bdf8');
  });

  it('picks button text that reads on the accent', () => {
    for (const kit of kits) {
      for (const dark of [true, false]) {
        const { accent, ink } = accentFor(kit, dark);
        expect(contrast(accent, ink)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('falls back to pitch green without a team colour', () => {
    expect(accentFor(undefined, false).accent).toBe(PITCH);
  });
});
