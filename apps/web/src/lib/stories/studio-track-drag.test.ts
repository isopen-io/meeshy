import { describe, expect, test } from 'bun:test';

import { draggedTiming, secondsForDelta, trackKeyStep } from './studio-track-drag';

/** GLISSER UNE PISTE, TIRER SES ANCRES (#8482, miroir iOS
 * `ComposerSceneFriseMetrics.dragged`, #8473). */
const origin = { start: 1, end: 3 };

describe('secondsForDelta — un glisser se mesure en secondes sur la largeur de la piste', () => {
  test('50 px sur 200 px d’une scène de 6 s ⇒ 1,5 s ; une piste sans largeur ne bouge pas', () => {
    expect(secondsForDelta({ dx: 50, width: 200, duration: 6 })).toBeCloseTo(1.5);
    expect(secondsForDelta({ dx: 50, width: 0, duration: 6 })).toBe(0);
    expect(secondsForDelta({ dx: Number.NaN, width: 200, duration: 6 })).toBe(0);
  });
});

describe('draggedTiming — la barre DÉPLACE, les ancres ÉTIRENT, jamais hors de la scène', () => {
  test('glisser la barre garde la durée de la fenêtre', () => {
    expect(draggedTiming({ origin, grip: 'bar', delta: 1.5, duration: 6 })).toEqual({ start: 2.5, end: 4.5 });
  });

  test('la barre bute sur les deux bords de la scène, durée gardée', () => {
    expect(draggedTiming({ origin, grip: 'bar', delta: 10, duration: 6 })).toEqual({ start: 4, end: 6 });
    expect(draggedTiming({ origin, grip: 'bar', delta: -5, duration: 6 })).toEqual({ start: 0, end: 2 });
  });

  test('l’ancre de début règle l’entrée, jamais au-delà de fin − 5 %', () => {
    expect(draggedTiming({ origin, grip: 'start', delta: -0.5, duration: 6 })).toEqual({ start: 0.5, end: 3 });
    expect(draggedTiming({ origin, grip: 'start', delta: 9, duration: 6 })).toEqual({ start: 2.7, end: 3 });
    expect(draggedTiming({ origin, grip: 'start', delta: -9, duration: 6 })).toEqual({ start: 0, end: 3 });
  });

  test('l’ancre de fin règle la sortie, jamais avant début + 5 % ni après la scène', () => {
    expect(draggedTiming({ origin, grip: 'end', delta: 1, duration: 6 })).toEqual({ start: 1, end: 4 });
    expect(draggedTiming({ origin, grip: 'end', delta: 9, duration: 6 })).toEqual({ start: 1, end: 6 });
    expect(draggedTiming({ origin, grip: 'end', delta: -9, duration: 6 })).toEqual({ start: 1, end: 1.3 });
  });
});

describe('trackKeyStep — le clavier fait ce que fait le doigt', () => {
  test('flèches : 0,1 s ; avec Maj : 1 s ; autre touche : rien', () => {
    expect(trackKeyStep('ArrowRight', false)).toBeCloseTo(0.1);
    expect(trackKeyStep('ArrowLeft', false)).toBeCloseTo(-0.1);
    expect(trackKeyStep('ArrowRight', true)).toBe(1);
    expect(trackKeyStep('ArrowLeft', true)).toBe(-1);
    expect(trackKeyStep('Enter', false)).toBeNull();
  });
});
