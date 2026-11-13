import { describe, expect, test } from 'bun:test';

import { addLayer, canAdd, isFull, listLayers, MAX_EFFECT_LAYERS, nextGenre, removeLayer, syncLayers, type EffectLayer, type EffectStack } from './call-effect-layers';

/**
 * LA PILE DE TROIS COUCHES (#17903, décision porteur du 2026-11-13 sur #16979) — Effets, filtres et
 * cadres sont UNE famille : au plus trois couches, un genre à la fois. Les vecteurs communs sont
 * ceux de l'issue, copiés tels quels dans les suites Swift (`CallEffectLayers`) et Kotlin.
 */

const frame: EffectLayer = { genre: 'frame', choice: 'neon' };
const filterA: EffectLayer = { genre: 'color', choice: 'golden' };
const filterB: EffectLayer = { genre: 'color', choice: 'film' };
const face: EffectLayer = { genre: 'face', choice: 'toad' };
const landscape: EffectLayer = { genre: 'landscape', choice: 'beach' };

describe('la pile de trois couches — vecteurs communs aux trois plateformes', () => {
  test('vide + cadre ⇒ [cadre]', () => {
    expect(addLayer([], frame)).toEqual([frame]);
  });

  test('[cadre] + filtre + visage ⇒ trois couches, la pile est pleine', () => {
    const stack = addLayer(addLayer([frame], filterA), face);
    expect(stack).toEqual([frame, filterA, face]);
    expect(stack).toHaveLength(MAX_EFFECT_LAYERS);
    expect(isFull(stack)).toBe(true);
  });

  test('pleine + paysage ⇒ inchangée et pleine', () => {
    const full: EffectStack = [frame, filterA, face];
    const after = addLayer(full, landscape);
    expect(after).toEqual(full);
    expect(isFull(after)).toBe(true);
    expect(canAdd(full, 'landscape')).toBe(false);
  });

  test('[cadre, filtre A] + filtre B ⇒ [cadre, filtre B] : le genre présent est remplacé À SA PLACE', () => {
    expect(addLayer([frame, filterA], filterB)).toEqual([frame, filterB]);
  });

  test('retirer le milieu de [cadre, filtre, visage] ⇒ [cadre, visage]', () => {
    expect(removeLayer([frame, filterA, face], 'color')).toEqual([frame, face]);
  });

  test('retirer une couche absente ⇒ inchangée', () => {
    const stack: EffectStack = [frame, face];
    expect(removeLayer(stack, 'color')).toEqual(stack);
  });
});

describe('la pile — les cas qui entourent les vecteurs', () => {
  test('pleine, remplacer un genre déjà présent reste permis ; en ajouter un absent non', () => {
    const full: EffectStack = [frame, filterA, face];
    expect(canAdd(full, 'color')).toBe(true);
    expect(addLayer(full, filterB)).toEqual([frame, filterB, face]);
    expect(canAdd([frame], 'voice')).toBe(true);
  });

  test('« Aucun » dans un genre retire la couche de ce genre', () => {
    expect(addLayer([frame, filterA, face], { genre: 'color', choice: 'none' })).toEqual([frame, face]);
    expect(addLayer([frame], { genre: 'face', choice: 'none' })).toEqual([frame]);
  });

  test('listée de la couche du dessus à celle du dessous', () => {
    expect(listLayers([frame, filterA, face])).toEqual([face, filterA, frame]);
    expect(listLayers([])).toEqual([]);
  });

  test('(+) ouvre le premier genre offert qui manque à la pile ; pleine, aucun', () => {
    expect(nextGenre([face], ['face', 'color'])).toBe('color');
    expect(nextGenre([face, filterA], ['face', 'color'])).toBeNull();
    expect(nextGenre([], ['face', 'color'])).toBe('face');
    expect(nextGenre([frame, filterA, face], ['face', 'color', 'landscape'])).toBeNull();
  });

  test('la pile n’est jamais mutée', () => {
    const stack: EffectStack = Object.freeze([frame, filterA]);
    expect(() => addLayer(stack, face)).not.toThrow();
    expect(() => removeLayer(stack, 'frame')).not.toThrow();
    expect(stack).toEqual([frame, filterA]);
  });
});

describe('syncLayers — la pile suit ce qui est réellement appliqué', () => {
  test('un genre appliqué hors de la pile s’empile au-dessus, sans bouger les autres', () => {
    expect(syncLayers([frame], [face], ['face', 'color'])).toEqual([frame, face]);
  });

  test('un genre qui n’est plus appliqué quitte la pile, un genre qui change reste À SA PLACE', () => {
    expect(syncLayers([filterA, face], [{ genre: 'color', choice: 'film' }], ['face', 'color'])).toEqual([{ genre: 'color', choice: 'film' }]);
    expect(syncLayers([filterA, face], [face, filterB], ['face', 'color'])).toEqual([filterB, face]);
  });

  test('un genre dont le mode n’est pas propriétaire n’est jamais touché', () => {
    expect(syncLayers([frame, face], [], ['face', 'color'])).toEqual([frame]);
  });

  test('jamais plus de trois couches, même si trois genres s’ajoutent d’un coup', () => {
    expect(syncLayers([], [frame, filterA, face, landscape], ['frame', 'color', 'face', 'landscape'])).toHaveLength(MAX_EFFECT_LAYERS);
  });

  test('rien à changer ⇒ la MÊME pile (aucune réécriture inutile)', () => {
    const stack: EffectStack = [filterA, face];
    expect(syncLayers(stack, [face, filterA], ['face', 'color'])).toBe(stack);
  });
});
