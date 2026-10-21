import { describe, expect, test } from 'bun:test';

import { FLIP_PROPERTIES, flipKeyframes } from './flip';

/**
 * **FLIP : UN DÉPLACEMENT SE JOUE EN `transform`, JAMAIS EN `left`/`top`/`height`** (#11314).
 * La mise en page passe d'un coup à son état final ; le mouvement est l'inverse
 * du déplacement, rejoué vers zéro — compositeur seul, aucune mise en page par image.
 */
describe('flipKeyframes — l’inverse du déplacement, joué vers zéro', () => {
  test('l’élément a bougé de (40, 100) vers (40, 220) : il repart de 120 px plus haut', () => {
    const frames = flipKeyframes({ first: { x: 40, y: 100 }, last: { x: 40, y: 220 }, reducedMotion: false });
    expect(frames).toEqual([{ transform: 'translate(0px, -120px)' }, { transform: 'none' }]);
  });

  test('un déplacement horizontal et vertical s’inverse sur les deux axes', () => {
    const frames = flipKeyframes({ first: { x: 300, y: 600 }, last: { x: 20, y: 80 }, reducedMotion: false });
    expect(frames?.[0]).toEqual({ transform: 'translate(280px, 520px)' });
  });

  test('rien n’a bougé : aucune animation à jouer', () => {
    expect(flipKeyframes({ first: { x: 10, y: 10 }, last: { x: 10, y: 10 }, reducedMotion: false })).toBeNull();
    expect(flipKeyframes({ first: { x: 10, y: 10 }, last: { x: 10.3, y: 10.4 }, reducedMotion: false })).toBeNull();
  });

  test('réduire le mouvement : la bascule est sèche', () => {
    expect(flipKeyframes({ first: { x: 0, y: 0 }, last: { x: 0, y: 200 }, reducedMotion: true })).toBeNull();
  });

  test('un fondu d’entrée accompagne — ou remplace — le déplacement, par l’opacité seule', () => {
    const still = flipKeyframes({ first: { x: 0, y: 0 }, last: { x: 0, y: 0 }, reducedMotion: false, fadeFrom: 0.4 });
    expect(still).toEqual([{ opacity: 0.4 }, { opacity: 1 }]);
    const moved = flipKeyframes({ first: { x: 0, y: 0 }, last: { x: 0, y: 50 }, reducedMotion: false, fadeFrom: 0.4 });
    expect(moved).toEqual([{ transform: 'translate(0px, -50px)', opacity: 0.4 }, { transform: 'none', opacity: 1 }]);
    expect(flipKeyframes({ first: { x: 0, y: 0 }, last: { x: 0, y: 0 }, reducedMotion: true, fadeFrom: 0.4 })).toBeNull();
  });

  test('seules les propriétés du compositeur sortent d’une image clé', () => {
    const frames = flipKeyframes({ first: { x: 1, y: 1 }, last: { x: 9, y: 90 }, reducedMotion: false, fadeFrom: 0.5 }) ?? [];
    const keys = frames.flatMap((frame) => Object.keys(frame));
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(FLIP_PROPERTIES).toContain(key);
  });
});
