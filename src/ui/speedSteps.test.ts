// The speed table's pure part (GitHub issue #27): TopBar.tsx and
// useKeyboardShortcuts.ts both derive from SPEED_STEPS/SPEED_STEP_KEYS, so
// pinning the table down here pins both of them down. No React rendering
// happens in this suite (`environment: 'node'`, same as panelState.test.ts),
// so the assertions stay on the table and the dictionary, not the DOM.
import { describe, expect, it } from 'vitest';
import { SPEED_STEPS, SPEED_STEP_KEYS } from './speedSteps';
import { STRINGS } from './strings';
import type { Language } from './strings';

describe('SPEED_STEPS', () => {
  it('has four steps, matching GameState[\'speed\'] (0 / 1 / 3 / 10)', () => {
    expect(SPEED_STEPS.map((step) => step.value)).toEqual([0, 1, 3, 10]);
  });

  it("maps the keyboard's 1/2/3/4 onto the four steps one-to-one, in order", () => {
    // this is the issue's actual regression: the keys and the buttons used to
    // come from two separately-maintained tables that could fall out of step
    expect(SPEED_STEP_KEYS).toEqual(['1', '2', '3', '4']);
    expect(SPEED_STEP_KEYS.length).toBe(SPEED_STEPS.length);
    const bySpeedValue = SPEED_STEP_KEYS.map((key, i) => ({ key, value: SPEED_STEPS[i].value }));
    expect(bySpeedValue).toEqual([
      { key: '1', value: 0 },
      { key: '2', value: 1 },
      { key: '3', value: 3 },
      { key: '4', value: 10 },
    ]);
  });

  for (const lang of ['en', 'ja'] as Language[]) {
    describe(`in ${lang}`, () => {
      const strings = STRINGS[lang];

      it('gives every step a non-empty label and hint', () => {
        for (const step of SPEED_STEPS) {
          expect(step.label(strings).length).toBeGreaterThan(0);
          expect(step.hint(strings).length).toBeGreaterThan(0);
        }
      });

      it('has four distinct button labels - no repeated glyph across steps', () => {
        const labels = SPEED_STEPS.map((step) => step.label(strings));
        expect(new Set(labels).size).toBe(labels.length);
      });

      it('spells out the actual multiplier in every non-pause label', () => {
        const [pause, x1, x3, x10] = SPEED_STEPS.map((step) => step.label(strings));
        expect(pause).not.toContain('1');
        expect(pause).not.toContain('3');
        expect(pause).not.toContain('10');
        expect(x1).toContain('1');
        expect(x3).toContain('3');
        expect(x10).toContain('10');
      });
    });
  }
});
