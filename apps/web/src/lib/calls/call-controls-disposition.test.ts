import { describe, expect, test } from 'bun:test';

import { callControlSet } from './call-controls';
import { controlsDisposition, participantCountOf, pillRows, railRows, RAIL_SIDE, unfoldsPill } from './call-controls-disposition';
import { IDLE, type CallScreenLayer } from './call-screen-layer';

/**
 * **OÙ SE RANGENT LES ACTIONS DU `(…)`** (#17327, miroir de
 * `CallControlsDisposition` d'iOS) — selon le nombre de participants : À DEUX,
 * deux rails sur les bords (« mon image » d'un côté, « l'appel » de l'autre) et
 * la pilule ne grandit pas ; À PLUSIEURS, deux rangées légendées DANS la
 * pilule, aucun rail par-dessus la grille. La disposition est une fonction du
 * nombre de participants, jamais un état : de deux à trois en cours d'appel, la
 * forme change, l'état du `(…)` non.
 */

const menu: CallScreenLayer = { kind: 'menu' };
const panel = (name: 'react' | 'record' | 'people' | 'journal'): CallScreenLayer => ({ kind: 'panel', panel: name });
const mode: CallScreenLayer = { kind: 'mode', mode: 'effects' };

const set = (overrides: Partial<Parameters<typeof callControlSet>[0]> = {}) =>
  callControlSet({ phase: { kind: 'connected' }, callId: 'call-1', cameraOn: true, screenSharing: false, canShare: true, canEffect: true, cameraSwitch: 'flip', videoScene: true, ...overrides });

const families = (rows: readonly { readonly family: string }[]) => rows.map((row) => row.family);

describe('controlsDisposition', () => {
  test('à deux, des rails', () => {
    expect(controlsDisposition({ participantCount: 2 })).toBe('rails');
  });

  test('seul en attendant, des rails aussi', () => {
    expect(controlsDisposition({ participantCount: 1 })).toBe('rails');
  });

  test('à trois ou plus, des rangées dans la pilule', () => {
    expect(controlsDisposition({ participantCount: 3 })).toBe('rows');
    expect(controlsDisposition({ participantCount: 8 })).toBe('rows');
  });

  test('une grille à l’écran donne des rangées, quel que soit le compte : des rails masqueraient ses vignettes', () => {
    expect(controlsDisposition({ participantCount: 2, showsGroupGrid: true })).toBe('rows');
  });
});

describe('participantCountOf', () => {
  test('la grille compte moi et ses pairs', () => {
    expect(participantCountOf({ members: { a: {}, b: {} } as never }, 'grid')).toBe(3);
  });

  test('un invité qui sonne encore n’est pas un participant (`GroupCallRoster` d’iOS n’admet que les arrivées)', () => {
    expect(participantCountOf({ members: { a: { link: 'connected' }, b: { link: 'ringing' }, c: { link: 'connecting' } } as never }, 'grid')).toBe(3);
  });

  test('hors grille, deux : moi et l’autre', () => {
    expect(participantCountOf({ members: { a: {} } as never }, 'video-duo')).toBe(2);
    expect(participantCountOf({ members: {} }, 'portrait')).toBe(2);
  });
});

