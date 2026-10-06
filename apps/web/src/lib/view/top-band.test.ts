import { afterEach, describe, expect, test } from 'bun:test';

import { callResumeShownStore, reportCallResumeShown, showsPlayerBanner, topBandSlots } from './top-band';

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
