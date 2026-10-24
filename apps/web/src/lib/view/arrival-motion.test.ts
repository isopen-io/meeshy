import { describe, expect, test } from 'bun:test';

import { ARRIVAL_FRESHNESS_MS, animatedArrival, arrivalCauseOf, type ArrivalEntry } from './arrival-motion';

/**
 * SEUL LE DERNIER MESSAGE ARRIVÉ S'ANIME (#11223, décision porteur
 * 2026-10-24). Le même énoncé qu'iOS (`MessageArrivalMotion`) : parmi les
 * messages nouveaux d'un rendu du fil, seul le plus récent, s'il arrive en
 * temps réel, reçoit l'animation d'arrivée — jamais un lot de pagination, de
 * rattrapage ou de premier rendu, et rien sous « Réduire les animations ».
 */

const NOW = Date.parse('2026-10-24T12:00:00.000Z');

const entry = (key: string, secondsAgo: number): ArrivalEntry => ({ key, createdAt: NOW - secondsAgo * 1000 });

const HISTORY: readonly ArrivalEntry[] = [entry('a', 600), entry('b', 500), entry('c', 400)];
const keysOf = (entries: readonly ArrivalEntry[]): ReadonlySet<string> => new Set(entries.map((e) => e.key));

describe('animatedArrival — la règle pure', () => {
  test('un message nouveau en temps réel ⇒ il s’anime', () => {
    const next = [...HISTORY, entry('d', 1)];
    expect(animatedArrival({ previous: keysOf(HISTORY), next, now: NOW, reduceMotion: false })).toBe('d');
  });

  test('cinq nouveaux d’un coup ⇒ seul le DERNIER s’anime', () => {
    const next = [...HISTORY, entry('d', 3), entry('e', 3), entry('f', 2), entry('g', 2), entry('h', 1)];
    expect(animatedArrival({ previous: keysOf(HISTORY), next, now: NOW, reduceMotion: false })).toBe('h');
  });

  test('une page plus ancienne préfixée (pagination) ⇒ aucune animation', () => {
    const next = [entry('x', 9000), entry('y', 8000), ...HISTORY];
    expect(animatedArrival({ previous: keysOf(HISTORY), next, now: NOW, reduceMotion: false })).toBe(null);
  });

  test('premier rendu (aucun message avant) ⇒ aucune animation, même pour un message frais', () => {
    const next = [...HISTORY, entry('d', 1)];
    expect(animatedArrival({ previous: new Set(), next, now: NOW, reduceMotion: false })).toBe(null);
  });

  test('« Réduire les animations » ⇒ aucune animation', () => {
    const next = [...HISTORY, entry('d', 1)];
    expect(animatedArrival({ previous: keysOf(HISTORY), next, now: NOW, reduceMotion: true })).toBe(null);
  });

  test('un rattrapage (le plus récent est ancien) ⇒ aucune animation', () => {
    const next = [...HISTORY, entry('d', 300), entry('e', 200)];
    expect(animatedArrival({ previous: keysOf(HISTORY), next, now: NOW, reduceMotion: false })).toBe(null);
  });

  test('rien de nouveau (une traduction, un accusé) ⇒ aucune animation', () => {
    expect(animatedArrival({ previous: keysOf(HISTORY), next: HISTORY, now: NOW, reduceMotion: false })).toBe(null);
  });
});

describe('arrivalCauseOf — la cause du lot', () => {
  test('nomme chacune des quatre causes', () => {
    const previous = keysOf(HISTORY);
    expect(arrivalCauseOf({ previous: new Set(), next: HISTORY, now: NOW })).toBe('first-render');
    expect(arrivalCauseOf({ previous, next: [...HISTORY, entry('d', 1)], now: NOW })).toBe('realtime');
    expect(arrivalCauseOf({ previous, next: [entry('x', 9000), ...HISTORY], now: NOW })).toBe('pagination');
    expect(arrivalCauseOf({ previous, next: [...HISTORY, entry('d', 3600)], now: NOW })).toBe('catch-up');
  });

  test('rien de nouveau ⇒ aucune cause', () => {
    expect(arrivalCauseOf({ previous: keysOf(HISTORY), next: HISTORY, now: NOW })).toBe(null);
  });

  test('la fenêtre de fraîcheur est inclusive à sa borne, exclusive au-delà', () => {
    const previous = keysOf(HISTORY);
    const atEdge = { key: 'd', createdAt: NOW - ARRIVAL_FRESHNESS_MS };
    const beyond = { key: 'd', createdAt: NOW - ARRIVAL_FRESHNESS_MS - 1 };
    expect(arrivalCauseOf({ previous, next: [...HISTORY, atEdge], now: NOW })).toBe('realtime');
    expect(arrivalCauseOf({ previous, next: [...HISTORY, beyond], now: NOW })).toBe('catch-up');
  });

  test('une horloge d’appareil en retard sur le serveur (date future) reste du temps réel', () => {
    const previous = keysOf(HISTORY);
    expect(arrivalCauseOf({ previous, next: [...HISTORY, entry('d', -5)], now: NOW })).toBe('realtime');
  });
});
