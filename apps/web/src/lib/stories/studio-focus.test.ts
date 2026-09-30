import { describe, expect, test } from 'bun:test';

import { studioChrome, studioOpenTool } from './studio-focus';

/** UN OUTIL OUVERT PREND TOUTE LA PLACE (#8654, jumelle de #8652). */
describe('studioOpenTool — quel outil est ouvert', () => {
  test('un objet en édition ouvre l’outil de l’objet (texte, calque)', () => {
    expect(studioOpenTool({ editing: 'text-1', editsBackground: false })).toBe('object');
  });

  test('l’édition d’un objet passe devant les outils du fond', () => {
    expect(studioOpenTool({ editing: 'overlay', editsBackground: true })).toBe('object');
  });

  test('éditer le fond est un outil ouvert (#8849, jumelle de #8847)', () => {
    expect(studioOpenTool({ editing: null, editsBackground: true })).toBe('background');
  });

  test('rien d’ouvert : aucun outil', () => {
    expect(studioOpenTool({ editing: null, editsBackground: false })).toBeNull();
  });
});

describe('studioChrome — ce qui reste à l’écran', () => {
  test('au repos, tout le chrome est là', () => {
    expect(studioChrome({ tool: null, timelineOpen: false })).toEqual({
      header: true,
      leadingRail: true,
      trailingRail: true,
      socleRow: true,
      socleCard: true,
    });
  });

  test('l’édition d’un objet efface l’en-tête, les deux rails (et leurs +), le socle', () => {
    expect(studioChrome({ tool: 'object', timelineOpen: false })).toEqual({
      header: false,
      leadingRail: false,
      trailingRail: false,
      socleRow: false,
      socleCard: false,
    });
  });

  /** « Quand on a les outils de droite ouverts on n'a pas besoin d'afficher
   * l'audience ou la publication étant dans un outil ! […] On pourrait même
   * enlever le header, les scènes et commandes autres » — porteur 2026-09-30. */
  test('les outils du fond : seul le rail droit reste — audience, Publier, en-tête, scènes et portes cèdent', () => {
    expect(studioChrome({ tool: 'background', timelineOpen: false })).toEqual({
      header: false,
      leadingRail: false,
      trailingRail: true,
      socleRow: false,
      socleCard: false,
    });
  });

  test('refermer l’outil rend EXACTEMENT le chrome d’avant', () => {
    const before = studioChrome({ tool: null, timelineOpen: false });
    studioChrome({ tool: 'background', timelineOpen: false });
    expect(studioChrome({ tool: null, timelineOpen: false })).toEqual(before);
  });

  test('la frise garde son géométrie : sans portes, le rail droit porte sa bascule', () => {
    expect(studioChrome({ tool: null, timelineOpen: true })).toEqual({
      header: true,
      leadingRail: false,
      trailingRail: true,
      socleRow: true,
      socleCard: false,
    });
  });
});
