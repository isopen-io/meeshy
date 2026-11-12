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

describe('flipKeyframes — un changement de TAILLE se joue lui aussi en transform (ma vignette qui se couche)', () => {
  const from = { x: 262, y: 128, width: 112, height: 160 };
  const to = { x: 698, y: 60, width: 130, height: 96 };

  test('depuis le coin haut-gauche, la boîte repart de sa taille d’avant : translation puis échelle', () => {
    const frames = flipKeyframes({ first: from, last: to, reducedMotion: false, origin: { x: 0, y: 0 } });
    expect(frames).toEqual([{ transform: `translate(${262 - 698}px, ${128 - 60}px) scale(${112 / 130}, ${160 / 96})` }, { transform: 'none' }]);
  });

  test('depuis le coin haut-droit, le bord droit reste en place : la translation compense l’échelle', () => {
    const [start] = flipKeyframes({ first: from, last: to, reducedMotion: false, origin: { x: 1, y: 0 } }) ?? [];
    const sx = 112 / 130;
    expect(start).toEqual({ transform: `translate(${262 - 698 - 130 * (1 - sx)}px, ${128 - 60}px) scale(${sx}, ${160 / 96})` });
  });

  test('sans origine déclarée, la taille ne se joue pas (les autres appelants ne changent pas)', () => {
    expect(flipKeyframes({ first: from, last: { ...to, x: 262, y: 128 }, reducedMotion: false })).toBeNull();
  });

  test('une taille identique ne joue que le déplacement', () => {
    const frames = flipKeyframes({ first: { x: 0, y: 0, width: 100, height: 50 }, last: { x: 0, y: 40, width: 100, height: 50 }, reducedMotion: false, origin: { x: 0, y: 0 } });
    expect(frames).toEqual([{ transform: 'translate(0px, -40px)' }, { transform: 'none' }]);
  });

  test('réduire les animations : la taille change, un fondu court remplace le mouvement (opacité seule)', () => {
    expect(flipKeyframes({ first: from, last: to, reducedMotion: true, origin: { x: 0, y: 0 } })).toEqual([{ opacity: 0 }, { opacity: 1 }]);
  });
});

