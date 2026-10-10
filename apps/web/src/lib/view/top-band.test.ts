import { afterEach, describe, expect, test } from 'bun:test';

import { BANNER_EXIT_MS, callResumeShownStore, nextBannerPhase, reportCallResumeShown, showsPlayerBanner, topBandSlots } from './top-band';

/**
 * LE BANDEAU DU HAUT (#9494) — l'appel prime, puis l'audio ; la bannière du
 * joueur n'occupe la place que quand ni l'un ni l'autre ne la prend.
 */
afterEach(() => reportCallResumeShown(false));

describe('qui occupe le bandeau du haut', () => {
  test('rien ne joue, le joueur est prêt : la bannière du joueur', () => {
    expect(topBandSlots({ call: false, audio: false, player: true })).toEqual({ call: false, audio: false, player: true });
  });

  test('un appel en cours efface la bannière', () => {
    expect(topBandSlots({ call: true, audio: false, player: true })).toEqual({ call: true, audio: false, player: false });
  });

  test('un audio qui joue efface la bannière', () => {
    expect(topBandSlots({ call: false, audio: true, player: true })).toEqual({ call: false, audio: true, player: false });
  });

  test('l’appel et l’audio s’empilent, la bannière reste effacée', () => {
    expect(topBandSlots({ call: true, audio: true, player: true })).toEqual({ call: true, audio: true, player: false });
  });

  test('un joueur absent (jeu masqué, déconnecté, route sans bannière) ne prend aucune place', () => {
    expect(topBandSlots({ call: false, audio: false, player: false })).toEqual({ call: false, audio: false, player: false });
  });
});

describe('« Reprendre l’appel » se déclare au bandeau', () => {
  test('la bannière de reprise annonce qu’elle se montre, puis qu’elle part', () => {
    reportCallResumeShown(true);
    expect(callResumeShownStore.getState().shown).toBe(true);
    reportCallResumeShown(false);
    expect(callResumeShownStore.getState().shown).toBe(false);
  });
});

describe('les routes qui portent la bannière du joueur', () => {
  test('les hubs de la racine la portent', () => {
    for (const key of ['list', 'feed', 'notifications', 'calls', 'profile', 'settings']) expect({ key, shown: showsPlayerBanner(key) }).toEqual({ key, shown: true });
  });

  test('Progression ne la porte pas : le héros y dit déjà tout, et le toucher y mène', () => {
    expect(showsPlayerBanner('progression')).toBe(false);
  });

  test('une route inconnue ne la porte pas : la liste est fermée', () => {
    expect(showsPlayerBanner('thread')).toBe(false);
    expect(showsPlayerBanner('login')).toBe(false);
  });
});

/**
 * LA SORTIE DE LA BANNIÈRE (#9494) — elle ne disparaît pas sèchement quand
 * l'appel ou l'audio arrive : elle SORT (un glissement), et seulement quand son
 * remplaçant est PRÊT — jamais un bandeau vide pendant que le mini-lecteur se
 * charge. Quatre phases : montrée, en attente du remplaçant, en sortie, partie.
 */
describe('nextBannerPhase', () => {
  const at = (phase: Parameters<typeof nextBannerPhase>[0]['phase'], patch: Partial<Parameters<typeof nextBannerPhase>[0]> = {}) =>
    nextBannerPhase({ phase, wanted: false, occupied: true, occupantReady: true, ...patch });

  test('voulue : elle est montrée, d’où qu’elle vienne (elle revient quand l’occupant part)', () => {
    for (const phase of ['shown', 'holding', 'leaving', 'gone'] as const) expect(at(phase, { wanted: true })).toBe('shown');
  });

  test('l’occupant est prêt : la bannière sort', () => {
    expect(at('shown')).toBe('leaving');
    expect(at('holding')).toBe('leaving');
  });

  test('l’occupant se charge encore : la bannière reste, le bandeau n’est jamais vide', () => {
    expect(at('shown', { occupantReady: false })).toBe('holding');
    expect(at('holding', { occupantReady: false })).toBe('holding');
  });

  test('personne ne la remplace (jeu masqué, route sans bannière, déconnexion) : elle part tout de suite, sans sortie', () => {
    expect(at('shown', { occupied: false })).toBe('gone');
    expect(at('holding', { occupied: false })).toBe('gone');
  });

  test('une bannière déjà partie ne revient pas toute seule ; une sortie en cours se poursuit', () => {
    expect(at('gone')).toBe('gone');
    expect(at('leaving', { occupantReady: false })).toBe('leaving');
  });

  test('la sortie dure moins d’un quart de seconde', () => {
    expect(BANNER_EXIT_MS).toBeGreaterThan(0);
    expect(BANNER_EXIT_MS).toBeLessThanOrEqual(250);
  });
});
