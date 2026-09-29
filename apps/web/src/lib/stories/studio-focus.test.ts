import { describe, expect, test } from 'bun:test';

import { studioChrome, studioOpenTool } from './studio-focus';

/** UN OUTIL OUVERT PREND TOUTE LA PLACE (#8654, jumelle de #8652). */
describe('studioOpenTool — quel outil est ouvert', () => {
  test('un objet en édition ouvre l’outil de l’objet (texte, calque)', () => {
    expect(studioOpenTool({ editing: 'text-1', frameOpen: false, hasBackground: false, timelineOpen: false })).toBe('object');
  });

  test('l’édition d’un objet passe devant le Cadre', () => {
    expect(studioOpenTool({ editing: 'overlay', frameOpen: true, hasBackground: true, timelineOpen: false })).toBe('object');
  });

  test('le Cadre ne s’ouvre que sur un média de fond, frise fermée', () => {
    expect(studioOpenTool({ editing: null, frameOpen: true, hasBackground: true, timelineOpen: false })).toBe('frame');
    expect(studioOpenTool({ editing: null, frameOpen: true, hasBackground: false, timelineOpen: false })).toBeNull();
    expect(studioOpenTool({ editing: null, frameOpen: true, hasBackground: true, timelineOpen: true })).toBeNull();
  });

  test('rien d’ouvert : aucun outil', () => {
    expect(studioOpenTool({ editing: null, frameOpen: false, hasBackground: true, timelineOpen: false })).toBeNull();
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

  test('un outil ouvert efface l’en-tête, les deux rails (et leurs +), le socle', () => {
    for (const tool of ['object', 'frame'] as const) {
      expect(studioChrome({ tool, timelineOpen: false })).toEqual({
        header: false,
        leadingRail: false,
        trailingRail: false,
        socleRow: false,
        socleCard: false,
      });
    }
  });

  test('refermer l’outil rend EXACTEMENT le chrome d’avant', () => {
    const before = studioChrome({ tool: null, timelineOpen: false });
    studioChrome({ tool: 'object', timelineOpen: false });
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
