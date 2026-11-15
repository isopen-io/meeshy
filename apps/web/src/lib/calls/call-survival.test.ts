import { describe, expect, test } from 'bun:test';

import type { ConnectionQualityLevel } from '@meeshy/shared/types/video-call';

import { FREEZE_AFTER_MS, initialSurvival, RESUME_AFTER_MS, stepSurvival, SUSPEND_AFTER_MS, type SurvivalState } from './call-survival';

const run = (samples: ReadonlyArray<readonly [number, ConnectionQualityLevel]>, wantsVideo = true, from: SurvivalState = initialSurvival()): SurvivalState =>
  samples.reduce((state, [at, level]) => stepSurvival(state, { at, level, wantsVideo }), from);

const every = (fromMs: number, toMs: number, level: ConnectionQualityLevel, stepMs = 2_000): ReadonlyArray<readonly [number, ConnectionQualityLevel]> =>
  Array.from({ length: Math.floor((toMs - fromMs) / stepMs) + 1 }, (_, index) => [fromMs + index * stepMs, level] as const);

describe('la survie vidéo sur un lien qui se dégrade (#8047)', () => {
  test('un lien sain garde la vidéo telle quelle', () => {
    expect(run(every(0, 60_000, 'good')).stage).toBe('sending');
  });

  test('un lien mauvais tenu gèle la vidéo à 2 i/s, puis la suspend si le gel ne suffit pas', () => {
    expect(run(every(0, FREEZE_AFTER_MS - 2_000, 'poor')).stage).toBe('sending');
    const frozen = run(every(0, FREEZE_AFTER_MS, 'poor'));
    expect(frozen.stage).toBe('frozen');
    expect(run(every(FREEZE_AFTER_MS + 2_000, FREEZE_AFTER_MS + SUSPEND_AFTER_MS - 2_000, 'poor'), true, frozen).stage).toBe('frozen');
    expect(run(every(FREEZE_AFTER_MS + 2_000, FREEZE_AFTER_MS + SUSPEND_AFTER_MS, 'poor'), true, frozen).stage).toBe('suspended');
  });

  test('un creux passager ne gèle rien : la série mauvaise repart de zéro', () => {
    const samples = [...every(0, FREEZE_AFTER_MS - 2_000, 'poor'), [FREEZE_AFTER_MS, 'fair'] as const, ...every(FREEZE_AFTER_MS + 2_000, 2 * FREEZE_AFTER_MS, 'poor')];
    expect(run(samples).stage).toBe('sending');
  });

  test('la reprise attend un lien bon TENU, plus long que la chute', () => {
    const suspended = run(every(0, FREEZE_AFTER_MS + SUSPEND_AFTER_MS, 'poor'));
    expect(suspended.stage).toBe('suspended');
    const start = FREEZE_AFTER_MS + SUSPEND_AFTER_MS + 2_000;
    expect(run(every(start, start + RESUME_AFTER_MS - 2_000, 'good'), true, suspended).stage).toBe('suspended');
    expect(run(every(start, start + RESUME_AFTER_MS, 'good'), true, suspended).stage).toBe('sending');
    expect(RESUME_AFTER_MS).toBeGreaterThan(FREEZE_AFTER_MS);
  });

  test('un échantillon mauvais pendant la reprise la remet à zéro ; un moyen la tient', () => {
    const suspended = run(every(0, FREEZE_AFTER_MS + SUSPEND_AFTER_MS, 'poor'));
    const start = FREEZE_AFTER_MS + SUSPEND_AFTER_MS + 2_000;
    const broken = [...every(start, start + RESUME_AFTER_MS - 2_000, 'good'), [start + RESUME_AFTER_MS, 'poor'] as const, [start + RESUME_AFTER_MS + 2_000, 'good'] as const];
    expect(run(broken, true, suspended).stage).toBe('suspended');
    const held = [...every(start, start + 4_000, 'good'), [start + 6_000, 'fair'] as const, ...every(start + 8_000, start + RESUME_AFTER_MS, 'good')];
    expect(run(held, true, suspended).stage).toBe('sending');
  });

  test('caméra coupée par l’utilisateur : la survie oublie tout et ne rallume jamais contre son gré', () => {
    const suspended = run(every(0, FREEZE_AFTER_MS + SUSPEND_AFTER_MS, 'poor'));
    const off = stepSurvival(suspended, { at: 30_000, level: 'poor', wantsVideo: false });
    expect(off).toEqual(initialSurvival());
  });
});
