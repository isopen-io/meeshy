import { describe, expect, test } from 'bun:test';

import {
  readSharedLocationAck,
  sharedLocationFixOf,
  sharedLocationStartPayloadOf,
  shouldSendSharedLocation,
  SHARED_LOCATION_UPDATE_GATE,
} from './shared-location-sending';

/**
 * **ÉMETTRE MA POSITION, LA LOI DU FIL** (#18345, iso `SharedLocationSending.swift`) — la
 * charge de `location:share-start` bornée comme `sharedLocationStartPayloadSchema`, la
 * lecture de l'accusé, et la cadence des mises à jour. Rien ici ne floute ni ne décide
 * d'un droit : la passerelle tronque, destinataire par destinataire.
 */

const AMI = 'a'.repeat(24);
const AUTRE = 'b'.repeat(24);
const PARIS = { latitude: 48.8566, longitude: 2.3522, accuracy: 12 };

describe('un relevé ne part que s’il est sur le globe', () => {
  test('un relevé valide garde ses trois champs', () => {
    expect(sharedLocationFixOf(PARIS)).toEqual(PARIS);
  });

  test('hors du globe ou non fini, rien ne part', () => {
    expect(sharedLocationFixOf({ latitude: 91, longitude: 0 })).toBeNull();
    expect(sharedLocationFixOf({ latitude: 0, longitude: -181 })).toBeNull();
    expect(sharedLocationFixOf({ latitude: Number.NaN, longitude: 0 })).toBeNull();
  });

  test('une précision absurde est bornée, une précision invalide est retirée', () => {
    expect(sharedLocationFixOf({ latitude: 1, longitude: 1, accuracy: 10_000_000 })?.accuracy).toBe(100_000);
    expect(sharedLocationFixOf({ latitude: 1, longitude: 1, accuracy: -3 })).toEqual({ latitude: 1, longitude: 1 });
  });
});

describe('la charge de location:share-start', () => {
  test('liste entière, durée servie, position', () => {
    const payload = sharedLocationStartPayloadOf({
      recipients: [{ userId: AMI.toUpperCase(), precision: 'neighborhood' }],
      durationMinutes: 60,
      fix: PARIS,
    });
    expect(payload).toEqual({ recipients: [{ userId: AMI, precision: 'neighborhood' }], durationMinutes: 60, position: PARIS });
  });

  test('un doublon garde sa DERNIÈRE précision, un identifiant illisible se saute', () => {
    const payload = sharedLocationStartPayloadOf({
      recipients: [
        { userId: AMI, precision: 'exact' },
        { userId: 'pas-un-id', precision: 'exact' },
        { userId: AUTRE, precision: 'city' },
        { userId: AMI.toUpperCase(), precision: 'city' },
      ],
      durationMinutes: 480,
      fix: PARIS,
    });
    expect(payload?.recipients).toEqual([
      { userId: AMI, precision: 'city' },
      { userId: AUTRE, precision: 'city' },
    ]);
  });

  test('aucun destinataire, ou plus que le plafond, rien ne part', () => {
    expect(sharedLocationStartPayloadOf({ recipients: [], durationMinutes: 60, fix: PARIS })).toBeNull();
    const many = Array.from({ length: 51 }, (_, i) => ({ userId: i.toString(16).padStart(24, '0'), precision: 'city' as const }));
    expect(sharedLocationStartPayloadOf({ recipients: many, durationMinutes: 60, fix: PARIS })).toBeNull();
  });
});

describe('l’accusé', () => {
  test('un terme servi démarre le partage', () => {
    expect(readSharedLocationAck({ success: true, data: { expiresAt: '2026-11-14T09:00:00.000Z' } })).toEqual({
      kind: 'started',
      expiresAt: Date.parse('2026-11-14T09:00:00.000Z'),
    });
  });

  test('chaque refus connu garde sa raison, un code inconnu vaut un échec', () => {
    expect(readSharedLocationAck({ success: false, code: 'SHARED_LOCATION_NOT_SHARING' })).toEqual({ kind: 'refused', outcome: 'not-sharing' });
    expect(readSharedLocationAck({ success: false, code: 'SHARED_LOCATION_RATE_LIMITED' })).toEqual({ kind: 'refused', outcome: 'rate-limited' });
    expect(readSharedLocationAck({ success: false, code: 'SHARED_LOCATION_INVALID' })).toEqual({ kind: 'refused', outcome: 'invalid' });
    expect(readSharedLocationAck({ success: false, code: 'SHARED_LOCATION_UNAVAILABLE' })).toEqual({ kind: 'refused', outcome: 'unavailable' });
    expect(readSharedLocationAck({ success: false, code: 'AUTRE' })).toEqual({ kind: 'refused', outcome: 'failed' });
  });

  test('un succès sans terme lisible n’est jamais lu comme un départ', () => {
    expect(readSharedLocationAck({ success: true, data: { expiresAt: 'demain' } })).toEqual({ kind: 'refused', outcome: 'failed' });
    expect(readSharedLocationAck(null)).toEqual({ kind: 'refused', outcome: 'failed' });
  });
});

describe('la cadence des mises à jour', () => {
  const at = Date.parse('2026-11-14T08:00:00.000Z');

  test('le premier relevé part toujours', () => {
    expect(shouldSendSharedLocation(PARIS, at, null)).toBe(true);
  });

  test('jamais deux envois à moins de 5 s, même en ayant bougé', () => {
    const far = { latitude: 48.9, longitude: 2.4 };
    expect(shouldSendSharedLocation(far, at + 4_000, { fix: PARIS, at })).toBe(false);
  });

  test('un déplacement de 50 m part, le bruit GPS non', () => {
    const near = { latitude: PARIS.latitude + 0.0001, longitude: PARIS.longitude };
    const moved = { latitude: PARIS.latitude + 0.001, longitude: PARIS.longitude };
    expect(shouldSendSharedLocation(near, at + 10_000, { fix: PARIS, at })).toBe(false);
    expect(shouldSendSharedLocation(moved, at + 10_000, { fix: PARIS, at })).toBe(true);
  });

  test('immobile, la position est redite au battement', () => {
    expect(shouldSendSharedLocation(PARIS, at + SHARED_LOCATION_UPDATE_GATE.heartbeatMs, { fix: PARIS, at })).toBe(true);
  });
});
