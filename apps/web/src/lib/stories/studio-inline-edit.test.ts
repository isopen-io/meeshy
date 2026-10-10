import { describe, expect, test } from 'bun:test';

import { STUDIO_INLINE_PANEL, studioInlineSectionResolved, studioInlineSectionTapped, studioInlineSections } from './studio-inline-edit';

/**
 * **TEXTE, CALQUE ET FOND S'ÉDITENT DANS LA VUE DE BASE** (#9140, jumelle web
 * de #9138 — `ComposerInlineEditing` iOS) : une famille rend ses sous-outils au
 * rail droit ; toucher l'un ouvre ses options À DROITE, DEPUIS LE HAUT.
 */
describe('studioInlineSections — les sous-outils d’une famille', () => {
  test('un texte : police, effet, couleur, alignement, fond, langue (l’ordre de `TextEditTool.all`), puis la pose au clavier', () => {
    expect(studioInlineSections({ family: 'text' })).toEqual(['style', 'effect', 'color', 'align', 'background', 'language', 'pose']);
  });

  test('un calque : décrire, filtrer, poser', () => {
    expect(studioInlineSections({ family: 'overlay' })).toEqual(['describe', 'filter', 'pose']);
  });
});

describe('studioInlineSectionTapped — toucher ouvre, retoucher range', () => {
  test('un sous-outil fermé s’ouvre', () => {
    expect(studioInlineSectionTapped('style', null)).toBe('style');
  });

  test('toucher l’ouvert le range ; toucher un autre bascule sur lui', () => {
    expect(studioInlineSectionTapped('style', 'style')).toBeNull();
    expect(studioInlineSectionTapped('color', 'style')).toBe('color');
  });
});

describe('studioInlineSectionResolved — une section que l’objet ne sert plus se range', () => {
  test('servie : elle reste ouverte', () => {
    expect(studioInlineSectionResolved('filter', ['describe', 'filter', 'pose'])).toBe('filter');
  });

  test('non servie (le texte devenu calque, une famille changée) : rangée', () => {
    expect(studioInlineSectionResolved('style', ['describe', 'filter', 'pose'])).toBeNull();
  });
});

describe('STUDIO_INLINE_PANEL — à droite, depuis le haut, dans l’espace que la colonne gauche vide rend', () => {
  test('du bord de début jusqu’à la colonne des sous-outils (marge, disque de 44 + 2×2, gouttière), aligné sur son haut ; au bureau, une carte de 320 px à côté du rail', () => {
    expect(STUDIO_INLINE_PANEL).toEqual({ top: 8, start: 10, end: 10 + 48 + 8, roomyWidth: 320 });
  });
});
