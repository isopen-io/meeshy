import { describe, expect, test } from 'bun:test';

import {
  studioBackgroundEditOpened,
  studioBackgroundEditResolved,
  studioBackgroundSections,
  studioBackgroundToolActions,
  studioBackgroundToolTapped,
} from './studio-background-tools';

/**
 * ÉDITER LE FOND PASSE PAR LES OUTILS DE DROITE (#8849, jumelle web de
 * `ComposerBackgroundTools` iOS, #8847) — directive porteur 2026-09-30 :
 * « l'édition de la vidéo ou image de fond ne doit plus ouvrir l'ancien
 * éditeur mais juste les outils de droite […] qui affichent les contrôleurs
 * en bas de la scène en masquant ce qui y serait ».
 */
describe('studioBackgroundSections — ce que le fond sert en ligne', () => {
  test('fond image : le Cadre, le filtre, la description', () => {
    expect(studioBackgroundSections({ mediaType: 'image', retouching: false })).toEqual(['frame', 'filter', 'describe']);
  });

  test('fond vidéo : ni filtre (il ne se cuit que dans une image, #8798)', () => {
    expect(studioBackgroundSections({ mediaType: 'video', retouching: false })).toEqual(['frame', 'describe']);
  });

  test('en retouche, le Cadre seul : l’image retouchée ne se décrit ni ne se filtre d’ici', () => {
    expect(studioBackgroundSections({ mediaType: 'image', retouching: true })).toEqual(['frame']);
  });
});

describe('studioBackgroundToolActions — les gestes du fond, à côté de ses outils', () => {
  test('reprendre une photo, passer au premier plan, retirer', () => {
    expect(studioBackgroundToolActions({ offersPhoto: true, overlayFree: true, retouching: false })).toEqual(['retake', 'forward', 'remove']);
  });

  test('un réel ne reprend pas de photo ; un calque déjà posé ferme le premier plan', () => {
    expect(studioBackgroundToolActions({ offersPhoto: false, overlayFree: false, retouching: false })).toEqual(['remove']);
  });

  test('en retouche, seulement retirer', () => {
    expect(studioBackgroundToolActions({ offersPhoto: true, overlayFree: true, retouching: true })).toEqual(['remove']);
  });
});

describe('studioBackgroundEditOpened — toute porte d’édition du fond devient les outils en ligne', () => {
  const served = studioBackgroundSections({ mediaType: 'image', retouching: false });

  test('« Modifier le fond » : seul le rail droit paraît, rien d’ouvert en bas', () => {
    expect(studioBackgroundEditOpened({ requested: null, served })).toEqual({ open: null });
  });

  test('la tuile Cadre : le rail ET les contrôles du Cadre sous la scène', () => {
    expect(studioBackgroundEditOpened({ requested: 'frame', served })).toEqual({ open: 'frame' });
  });

  test('une section que ce fond ne sert pas : le rail seul, jamais un panneau sans effet', () => {
    expect(studioBackgroundEditOpened({ requested: 'filter', served: studioBackgroundSections({ mediaType: 'video', retouching: false }) })).toEqual({ open: null });
  });
});

describe('studioBackgroundToolTapped — toucher un outil ouvre ses contrôles, le retoucher les range', () => {
  test('ouvre, bascule, referme — le rail reste', () => {
    const filtre = studioBackgroundToolTapped('filter', { open: null });
    expect(filtre).toEqual({ open: 'filter' });
    expect(studioBackgroundToolTapped('describe', filtre)).toEqual({ open: 'describe' });
    expect(studioBackgroundToolTapped('filter', filtre)).toEqual({ open: null });
  });
});

describe('studioBackgroundEditResolved — l’édition ne survit pas à son fond', () => {
  test('un fond présent garde son édition', () => {
    expect(studioBackgroundEditResolved({ open: 'frame' }, { hasBackground: true, timelineOpen: false })).toEqual({ open: 'frame' });
  });

  test('fond retiré, défait par l’historique, ou frise ouverte : la scène revient', () => {
    expect(studioBackgroundEditResolved({ open: 'frame' }, { hasBackground: false, timelineOpen: false })).toBeNull();
    expect(studioBackgroundEditResolved({ open: null }, { hasBackground: true, timelineOpen: true })).toBeNull();
    expect(studioBackgroundEditResolved(null, { hasBackground: true, timelineOpen: false })).toBeNull();
  });
});
