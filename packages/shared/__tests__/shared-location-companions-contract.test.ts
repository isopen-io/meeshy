import { describe, expect, it } from 'vitest';
import {
  SHARED_LOCATION_ERROR_CODES,
  SHARED_LOCATION_REQUEST_KINDS,
  SHARED_LOCATION_REQUEST_WINDOW_MINUTES,
  sharedLocationRequestPayloadSchema,
  sharedLocationStartPayloadSchema,
} from '../types/shared-location';
import { NotificationType } from '../types/notification';
import { NotificationPreferenceSchema, NOTIFICATION_PREFERENCE_DEFAULTS } from '../types/preferences';
import { isNotificationTypeEnabled } from '../types/notification-preferences';
import { notificationTypeEnum } from '../utils/notification-type-enum';
import { notificationString } from '../utils/notification-strings';
import { SERVER_EVENTS } from '../types/socketio-events';

const READER = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const start = (overrides: Record<string, unknown> = {}) => ({
  recipients: [{ userId: READER }],
  durationMinutes: 60,
  position: { latitude: 48.8566, longitude: 2.3522 },
  ...overrides,
});

describe('prévenir, prolonger, redemander, la batterie pendant le partage (#19204)', () => {
  it('le démarrage porte, en option, « prévenir » et « partager aussi ma batterie » ; un ancien client sans eux reste valide', () => {
    expect(sharedLocationStartPayloadSchema.safeParse(start()).success).toBe(true);
    const parsed = sharedLocationStartPayloadSchema.parse(start({ notifyRecipients: true, shareBattery: true }));
    expect(parsed.notifyRecipients).toBe(true);
    expect(parsed.shareBattery).toBe(true);
    for (const value of ['oui', 1, null]) {
      expect(sharedLocationStartPayloadSchema.safeParse(start({ notifyRecipients: value })).success).toBe(false);
      expect(sharedLocationStartPayloadSchema.safeParse(start({ shareBattery: value })).success).toBe(false);
    }
  });

  it('une demande dit « prolonger » ou « redemander », rien d\'autre — et jamais une coordonnée', () => {
    expect(SHARED_LOCATION_REQUEST_KINDS).toEqual(['extend', 'reask']);
    expect(sharedLocationRequestPayloadSchema.safeParse({ kind: 'extend' }).success).toBe(true);
    expect(sharedLocationRequestPayloadSchema.safeParse({ kind: 'reask' }).success).toBe(true);
    expect(sharedLocationRequestPayloadSchema.safeParse({ kind: 'start' }).success).toBe(false);
    expect(sharedLocationRequestPayloadSchema.safeParse({ kind: 'extend', latitude: 1, longitude: 2 }).success).toBe(false);
    expect(SHARED_LOCATION_REQUEST_WINDOW_MINUTES).toBeGreaterThanOrEqual(15);
  });

  it('nomme ses refus et son événement', () => {
    expect(SHARED_LOCATION_ERROR_CODES.REQUEST_FORBIDDEN).toBe('SHARED_LOCATION_REQUEST_FORBIDDEN');
    expect(SHARED_LOCATION_ERROR_CODES.REQUEST_TOO_SOON).toBe('SHARED_LOCATION_REQUEST_TOO_SOON');
    expect(SERVER_EVENTS.SHARED_LOCATION_REQUESTED).toBe('location:share-requested');
  });

  it('deux types de notification, reconnus partout, gouvernés par « position partagée » reçue par défaut', () => {
    expect(NotificationType.LOCATION_SHARE_STARTED).toBe('location_share_started');
    expect(NotificationType.LOCATION_SHARE_REQUESTED).toBe('location_share_requested');
    expect(notificationTypeEnum.safeParse('location_share_started').success).toBe(true);
    expect(notificationTypeEnum.safeParse('location_share_requested').success).toBe(true);
    expect(NotificationPreferenceSchema.parse({}).locationShareEnabled).toBe(true);
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.locationShareEnabled).toBe(true);
    const off = { ...NOTIFICATION_PREFERENCE_DEFAULTS, locationShareEnabled: false };
    expect(isNotificationTypeEnabled(off, 'location_share_started')).toBe(false);
    expect(isNotificationTypeEnabled(off, 'location_share_requested')).toBe(false);
    expect(isNotificationTypeEnabled(NOTIFICATION_PREFERENCE_DEFAULTS, 'location_share_started')).toBe(true);
  });

  it('les gabarits existent dans les huit langues et ne portent aucune coordonnée', () => {
    for (const lang of ['fr', 'en', 'es', 'pt', 'de', 'it', 'ar', 'zh-Hans']) {
      for (const key of ['location.startedAction', 'location.startedBody', 'location.extendAction', 'location.reaskAction', 'location.requestBody'] as const) {
        const text = notificationString(lang, key, { count: 8 });
        expect(text.length).toBeGreaterThan(0);
        expect(text).not.toMatch(/\{|latitude|longitude/);
      }
    }
    expect(notificationString('fr', 'location.startedBody', { count: 1 })).toMatch(/1/);
  });
});
