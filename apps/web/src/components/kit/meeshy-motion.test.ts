import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HAPTIC_CUES, installHapticsDriver } from '@/lib/view/haptics';

import {
  MEESHY_MOTION_TOKENS,
  meeshyMotion,
  meeshyMotionCascadeEnd,
  meeshyMotionDelay,
  meeshyMotionNamed,
  meeshyMotionPlay,
  meeshyMotionProgress,
  meeshyMotionRecipe,
  meeshyMotionSpringCurve,
  meeshyMotionStiffness,
  type MeeshyMotionToken,
} from './meeshy-motion';

const APP = fileURLToPath(new URL('../../../', import.meta.url));

afterEach(() => installHapticsDriver(null));

const springOf = (response: number, damping: number, at: number): number => {
  const omega = (2 * Math.PI) / response;
  const damped = omega * Math.sqrt(1 - damping * damping);
  return 1 - Math.exp(-damping * omega * at) * (Math.cos(damped * at) + ((damping * omega) / damped) * Math.sin(damped * at));
};

describe('MeeshyMotion — la table des sept jetons', () => {
  test('la liste est fermée : sept noms, dans l’ordre de la fiche', () => {
    expect(MEESHY_MOTION_TOKENS).toEqual(['morph', 'travel', 'flip', 'collapse', 'rise', 'float', 'pulse']);
    expect(Object.keys(meeshyMotion)).toEqual([...MEESHY_MOTION_TOKENS]);
  });

  test('les ressorts portent la durée, la réponse et l’amorti de la fiche', () => {
    const spring = (token: MeeshyMotionToken) => {
      const recipe = meeshyMotionRecipe(token);
      return [recipe.nature, recipe.durationMs, recipe.response, recipe.damping];
    };
    expect(spring('morph')).toEqual(['spring', 420, 0.42, 0.7]);
    expect(spring('travel')).toEqual(['spring', 560, 0.56, 0.82]);
    expect(spring('flip')).toEqual(['spring', 500, 0.5, 0.86]);
    expect(spring('rise')).toEqual(['spring', 360, 0.36, 0.86]);
  });

  test('collapse est piloté, float et pulse sont des boucles sans retour', () => {
    expect(meeshyMotionRecipe('collapse')).toMatchObject({ nature: 'driven', durationMs: 0, range: { from: 0, to: 220 } });
    expect(meeshyMotionRecipe('float')).toMatchObject({ nature: 'loop', durationMs: 9000, haptic: 'none' });
    expect(meeshyMotionRecipe('pulse')).toMatchObject({ nature: 'loop', durationMs: 2200, haptic: 'none' });
  });

  test('chaque jeton a son retour haptique, à son instant', () => {
    const haptics = MEESHY_MOTION_TOKENS.map((token) => [token, meeshyMotionRecipe(token).haptic, meeshyMotionRecipe(token).hapticAt]);
    expect(haptics).toEqual([
      ['morph', 'light', 'touch'],
      ['travel', 'medium', 'landing'],
      ['flip', 'rigid', 'midpoint'],
      ['collapse', 'light', 'lock'],
      ['rise', 'none', 'never'],
      ['float', 'none', 'never'],
      ['pulse', 'none', 'never'],
    ]);
  });
});

describe('MeeshyMotion — mouvement réduit', () => {
  test('cinq jetons deviennent le fondu de 160 ms, les deux boucles s’arrêtent', () => {
    for (const token of ['morph', 'travel', 'flip', 'collapse', 'rise'] as const) {
      expect(meeshyMotionRecipe(token, true)).toMatchObject({ nature: 'timed', durationMs: 160, delayStepMs: 0, isStopped: false });
    }
    for (const token of ['float', 'pulse'] as const) {
      expect(meeshyMotionRecipe(token, true).isStopped).toBe(true);
    }
  });

  test('l’haptique du jeton reste sous mouvement réduit', () => {
    expect(meeshyMotionRecipe('morph', true).haptic).toBe('light');
    expect(meeshyMotionRecipe('flip', true).haptic).toBe('rigid');
  });

  test('les recettes nommées ont leur version réduite', () => {
    expect(meeshyMotionNamed('reveal', true).durationMs).toBe(0);
    expect(meeshyMotionNamed('shimmer', true).isStopped).toBe(true);
    expect(meeshyMotionNamed('celebrate', true).isStopped).toBe(true);
    expect(meeshyMotionNamed('reveal').durationMs).toBeGreaterThan(0);
  });
});

