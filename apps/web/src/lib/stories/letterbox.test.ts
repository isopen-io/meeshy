import { describe, expect, test } from 'bun:test';

import { letterboxBands, letterboxHashes, letterboxIsServed } from './letterbox';
import type { CanvasObject, CanvasScene } from '@/lib/canvas/document';

/**
 * `letterboxBands`/`letterboxIsServed`/`letterboxHashes` (T2, #6899) — miroir
 * de `StoryLetterboxFill.swift` (§ 1.5 de la spécification `stories-lecteur`).
 */
describe('letterboxBands — la bande qu’un média AJUSTÉ laisse dans le canvas', () => {
  test('un média PAYSAGE dans un canvas 9:16 laisse une bande HORIZONTALE', () => {
    expect(letterboxBands({ media: { width: 1920, height: 1080 }, canvas: { width: 1080, height: 1920 } })).toEqual({
      side: 'horizontal',
      thickness: 656.25,
    });
  });

  test('un média PLUS ÉTROIT que le canvas laisse une bande VERTICALE', () => {
    expect(letterboxBands({ media: { width: 500, height: 1920 }, canvas: { width: 1080, height: 1920 } })).toEqual({
      side: 'vertical',
      thickness: 290,
    });
  });

  test('un média à la MÊME forme que le canvas ne laisse rien', () => {
    expect(letterboxBands({ media: { width: 1080, height: 1920 }, canvas: { width: 1080, height: 1920 } })).toEqual({ side: 'none', thickness: 0 });
  });

  test('une bande sous 1 pt est un artefact d’arrondi — `none`', () => {
    expect(letterboxBands({ media: { width: 1079, height: 1920 }, canvas: { width: 1080, height: 1920 } })).toEqual({ side: 'none', thickness: 0 });
  });

  test('une dimension nulle ou négative ne produit aucune bande', () => {
    expect(letterboxBands({ media: { width: 0, height: 1920 }, canvas: { width: 1080, height: 1920 } })).toEqual({ side: 'none', thickness: 0 });
    expect(letterboxBands({ media: { width: 1920, height: 1080 }, canvas: { width: 0, height: 1920 } })).toEqual({ side: 'none', thickness: 0 });
  });
});

describe('letterboxIsServed — SEULEMENT `fit`, et seulement avec une source', () => {
  test('`fit` avec source ⇒ vrai', () => {
    expect(letterboxIsServed({ fitMode: 'fit', hasSource: true })).toBe(true);
  });

  test('`fit` SANS source ⇒ faux', () => {
    expect(letterboxIsServed({ fitMode: 'fit', hasSource: false })).toBe(false);
  });

  test('`fill`, `undefined`, ou toute autre valeur ⇒ faux, même avec source', () => {
    expect(letterboxIsServed({ fitMode: 'fill', hasSource: true })).toBe(false);
    expect(letterboxIsServed({ fitMode: undefined, hasSource: true })).toBe(false);
    expect(letterboxIsServed({ fitMode: 'stretch', hasSource: true })).toBe(false);
  });
});

const object = (overrides: Partial<CanvasObject>): CanvasObject => ({
  id: 'o',
  kind: 'media',
  anchor: { t: 'free', x: 0.5, y: 0.5 },
  plane: 'bg',
  z: 0,
  transform: { scale: 1, rotation: 0, opacity: 1 },
  payload: {},
  ...overrides,
});

describe('letterboxHashes — la cascade des sources, dans l’ordre où on les essaie', () => {
  test('le fond, puis les premiers plans par z DÉCROISSANT, puis le hash de la scène', () => {
    const scene: CanvasScene = {
      id: 's1',
      objects: [
        object({ id: 'bg', plane: 'bg', z: 0, payload: { thumbHash: 'FOND' } }),
        object({ id: 'fg-low', plane: 'content', z: 1, payload: { thumbHash: 'PLAN-BAS' } }),
        object({ id: 'fg-high', plane: 'content', z: 2, payload: { thumbHash: 'PLAN-HAUT' } }),
      ],
      thumbHash: 'SLIDE',
    };
    expect(letterboxHashes(scene)).toEqual(['FOND', 'PLAN-HAUT', 'PLAN-BAS', 'SLIDE']);
  });

  test('un candidat absent ou vide est écarté, et les doublons sont dédoublonnés', () => {
    const scene: CanvasScene = {
      id: 's1',
      objects: [
        object({ id: 'bg', plane: 'bg', z: 0, payload: { thumbHash: 'MEME' } }),
        object({ id: 'fg', plane: 'content', z: 1, payload: { thumbHash: '' } }),
      ],
      thumbHash: 'MEME',
    };
    expect(letterboxHashes(scene)).toEqual(['MEME']);
  });

  test('rien nulle part ⇒ liste vide', () => {
    expect(letterboxHashes({ id: 's1', objects: [] })).toEqual([]);
  });

  /* LA FORME RÉELLE (relevé `gate.staging.meeshy.me`, 2026-09-17) : un objet
     `bg` SANS image porte le cadrage, et le fond qui porte l'image est un
     objet `content` + `isBackground` posé après lui. Le fond à consulter est
     celui que le moteur PEINT (`backgroundMedia`), jamais le premier objet de
     fond venu — la première forme prenait l'objet vide et ne lisait donc
     jamais le hash de l'image. */
  test('le fond ÉLU (celui qui porte l’image), jamais l’objet `bg` vide posé avant lui', () => {
    const scene: CanvasScene = {
      id: 's1',
      objects: [
        object({ id: 'bg', plane: 'bg', z: 0, payload: { transform: { videoFitMode: 'fit' } } }),
        object({ id: 'pic', plane: 'content', z: 1, payload: { isBackground: true, postMediaId: 'm1', thumbHash: 'IMAGE' } }),
        object({ id: 'fg', plane: 'content', z: 2, payload: { thumbHash: 'COLLAGE' } }),
      ],
      thumbHash: 'SLIDE',
    };
    expect(letterboxHashes(scene)).toEqual(['IMAGE', 'COLLAGE', 'SLIDE']);
  });

  test('le fond de la scène compte, jamais un premier plan à sa place', () => {
    const scene: CanvasScene = {
      id: 's1',
      objects: [object({ id: 'fg', plane: 'content', z: 5, payload: { thumbHash: 'PLAN' } })],
    };
    expect(letterboxHashes(scene)).toEqual(['PLAN']);
  });
});
