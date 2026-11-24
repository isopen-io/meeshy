import { describe, expect, it } from 'vitest';
import {
  BLOOD_PROXIMITY_NOTIFICATION_TYPE,
  BLOOD_PROXIMITY_PUSH_DATA_KEYS,
  bloodProximityNotificationMetadata,
} from '../types/blood-location';
import { NotificationTypeEnum as NotificationType } from '../types/notification';
import { NotificationPreferenceSchema, NOTIFICATION_PREFERENCE_DEFAULTS } from '../types/preferences';
import { isNotificationTypeEnabled } from '../types/notification-preferences';
import { notificationTypeEnum } from '../utils/notification-type-enum';
import { notificationString } from '../utils/notification-strings';
import { notificationBannerFraming } from '../utils/notification-banner';
import type { Notification } from '../types/notification';

const OTHER = 'bbbbbbbbbbbbbbbbbbbbbbbb';

describe('l’alerte poussée quand un Sang s’approche (#20540)', () => {
  it('un type reconnu partout, rangé avec les cercles, gouverné par sa préférence reçue par défaut', () => {
    expect(NotificationType.BLOOD_PROXIMITY).toBe('blood_proximity');
    expect(BLOOD_PROXIMITY_NOTIFICATION_TYPE).toBe('blood_proximity');
    expect(notificationTypeEnum.safeParse('blood_proximity').success).toBe(true);
    expect(NotificationPreferenceSchema.parse({}).bloodProximityEnabled).toBe(true);
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.bloodProximityEnabled).toBe(true);
    const off = { ...NOTIFICATION_PREFERENCE_DEFAULTS, bloodProximityEnabled: false };
    expect(isNotificationTypeEnabled(off, 'blood_proximity')).toBe(false);
    expect(isNotificationTypeEnabled(NOTIFICATION_PREFERENCE_DEFAULTS, 'blood_proximity')).toBe(true);
    expect(notificationBannerFraming({ type: 'blood_proximity' } as unknown as Notification)).toBe('relation');
  });

  it('la charge `data` ne nomme que le type et l’autre Sang', () => {
    expect(BLOOD_PROXIMITY_PUSH_DATA_KEYS).toEqual(['type', 'userId']);
  });

  it('les métadonnées portent l’autre et la distance (le palier, déjà multiple de 50 m), jamais une coordonnée', () => {
    const metadata = bloodProximityNotificationMetadata({ userId: OTHER, distanceMeters: 287 });
    expect(metadata).toEqual({ action: 'view_profile', userId: OTHER, distanceMeters: 300 });
    expect(bloodProximityNotificationMetadata({ userId: OTHER, distanceMeters: 324 }).distanceMeters).toBe(300);
    expect(bloodProximityNotificationMetadata({ userId: OTHER, distanceMeters: 12 }).distanceMeters).toBe(50);
    expect(Object.keys(metadata).sort()).toEqual(['action', 'distanceMeters', 'userId']);
  });

  it('les gabarits existent dans les huit langues : la distance au CORPS seul, jamais au titre, aucun lieu', () => {
    for (const lang of ['fr', 'en', 'es', 'pt', 'de', 'it', 'ar', 'zh-Hans']) {
      const action = notificationString(lang, 'location.proximityAction', { value: '500 m' });
      const body = notificationString(lang, 'location.proximityBody', { value: '500 m' });
      expect(action.length).toBeGreaterThan(0);
      expect(action).not.toMatch(/500|\{/);
      expect(body).toContain('500 m');
      expect(`${action} ${body}`).not.toMatch(/\{|latitude|longitude/);
    }
    expect(`Lina ${notificationString('fr', 'location.proximityAction')}`).toBe('Lina est tout près');
    expect(notificationString('fr', 'location.proximityBody', { value: '500 m' })).toBe('À 500 m — touche pour vous voir tous les deux sur la carte');
  });
});
