import { describe, expect, test } from 'bun:test';

import {
  PLAYER_BANNER_AWAY_MS,
  PLAYER_BANNER_EXIT_MS,
  PLAYER_BANNER_HOLD_MS,
  createPlayerBannerVisit,
  isRealAbsence,
  watchPlayerBannerAbsence,
  nextVisitPhase,
} from './player-banner-visit';

/**
 * LA VISITE DE LA BANNIÈRE (#9536) — la bannière du joueur n'apparaît qu'à
 * l'OUVERTURE de l'application : au démarrage à froid, ou au retour au premier
 * plan après une vraie absence. Elle reste 30 s, puis s'en va lentement en
 * remontant vers le haut. Changer d'onglet ne la rappelle jamais.
 */
describe('les durées dites par le porteur', () => {
  test('30 s de présence, une sortie lente d’environ une seconde', () => {
    expect(PLAYER_BANNER_HOLD_MS).toBe(30_000);
    expect(PLAYER_BANNER_EXIT_MS).toBeGreaterThanOrEqual(800);
    expect(PLAYER_BANNER_EXIT_MS).toBeLessThanOrEqual(1_200);
  });
});

describe('les phases', () => {
  test('armée à l’ouverture, montrée à la première peinture, en sortie à l’échéance, retirée ensuite', () => {
    expect(nextVisitPhase('armed', 'shown')).toBe('shown');
    expect(nextVisitPhase('shown', 'expired')).toBe('leaving');
    expect(nextVisitPhase('leaving', 'exited')).toBe('gone');
  });

  test('retirée, elle ne revient pas toute seule : ni une peinture ni une échéance ne la rappellent', () => {
    expect(nextVisitPhase('gone', 'shown')).toBe('gone');
    expect(nextVisitPhase('gone', 'expired')).toBe('gone');
  });

  test('l’échéance ne coupe pas une bannière qui n’a jamais été peinte : elle attend sa première peinture', () => {
    expect(nextVisitPhase('armed', 'expired')).toBe('armed');
  });

  test('une nouvelle ouverture réarme, d’où qu’on vienne', () => {
    for (const phase of ['armed', 'shown', 'leaving', 'gone'] as const) expect(nextVisitPhase(phase, 'reopened')).toBe('armed');
  });
});

describe('une vraie absence', () => {
  test('quelques secondes en arrière-plan (un onglet, une notification) ne comptent pas', () => {
    expect(isRealAbsence(5_000)).toBe(false);
    expect(isRealAbsence(PLAYER_BANNER_AWAY_MS - 1)).toBe(false);
  });

  test('au-delà du seuil, l’application s’ouvre de nouveau', () => {
    expect(isRealAbsence(PLAYER_BANNER_AWAY_MS)).toBe(true);
  });

  test('une durée illisible ne rappelle pas la bannière', () => {
    expect(isRealAbsence(Number.NaN)).toBe(false);
    expect(isRealAbsence(-1)).toBe(false);
  });
});

describe('le magasin de visite', () => {
  test('démarrage à froid : armée', () => {
    expect(createPlayerBannerVisit().getState().phase).toBe('armed');
  });

  test('chaque réouverture numérote une nouvelle visite : l’horloge des 30 s repart', () => {
    const store = createPlayerBannerVisit();
    const first = store.getState().visit;
    store.getState().send('shown');
    store.getState().send('reopened');
    expect(store.getState().phase).toBe('armed');
    expect(store.getState().visit).toBe(first + 1);
  });

  test('un événement sans effet ne réveille personne', () => {
    const store = createPlayerBannerVisit();
    const seen: unknown[] = [];
    store.subscribe((state) => seen.push(state));
    store.getState().send('exited');
    expect(seen).toEqual([]);
  });
});

describe('le retour au premier plan', () => {
  const fakeDocument = () => {
    const listeners = new Set<() => void>();
    const target = {
      visibilityState: 'visible' as DocumentVisibilityState,
      addEventListener: (_: 'visibilitychange', listener: () => void): void => void listeners.add(listener),
      removeEventListener: (_: 'visibilitychange', listener: () => void): void => void listeners.delete(listener),
    };
    const set = (state: DocumentVisibilityState): void => {
      target.visibilityState = state;
      listeners.forEach((listener) => listener());
    };
    return { target, set, listeners };
  };

  test('une vraie absence rouvre la visite ; une courte non', () => {
    const doc = fakeDocument();
    const store = createPlayerBannerVisit();
    let clock = 0;
    const stop = watchPlayerBannerAbsence({ target: doc.target, now: () => clock, store });
    store.getState().send('shown');
    store.getState().send('expired');
    store.getState().send('exited');
    expect(store.getState().phase).toBe('gone');

    doc.set('hidden');
    clock += 10_000;
    doc.set('visible');
    expect(store.getState().phase).toBe('gone');

    doc.set('hidden');
    clock += PLAYER_BANNER_AWAY_MS;
    doc.set('visible');
    expect(store.getState().phase).toBe('armed');
    stop();
    expect(doc.listeners.size).toBe(0);
  });
});
