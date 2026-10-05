import { describe, expect, test } from 'bun:test';

import { STORY_FILTERS, mediaFilterCss, readMediaFilter } from './media-filter';

/**
 * LE FILTRE D'UN MÉDIA (lot 7, #8474) — `payload.filter` d'un objet `media` de
 * CanvasV3, aux valeurs de `StoryFilter` (`StoryModels.swift`). C'est déjà la
 * place que `CanvasV3Migration.swift` lui donne pour le filtre de slide (le
 * média de fond) ; un média POSÉ porte le sien sur SA charge.
 */
describe('readMediaFilter — la valeur lue sur la charge', () => {
  test('les huit filtres d’iOS, dans l’ordre de `StoryFilter.allCases`', () => {
    expect(STORY_FILTERS).toEqual(['vintage', 'bw', 'warm', 'cool', 'dramatic', 'vivid', 'fade', 'chrome']);
  });

  test('une valeur connue est lue ; une inconnue, une absence ou un autre type ne filtrent rien', () => {
    expect(readMediaFilter({ filter: 'bw' })).toBe('bw');
    expect(readMediaFilter({ filter: 'sepia-plus' })).toBeNull();
    expect(readMediaFilter({})).toBeNull();
    expect(readMediaFilter({ filter: 3 })).toBeNull();
  });
});

describe('mediaFilterCss — le filtre CSS qui le peint', () => {
  test('chaque filtre a sa peinture, distincte des autres', () => {
    const css = STORY_FILTERS.map((id) => mediaFilterCss({ filter: id }));
    expect(css.every((value) => typeof value === 'string' && value !== '')).toBe(true);
    expect(new Set(css).size).toBe(STORY_FILTERS.length);
    expect(mediaFilterCss({ filter: 'bw' })).toContain('grayscale(1)');
  });

  test('sans filtre, rien', () => {
    expect(mediaFilterCss({})).toBeUndefined();
  });
});
