import { describe, expect, test } from 'bun:test';

import { TYPING_WAVE, playTypingWave, type TypingWaveTarget } from './typing-wave';

/**
 * LA VAGUE DE FRAPPE (#8288) — l'effet de la barre du composeur universel iOS
 * (`UniversalComposerBar`, `typeWave` : 1,015 × 0,97, ressort vif), rejoué
 * par le champ en verre liquide du téléphone de l'inscription.
 */

function recordingTarget() {
  const calls: { keyframes: readonly Keyframe[]; options: KeyframeAnimationOptions }[] = [];
  const cancelled: number[] = [];
  const target: TypingWaveTarget = {
    animate: (keyframes, options) => {
      const index = calls.length;
      calls.push({ keyframes: keyframes as readonly Keyframe[], options: options as KeyframeAnimationOptions });
      return { cancel: () => cancelled.push(index) };
    },
  };
  return { target, calls, cancelled };
}

describe('une frappe fait onduler le verre', () => {
  test('la vague passe par l’étirement du composeur iOS, puis revient au repos', () => {
    const { target, calls } = recordingTarget();
    playTypingWave(target, { reducedMotion: () => false });
    expect(calls.length).toBe(1);
    const transforms = calls[0]!.keyframes.map((k) => k.transform);
    expect(transforms).toContain(`scale(${TYPING_WAVE.stretchX}, ${TYPING_WAVE.squashY})`);
    expect(transforms[0]).toBe('scale(1, 1)');
    expect(transforms[transforms.length - 1]).toBe('scale(1, 1)');
  });

  test('une frappe rapide ne cumule pas les vagues : la précédente est annulée', () => {
    const { target, cancelled } = recordingTarget();
    playTypingWave(target, { reducedMotion: () => false });
    playTypingWave(target, { reducedMotion: () => false });
    expect(cancelled).toEqual([0]);
  });

  test('la vague reste un TRANSFORM — composité, jamais une propriété de mise en page', () => {
    const { target, calls } = recordingTarget();
    playTypingWave(target, { reducedMotion: () => false });
    expect(calls[0]!.keyframes.every((k) => Object.keys(k).every((key) => key === 'transform' || key === 'offset'))).toBe(true);
  });
});

describe('Réduire les animations', () => {
  test('aucune vague', () => {
    const { target, calls } = recordingTarget();
    playTypingWave(target, { reducedMotion: () => true });
    expect(calls.length).toBe(0);
  });
});

test('un moteur sans `animate` ne casse rien', () => {
  expect(() => playTypingWave({}, { reducedMotion: () => false })).not.toThrow();
  expect(() => playTypingWave(null, { reducedMotion: () => false })).not.toThrow();
});
