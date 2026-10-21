/**
 * LA NOTIFICATION D'UNE ÉTAPE FRANCHIE APP FERMÉE (#10175, L19 — § 5.16.4) : un type neuf, dans le plafond
 * d'une notification de jeu par jour (D9), gouverné par sa propre préférence (D8), un texte neutre et
 * descriptif en huit langues, jamais « t'attend », jamais « nouveau pack » (D13, B-5).
 */

import { describe, it, expect } from 'vitest';
import { NotificationTypeEnum } from '../../types/notification.js';
import { isNotificationTypeEnabled, type NotificationPreference } from '../../types/notification-preferences.js';
import { NOTIFICATION_PREFERENCE_DEFAULTS, NotificationPreferenceSchema } from '../../types/preferences/notification.js';
import { GAME_NOTIFICATION_TYPES, countsAgainstGameDailyCap, photoMomentNotificationKey } from '../../utils/game/notifications.js';
import { NOTIFICATION_LANGUAGES, NOTIFICATION_STRING_KEYS, buildNotificationDisplay, notificationString } from '../../utils/notification-strings.js';
import { notificationTypeEnum } from '../../utils/notification-type-enum.js';

const prefs = (overrides: Record<string, unknown>): NotificationPreference =>
  ({ ...NOTIFICATION_PREFERENCE_DEFAULTS, ...overrides }) as unknown as NotificationPreference;

describe('le type game_photo_moment', () => {
  it('est un type de jeu déclaré par l’énumération ET par le schéma de validation', () => {
    expect(GAME_NOTIFICATION_TYPES).toContain('game_photo_moment');
    expect(Object.values(NotificationTypeEnum)).toContain('game_photo_moment');
    expect(notificationTypeEnum.safeParse('game_photo_moment').success).toBe(true);
  });

  it('compte dans le plafond d’une notification de jeu par jour (D9, B-5)', () => {
    expect(countsAgainstGameDailyCap('game_photo_moment')).toBe(true);
  });

  it('n’a pas d’acteur : le titre reste au client, le corps porte la phrase', () => {
    expect(buildNotificationDisplay('fr', { type: 'game_photo_moment', actorName: null })).toEqual({ title: null, subtitle: null, action: null });
  });
});

describe('la préférence notification.gamePhotoEnabled (D8)', () => {
  it('est activée par défaut, y compris pour un document qui ne l’a jamais porté', () => {
    expect(NotificationPreferenceSchema.parse({}).gamePhotoEnabled).toBe(true);
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.gamePhotoEnabled).toBe(true);
    expect(NotificationPreferenceSchema.strict().parse({ gamePhotoEnabled: false }).gamePhotoEnabled).toBe(false);
  });

  it('coupe le seul push photo, pas les autres notifications du jeu', () => {
    expect(isNotificationTypeEnabled(prefs({ gamePhotoEnabled: false }), 'game_photo_moment')).toBe(false);
    expect(isNotificationTypeEnabled(prefs({ gamePhotoEnabled: false }), 'game_league_result')).toBe(true);
    expect(isNotificationTypeEnabled(prefs({ gamePhotoEnabled: undefined }), 'game_photo_moment')).toBe(true);
  });

  it('« Jeu » coupé coupe aussi le push photo', () => {
    expect(isNotificationTypeEnabled(prefs({ gameEnabled: false, gamePhotoEnabled: true }), 'game_photo_moment')).toBe(false);
  });
});

describe('le texte (D13)', () => {
  it('une étape : la phrase au singulier ; plusieurs : la phrase groupée qui porte leur nombre', () => {
    expect(photoMomentNotificationKey(1)).toBe('game.photoMoment');
    expect(photoMomentNotificationKey(3)).toBe('game.photoMoments');
    expect(notificationString('fr', photoMomentNotificationKey(1), { count: 1 })).toBe('Tes aïeux se sont manifestés : ce moment peut rejoindre ta Chronique.');
    expect(notificationString('fr', photoMomentNotificationKey(3), { count: 3 })).toBe('3 signes de tes aïeux à immortaliser dans ta Chronique.');
  });

  it('existe dans les huit langues, jamais la clé brute, et le groupé dit son nombre', () => {
    for (const lang of NOTIFICATION_LANGUAGES) {
      const one = notificationString(lang, 'game.photoMoment', { count: 1 });
      const many = notificationString(lang, 'game.photoMoments', { count: 7 });
      for (const text of [one, many]) {
        expect(text.length, lang).toBeGreaterThan(0);
        expect(text, lang).not.toContain('game.');
        expect(text, lang).not.toContain('{');
      }
      expect(many, lang).toContain('7');
    }
  });

  const PRESSURE: readonly RegExp[] = [/attend/i, /wait/i, /espera/i, /wartet/i, /aspetta/i, /ينتظر/, /在等/];
  const NEW_PACK: readonly RegExp[] = [/nouveau pack/i, /nouveau cadre/i, /new pack/i, /new frame/i];

  it('aucun texte de jeu ne dit « t’attend », dans aucune des huit langues', () => {
    const gameKeys = NOTIFICATION_STRING_KEYS.filter((key) => key.startsWith('game.'));
    for (const lang of NOTIFICATION_LANGUAGES) {
      for (const key of gameKeys) {
        const text = notificationString(lang, key, { count: 2, mission: 'x', start: '1', end: '2' });
        for (const pattern of PRESSURE) expect(text, `${lang}/${key}`).not.toMatch(pattern);
      }
    }
  });

  it('aucun texte de notification n’annonce un « nouveau pack » ou un « nouveau cadre » (B-5)', () => {
    for (const lang of NOTIFICATION_LANGUAGES) {
      for (const key of NOTIFICATION_STRING_KEYS) {
        const text = notificationString(lang, key, { count: 2, mission: 'x', start: '1', end: '2' });
        for (const pattern of NEW_PACK) expect(text, `${lang}/${key}`).not.toMatch(pattern);
      }
    }
  });
});
