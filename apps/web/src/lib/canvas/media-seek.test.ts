import { describe, expect, test } from 'bun:test';

import { mediaSeekTarget, sceneSeekStep, trackSeekPlan } from './media-seek';

describe('mediaSeekTarget — où poser un média de la scène au temps pointé (#7879)', () => {
  test('un média qui BOUCLE reprend au même endroit de son tour', () => {
    expect(mediaSeekTarget({ t: 7, mediaDuration: 3, loop: true })).toBeCloseTo(1, 5);
  });

  test('un média qui ne boucle pas s’arrête sur sa dernière image', () => {
    expect(mediaSeekTarget({ t: 7, mediaDuration: 3, loop: false })).toBe(3);
  });

  test('avant sa fin, le temps pointé EST le temps du média', () => {
    expect(mediaSeekTarget({ t: 1.5, mediaDuration: 3, loop: true })).toBe(1.5);
  });

  test('durée inconnue (métadonnées non chargées) ⇒ null, on ne pose rien', () => {
    expect(mediaSeekTarget({ t: 1, mediaDuration: Number.NaN, loop: true })).toBeNull();
    expect(mediaSeekTarget({ t: 1, mediaDuration: 0, loop: true })).toBeNull();
  });
});

describe('trackSeekPlan — la piste de fond au temps pointé', () => {
  test('AVANT son départ différé, la piste attend au début de sa fenêtre', () => {
    const plan = trackSeekPlan({ t: 0.5, track: { startOffsetMs: 2000, loop: true, bounds: { startMs: 1000, endMs: 4000 } }, mediaDuration: 10 });
    expect(plan).toEqual({ playedMs: 500, position: null });
  });

  test('APRÈS son départ, la piste avance du temps écoulé depuis ce départ, dans sa fenêtre', () => {
    const plan = trackSeekPlan({ t: 3, track: { startOffsetMs: 2000, loop: true, bounds: { startMs: 1000, endMs: 4000 } }, mediaDuration: 10 });
    expect(plan).toEqual({ playedMs: 3000, position: 2 });
  });

  test('une fenêtre qui boucle se replie sur elle-même', () => {
    const plan = trackSeekPlan({ t: 5, track: { startOffsetMs: 0, loop: true, bounds: { startMs: 1000, endMs: 3000 } }, mediaDuration: 10 });
    expect(plan.position).toBeCloseTo(2, 5);
  });

  test('sans fenêtre, la durée du fichier fait la boucle', () => {
    const plan = trackSeekPlan({ t: 5, track: { startOffsetMs: 0, loop: true }, mediaDuration: 4 });
    expect(plan.position).toBeCloseTo(1, 5);
  });
});

describe('sceneSeekStep — le pas clavier d’une scène', () => {
  test('un dixième de la scène, jamais moins d’une seconde', () => {
    expect(sceneSeekStep(30)).toBe(3);
    expect(sceneSeekStep(6)).toBe(1);
  });
});
