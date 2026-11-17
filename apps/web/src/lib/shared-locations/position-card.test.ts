import { describe, expect, test } from 'bun:test';

import type { SharedLocation } from '@/lib/api/shared-locations';

import { directionsHref, positionCardOf, remainingWords } from './position-card';

const NOW = Date.parse('2026-11-17T10:00:00Z');
const minutes = (count: number): string => new Date(NOW + count * 60_000).toISOString();

const served = (overrides: Partial<SharedLocation> = {}): SharedLocation => ({
  userId: 'u-leo',
  latitude: 38.711,
  longitude: -9.131,
  precision: 'neighborhood',
  radiusMeters: 800,
  updatedAt: new Date(NOW - 20_000).toISOString(),
  expiresAt: minutes(42),
  ...overrides,
});

describe('la carte d’une position partagée dit le temps qui reste, comme la planche', () => {
  test('42 min restantes d’un partage d’1 h : le partage est de 60 min et la jauge au 7/10', () => {
    const card = positionCardOf({ location: served(), now: NOW });
    expect(card?.remainingMinutes).toBe(42);
    expect(card?.totalMinutes).toBe(60);
    expect(card?.fraction).toBeCloseTo(0.7, 5);
  });

  test('plus d’une heure restante : le partage est de 8 h', () => {
    const card = positionCardOf({ location: served({ expiresAt: minutes(200) }), now: NOW });
    expect(card?.totalMinutes).toBe(480);
    expect(card?.fraction).toBeCloseTo(200 / 480, 5);
  });

  test('un partage échu n’a pas de carte : rien n’est dit d’une position qui n’existe plus', () => {
    expect(positionCardOf({ location: served({ expiresAt: minutes(-1) }), now: NOW })).toBeNull();
  });

  test('moins d’une minute : on dit 1 min, jamais 0', () => {
    expect(positionCardOf({ location: served({ expiresAt: new Date(NOW + 20_000).toISOString() }), now: NOW })?.remainingMinutes).toBe(1);
  });

  test('la précision servie traverse telle quelle', () => {
    expect(positionCardOf({ location: served({ precision: 'city' }), now: NOW })?.precision).toBe('city');
  });
});

describe('l’itinéraire ne vise que la position SERVIE', () => {
  test('les coordonnées tronquées que le serveur a rendues, rien de plus fin', () => {
    const href = directionsHref(served({ latitude: 38.7, longitude: -9.1 }));
    expect(href).toBe('https://www.google.com/maps/dir/?api=1&destination=38.7%2C-9.1');
  });
});

describe('le temps restant se dit dans la langue de l’interface', () => {
  test('en minutes sous une heure', () => {
    expect(remainingWords('fr', 42)).toMatch(/42\s?min/);
  });
  test('en heures et minutes au-delà', () => {
    expect(remainingWords('fr', 135)).toMatch(/2\s?h.*15\s?min/);
  });
  test('une heure pleine ne traîne pas de zéro minute', () => {
    expect(remainingWords('fr', 120)).not.toMatch(/min/);
  });
});
