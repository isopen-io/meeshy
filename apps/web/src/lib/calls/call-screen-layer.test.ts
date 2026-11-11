import { describe, expect, test } from 'bun:test';

import { IDLE, layerChrome, layerOffered, nextLayer, panelInThePill, type CallScreenLayer } from './call-screen-layer';

/**
 * UNE CHOSE À LA FOIS (#8578) — l'écran d'appel est dans UN état : repos,
 * menu, un panneau qui REMPLACE les rangées, ou un mode (effets, montage)
 * qui libère tout l'écran.
 */

const menu: CallScreenLayer = { kind: 'menu' };
const menuOverJournal: CallScreenLayer = { kind: 'menu', stowed: 'journal' };
const panel = (name: 'react' | 'record' | 'people' | 'journal'): CallScreenLayer => ({ kind: 'panel', panel: name });
const mode = (name: 'effects' | 'montage'): CallScreenLayer => ({ kind: 'mode', mode: name });

describe('nextLayer', () => {
  test('(…) ouvre le menu, et le referme', () => {
    expect(nextLayer(IDLE, { type: 'toggle-menu' })).toEqual(menu);
    expect(nextLayer(menu, { type: 'toggle-menu' })).toEqual(IDLE);
  });

  test('(…) sur un panneau ferme tout — sauf le journal, qu’il RANGE (#17343)', () => {
    expect(nextLayer(panel('react'), { type: 'toggle-menu' })).toEqual(IDLE);
    expect(nextLayer(panel('record'), { type: 'toggle-menu' })).toEqual(IDLE);
    expect(nextLayer(panel('people'), { type: 'toggle-menu' })).toEqual(IDLE);
  });

  test('#17343 — (…) sur un journal ouvert le range derrière le menu : il ne ferme rien, et refermer les actions le rend', () => {
    expect(nextLayer(panel('journal'), { type: 'toggle-menu' })).toEqual(menuOverJournal);
    expect(nextLayer(menuOverJournal, { type: 'toggle-menu' })).toEqual(panel('journal'));
  });

  test('#17343 — le menu ouvert par-dessus un journal est un menu : ouvrir une option l’ouvre, ✕ ferme tout, ‹ ne change rien', () => {
    expect(nextLayer(menuOverJournal, { type: 'open-panel', panel: 'journal' })).toEqual(panel('journal'));
    expect(nextLayer(menuOverJournal, { type: 'open-panel', panel: 'react' })).toEqual(panel('react'));
    expect(nextLayer(menuOverJournal, { type: 'close' })).toEqual(IDLE);
    expect(nextLayer(menuOverJournal, { type: 'back' })).toEqual(menuOverJournal);
    expect(nextLayer(menuOverJournal, { type: 'enter-mode', mode: 'effects' })).toEqual(mode('effects'));
  });

  test('un panneau REMPLACE les rangées ; rouvrir le même revient au menu', () => {
    expect(nextLayer(menu, { type: 'open-panel', panel: 'react' })).toEqual(panel('react'));
    expect(nextLayer(panel('react'), { type: 'open-panel', panel: 'record' })).toEqual(panel('record'));
    expect(nextLayer(panel('react'), { type: 'open-panel', panel: 'react' })).toEqual(menu);
  });

  test('‹ revient au menu, ✕ ferme tout', () => {
    expect(nextLayer(panel('journal'), { type: 'back' })).toEqual(menu);
    expect(nextLayer(menu, { type: 'back' })).toEqual(IDLE);
    expect(nextLayer(panel('journal'), { type: 'close' })).toEqual(IDLE);
  });

  test('un mode s’ouvre de partout et n’en garde rien ; le quitter rend le repos', () => {
    expect(nextLayer(menu, { type: 'enter-mode', mode: 'effects' })).toEqual(mode('effects'));
    expect(nextLayer(panel('people'), { type: 'enter-mode', mode: 'montage' })).toEqual(mode('montage'));
    expect(nextLayer(mode('effects'), { type: 'exit-mode' })).toEqual(IDLE);
    expect(nextLayer(mode('effects'), { type: 'back' })).toEqual(IDLE);
  });

  test('un seul mode à la fois : entrer dans l’autre le remplace', () => {
    expect(nextLayer(mode('effects'), { type: 'enter-mode', mode: 'montage' })).toEqual(mode('montage'));
  });

  test('en mode, (…) et les panneaux sont hors d’atteinte', () => {
    expect(nextLayer(mode('montage'), { type: 'toggle-menu' })).toEqual(mode('montage'));
    expect(nextLayer(mode('montage'), { type: 'open-panel', panel: 'react' })).toEqual(mode('montage'));
  });

  test('la fin de l’appel rend le repos', () => {
    expect(nextLayer(mode('effects'), { type: 'ended' })).toEqual(IDLE);
    expect(nextLayer(panel('record'), { type: 'ended' })).toEqual(IDLE);
  });

  test('sortir de repos est un repos', () => {
    expect(nextLayer(IDLE, { type: 'exit-mode' })).toEqual(IDLE);
    expect(nextLayer(IDLE, { type: 'close' })).toEqual(IDLE);
  });
});

