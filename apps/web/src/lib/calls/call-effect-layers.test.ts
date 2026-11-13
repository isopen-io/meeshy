import { describe, expect, test } from 'bun:test';

import { addingGenre, addLayer, canAdd, genreRow, isFull, listLayers, MAX_EFFECT_LAYERS, openingGenre, removeLayer, syncLayers, type EffectGenre, type EffectLayer, type EffectStack } from './call-effect-layers';

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

/** #17915 — les vecteurs de `CallEffectsGenreRule`, recopiés tels quels d'iOS (`CallEffectLayersTests`) dans Kotlin et ici. */
describe('la rangée de genres et (+), vecteurs communs (#17915)', () => {
  const full = genreRow(true, true);
  const effectsOnly = genreRow(true, false);
  const filter: EffectLayer = { genre: 'color', choice: 'golden' };
  const visage: EffectLayer = { genre: 'face', choice: 'toad' };
  const cadre: EffectLayer = { genre: 'frame', choice: 'neon' };

  test('la rangée suit les modes offerts : famille complète, Effets seul, Montage seul, rien', () => {
    expect(full).toEqual(['face', 'color', 'frame']);
    expect(effectsOnly).toEqual(['face', 'color']);
    expect(genreRow(false, true)).toEqual(['frame']);
    expect(genreRow(false, false)).toEqual([]);
  });

  const rows: ReadonlyArray<readonly [string, EffectGenre, EffectStack, readonly EffectGenre[], EffectGenre | null]> = [
    ['visage · [visage] · complète', 'face', [visage], full, 'color'],
    ['couleur · [filtre] · complète', 'color', [filter], full, 'face'],
    ['visage · [filtre, visage] · complète', 'face', [filter, visage], full, 'frame'],
    ['visage · [filtre, visage] · Effets seul', 'face', [filter, visage], effectsOnly, 'color'],
    ['couleur · [filtre, visage] · Effets seul', 'color', [filter, visage], effectsOnly, 'face'],
    ['cadre · [cadre] · complète', 'frame', [cadre], full, 'face'],
    ['cadre · [cadre, visage] · complète', 'frame', [cadre, visage], full, 'color'],
    ['cadre · [filtre, visage] · complète', 'frame', [filter, visage], full, 'face'],
    ['cadre · [cadre] · [cadre]', 'frame', [cadre], ['frame'], null],
    ['cadre · vide · Effets seul (genre hors de la rangée)', 'frame', [], effectsOnly, null],
    ['visage · pile pleine · complète', 'face', [cadre, filter, visage], full, null],
    ['cadre · pile pleine · complète', 'frame', [cadre, filter, visage], full, null],
  ];

  for (const [name, current, stack, row, expected] of rows) {
    test(`(+) ${name}`, () => {
      expect(addingGenre(current, stack, row)).toBe(expected);
    });
  }
});

/** Les vecteurs d'`opening` (iOS `CallEffectLayers.opening(after:among:)`, Kotlin `CallEffectLayers.opening`) : le premier genre ABSENT après le genre courant. */
describe('(+) ouvre le premier genre absent, vecteurs communs', () => {
  const family: readonly EffectGenre[] = ['face', 'color', 'frame'];
  const filter: EffectLayer = { genre: 'color', choice: 'golden' };
  const visage: EffectLayer = { genre: 'face', choice: 'toad' };
  const cadre: EffectLayer = { genre: 'frame', choice: 'neon' };

  test('après le genre courant : vide, visage ⇒ couleur ; [visage], depuis couleur ⇒ rien', () => {
    expect(openingGenre([], 'face', ['face', 'color'])).toBe('color');
    expect(openingGenre([visage], 'color', ['face', 'color'])).toBeNull();
  });

  test('saute les genres déjà posés et reboucle', () => {
    expect(openingGenre([filter], 'face', family)).toBe('frame');
    expect(openingGenre([filter], 'frame', family)).toBe('face');
  });

  test('pile pleine ⇒ rien ; jamais le genre courant lui-même', () => {
    expect(openingGenre([cadre, filter, visage], 'face', ['frame', 'color', 'face', 'landscape', 'voice'])).toBeNull();
    expect(openingGenre([], 'face', ['face'])).toBeNull();
  });

  test('sans genre courant, depuis le début de la rangée', () => {
    expect(openingGenre([visage], null, family)).toBe('color');
    expect(openingGenre([], null, family)).toBe('face');
  });
});