describe('MeeshyMotion — les lois', () => {
  test('rien ne dépasse 600 ms hors boucle, et une cascade de dix blocs y est posée', () => {
    for (const token of MEESHY_MOTION_TOKENS) {
      const recipe = meeshyMotionRecipe(token);
      if (recipe.nature !== 'loop') expect(recipe.durationMs).toBeLessThanOrEqual(600);
    }
    expect(meeshyMotionCascadeEnd(10)).toBe(600);
  });

  test('le décalage d’une cascade est de 80 ms par rang, borné à trois, jamais négatif', () => {
    expect([0, 1, 2, 3, 4, 10].map(meeshyMotionDelay)).toEqual([0, 80, 160, 240, 240, 240]);
    expect(meeshyMotionDelay(-5)).toBe(0);
    expect(meeshyMotionDelay(Number.NaN)).toBe(0);
  });

  test('l’avancement piloté est borné à 0 et 1', () => {
    expect(meeshyMotionProgress(-30)).toBe(0);
    expect(meeshyMotionProgress(110)).toBe(0.5);
    expect(meeshyMotionProgress(900)).toBe(1);
    expect(meeshyMotionProgress(50, { from: 0, to: 100 })).toBe(0.5);
    expect(meeshyMotionProgress(5, { from: 10, to: 10 })).toBe(0);
  });

  test('la raideur Android se déduit de la réponse : (2π / réponse)²', () => {
    expect(meeshyMotionStiffness(0.42)).toBeCloseTo(223.8, 0);
    expect(Math.round(meeshyMotionStiffness(0.56))).toBe(126);
    expect(Math.round(meeshyMotionStiffness(0.5))).toBe(158);
    expect(Math.round(meeshyMotionStiffness(0.36))).toBe(305);
  });

  test('le linear() du web s’écarte de moins de 1 % du ressort, et finit à 1', () => {
    for (const token of ['morph', 'travel'] as const) {
      const recipe = meeshyMotionRecipe(token);
      const points = meeshyMotionSpringCurve(token);
      expect(points.length).toBe(13);
      expect(points[0]).toBe(0);
      expect(points[12]).toBe(1);
      points.slice(0, 12).forEach((point, index) => {
        const exact = springOf(recipe.response ?? 1, recipe.damping ?? 1, ((recipe.durationMs / 1000) * index) / 12);
        expect(Math.abs(point - exact)).toBeLessThan(0.01);
      });
    }
  });

  test('morph publie les treize points de la fiche', () => {
    expect(meeshyMotionSpringCurve('morph')).toEqual([0, 0.107, 0.327, 0.561, 0.757, 0.897, 0.984, 1.029, 1.045, 1.044, 1.035, 1.024, 1]);
    expect(meeshyMotionSpringCurve('travel')).toEqual([0, 0.103, 0.308, 0.519, 0.695, 0.825, 0.911, 0.964, 0.992, 1.006, 1.011, 1.011, 1]);
  });
});

describe('MeeshyMotion — le retour haptique', () => {
  const record = (): string[] => {
    const played: string[] = [];
    installHapticsDriver({ cue: (name) => (played.push(name), true), pattern: () => true });
    return played;
  };

  test('un retour joue une fois, none ne joue rien', () => {
    const played = record();
    expect(meeshyMotionPlay('light')).toBe(true);
    expect(meeshyMotionPlay('rigid')).toBe(true);
    expect(meeshyMotionPlay('none')).toBe(false);
    expect(played).toEqual(['light', 'rigid']);
  });

  test('le vocabulaire d’haptique du web a le retour rigide', () => {
    expect(HAPTIC_CUES.rigid[0]).toBeGreaterThan(HAPTIC_CUES.medium[0]);
  });
});

describe('MeeshyMotion — les variables CSS suivent la table', () => {
  const css = readFileSync(join(APP, 'src', 'styles', 'kit-motion.css'), 'utf8');

  test('chaque durée et chaque courbe publiée est celle de la recette', () => {
    for (const token of ['morph', 'travel', 'flip', 'rise'] as const) {
      expect(css).toContain(`--motion-${token}-duration: ${meeshyMotionRecipe(token).durationMs}ms;`);
    }
    expect(css).toContain(`--motion-morph: linear(${meeshyMotionSpringCurve('morph').join(', ')});`);
    expect(css).toContain(`--motion-travel: linear(${meeshyMotionSpringCurve('travel').join(', ')});`);
    expect(css).toContain('--motion-reduced-duration: 160ms;');
  });

  test('sous mouvement réduit, les durées deviennent le fondu et les boucles s’arrêtent', () => {
    const reduced = css.slice(css.indexOf('prefers-reduced-motion'));
    expect(reduced).toContain('--motion-morph-duration: 160ms;');
    expect(reduced).toContain('--motion-float-play: paused;');
  });
});