describe('railRows — les rails du duo', () => {
  test('(…) ouvert : un rail par famille, « mon image » puis « l’appel »', () => {
    expect(families(railRows('rails', set(), menu))).toEqual(['mine', 'call']);
  });

  test('(…) rangé : aucun rail', () => {
    expect(railRows('rails', set(), IDLE)).toEqual([]);
  });

  test('un mode libère l’écran : aucun rail', () => {
    expect(railRows('rails', set(), mode)).toEqual([]);
  });

  test('un panneau dessiné dans la pilule remplace les rails, comme il remplace les rangées (#8578)', () => {
    for (const open of ['react', 'record', 'journal'] as const) expect(railRows('rails', set(), panel(open))).toEqual([]);
  });

  test('G3.5 — la feuille des personnes laisse les rails en place : elle ne les remplace pas', () => {
    expect(families(railRows('rails', set(), panel('people')))).toEqual(['mine', 'call']);
    expect(unfoldsPill('rails', panel('people'))).toBe(false);
    expect(unfoldsPill('rows', panel('people'))).toBe(true);
    expect(families(pillRows('rows', set(), panel('people')))).toEqual(['mine', 'call']);
  });

  test('« mon image », caméra allumée : Caméra · Retourner · Effets · Écran', () => {
    expect(railRows('rails', set(), menu).find((row) => row.family === 'mine')?.actions).toEqual(['camera', 'flip', 'effects', 'screen']);
  });

  test('« mon image », caméra éteinte : Caméra et Écran seulement', () => {
    expect(railRows('rails', set({ cameraOn: false }), menu).find((row) => row.family === 'mine')?.actions).toEqual(['camera', 'screen']);
  });

  test('« l’appel » : Sous-titres · Enregistrer · Ajouter · Journal · Réagir · Capture', () => {
    expect(railRows('rails', set(), menu).find((row) => row.family === 'call')?.actions).toEqual(['captions', 'record', 'invite', 'journal', 'react', 'capture']);
  });

  test('un rail sans bouton ne sort pas : pendant la sonnerie, « l’appel » n’a rien à offrir', () => {
    expect(families(railRows('rails', set({ phase: { kind: 'outgoing' }, canShare: false, cameraOn: false }), menu))).toEqual(['mine']);
  });

  test('chaque famille a son bord : « mon image » au début, « l’appel » à la fin', () => {
    expect(RAIL_SIDE).toEqual({ mine: 'leading', call: 'trailing' });
  });
});

describe('pillRows — les rangées du groupe', () => {
  test('(…) ouvert : les deux rangées légendées se déplient dans la pilule', () => {
    expect(families(pillRows('rows', set(), menu))).toEqual(['mine', 'call']);
    expect(unfoldsPill('rows', menu)).toBe(true);
  });

  test('jamais de rail par-dessus la grille', () => {
    for (const layer of [IDLE, menu, panel('journal'), panel('react'), mode]) expect(railRows('rows', set(), layer)).toEqual([]);
  });

  test('à deux, la pilule ne déplie jamais les rangées', () => {
    for (const layer of [IDLE, menu, mode]) expect(pillRows('rails', set(), layer)).toEqual([]);
  });
});

describe('unfoldsPill — la pilule ne grandit pas à deux', () => {
  test('à deux, (…) ouvert ne la fait pas grandir', () => {
    expect(unfoldsPill('rails', menu)).toBe(false);
    expect(unfoldsPill('rails', IDLE)).toBe(false);
  });

  test('un panneau qu’elle contient la fait grandir, à deux comme à plusieurs', () => {
    expect(unfoldsPill('rails', panel('react'))).toBe(true);
    expect(unfoldsPill('rows', panel('record'))).toBe(true);
  });

  test('au repos et dans un mode, à plusieurs, elle reste elle-même', () => {
    expect(unfoldsPill('rows', IDLE)).toBe(false);
    expect(unfoldsPill('rows', mode)).toBe(false);
  });
});

describe('de deux à trois, l’état du (…) ne bouge pas', () => {
  test('le menu ouvert change de forme : rails à deux, rangées à trois', () => {
    const duo = controlsDisposition({ participantCount: 2 });
    const group = controlsDisposition({ participantCount: 3 });
    expect(families(railRows(duo, set(), menu))).toEqual(['mine', 'call']);
    expect(pillRows(duo, set(), menu)).toEqual([]);
    expect(families(pillRows(group, set(), menu))).toEqual(['mine', 'call']);
    expect(railRows(group, set(), menu)).toEqual([]);
  });

  test('chaque action apparaît une fois, dans l’une ou l’autre forme', () => {
    const onRails = railRows('rails', set(), menu).flatMap((row) => row.actions);
    const inRows = pillRows('rows', set(), menu).flatMap((row) => row.actions);
    expect(onRails).toEqual(inRows);
    expect(new Set(onRails).size).toBe(onRails.length);
  });
});