describe('layerOffered', () => {
  const all = { react: true, record: true, people: true, journal: true, effects: true, montage: true };

  test('ce qui est encore offert reste', () => {
    expect(layerOffered(mode('effects'), all)).toEqual(mode('effects'));
    expect(layerOffered(panel('journal'), all)).toEqual(panel('journal'));
  });

  test('un mode dont l’action disparaît (perte de la vidéo) rend le repos', () => {
    expect(layerOffered(mode('effects'), { ...all, effects: false })).toEqual(IDLE);
    expect(layerOffered(mode('montage'), { ...all, montage: false })).toEqual(IDLE);
  });

  test('un panneau qui n’est plus offert rend le menu', () => {
    expect(layerOffered(panel('record'), { ...all, record: false })).toEqual(menu);
  });

  test('#17343 — un journal rangé dont le journal n’est plus offert rend le menu, sans journal à rendre', () => {
    expect(layerOffered(menuOverJournal, all)).toEqual(menuOverJournal);
    expect(layerOffered(menuOverJournal, { ...all, journal: false })).toEqual(menu);
  });
});

describe('layerChrome', () => {
  /* #17327 — ma vignette ne porte aucune commande : seul son zoom suit la couche. */
  /* Aucune couche n'efface ses commandes au bout d'une attente (#8988) : la
     couche ne dit que ce qu'elle montre, jamais quand cela s'efface. */
  test('au repos : en-tête, pilule, pas de rangées', () => {
    expect(layerChrome(IDLE)).toEqual({ header: true, pill: true, rows: false, panel: null, mode: null, selfZoom: true });
  });

  test('menu : les rangées au-dessus de la pilule', () => {
    expect(layerChrome(menu)).toEqual({ header: true, pill: true, rows: true, panel: null, mode: null, selfZoom: true });
  });

  test('#17343 — le menu par-dessus un journal est un menu : les rangées sortent, aucun panneau n’est ouvert', () => {
    expect(layerChrome(menuOverJournal)).toEqual(layerChrome(menu));
  });

  test('#17343 — le journal ouvert ne libère pas l’écran : l’en-tête et le zoom de ma vignette restent', () => {
    expect(layerChrome(panel('journal'))).toEqual({ header: true, pill: true, rows: false, panel: 'journal', mode: null, selfZoom: true });
  });

  test('panneau : il remplace les rangées', () => {
    expect(layerChrome(panel('react'))).toEqual({ header: true, pill: true, rows: false, panel: 'react', mode: null, selfZoom: true });
  });

  test('mode : TOUT le chrome d’appel s’efface, seul le mode reste', () => {
    expect(layerChrome(mode('montage'))).toEqual({ header: false, pill: false, rows: false, panel: null, mode: 'montage', selfZoom: false });
  });
});

describe('G3.5 — « Ajouter » (Participants) est une feuille, pas une option de la pilule', () => {
  test('Réagir, Enregistrer et le Journal se dessinent dans la pilule ; Ajouter, non', () => {
    expect(panelInThePill('react')).toBe(true);
    expect(panelInThePill('record')).toBe(true);
    expect(panelInThePill('journal')).toBe(true);
    expect(panelInThePill('people')).toBe(false);
  });

  test('la feuille des personnes laisse les rangées (et les rails) sous elle ; une option de la pilule les remplace', () => {
    expect(layerChrome(panel('people'))).toEqual({ header: true, pill: true, rows: true, panel: 'people', mode: null, selfZoom: true });
    expect(layerChrome(panel('record')).rows).toBe(false);
  });
});
