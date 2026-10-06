/**
 * LES NOTIFICATIONS DU JEU (#9490) — quatre types, une préférence serveur, les
 * textes dans les huit langues du catalogue, le cadrage dans la langue du
 * destinataire. Conception partie IX : « une notification de jeu par jour au plus,
 * interrupteur « Jeu » dans les réglages » ; jamais « X t'a dépassé ».
 */

import { describe, it, expect } from 'vitest';
import { NotificationTypeEnum } from '../../types/notification.js';
import { isNotificationTypeEnabled, type NotificationPreference } from '../../types/notification-preferences.js';
import { NOTIFICATION_PREFERENCE_DEFAULTS, NotificationPreferenceSchema } from '../../types/preferences/notification.js';
import {
  GAME_NOTIFICATION_DAILY_CAP,
  GAME_NOTIFICATION_TYPES,
  gameLeagueResultKey,
  isGameNotificationType,
} from '../../utils/game/notifications.js';
import { NOTIFICATION_LANGUAGES, buildNotificationDisplay, notificationString } from '../../utils/notification-strings.js';
import { notificationTypeEnum } from '../../utils/notification-type-enum.js';

describe('les types de notification du jeu', () => {
  it('sont quatre, uniques, déclarés par l’énumération ET par le schéma de validation', () => {
    expect([...GAME_NOTIFICATION_TYPES]).toEqual(['game_duo_invited', 'game_duo_accepted', 'game_league_result', 'game_season_step']);
    for (const type of GAME_NOTIFICATION_TYPES) {
      expect(Object.values(NotificationTypeEnum)).toContain(type);
      expect(notificationTypeEnum.safeParse(type).success).toBe(true);
    }
  });

  it('se reconnaissent par un prédicat, jamais par un préfixe', () => {
    expect(isGameNotificationType('game_league_result')).toBe(true);
    expect(isGameNotificationType('new_message')).toBe(false);
    expect(isGameNotificationType('game_unknown')).toBe(false);
    expect(isGameNotificationType(undefined)).toBe(false);
  });

  it('au plus UNE par jour et par destinataire', () => {
    expect(GAME_NOTIFICATION_DAILY_CAP).toBe(1);
  });
});

describe('la préférence « Jeu » (notification.gameEnabled)', () => {
  it('est activée par défaut, y compris pour un document qui ne l’a jamais porté', () => {
    expect(NotificationPreferenceSchema.parse({}).gameEnabled).toBe(true);
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.gameEnabled).toBe(true);
    expect(NotificationPreferenceSchema.strict().parse({ gameEnabled: false }).gameEnabled).toBe(false);
  });

  it('gouverne les quatre types, et eux seuls', () => {
    const prefs = { ...NOTIFICATION_PREFERENCE_DEFAULTS, gameEnabled: false } as unknown as NotificationPreference;
    for (const type of GAME_NOTIFICATION_TYPES) expect(isNotificationTypeEnabled(prefs, type)).toBe(false);
    expect(isNotificationTypeEnabled(prefs, 'new_message')).toBe(true);
    const absent = { ...prefs, gameEnabled: undefined } as unknown as NotificationPreference;
    expect(isNotificationTypeEnabled(absent, 'game_league_result')).toBe(true);
  });
});

describe('les textes', () => {
  const KEYS = [
    'game.duoInvitedAction',
    'game.duoInvitedBody',
    'game.duoAcceptedAction',
    'game.duoAcceptedBody',
    'game.leaguePromoted',
    'game.leagueStayed',
    'game.leagueRelegated',
    'game.leagueCupGold',
    'game.leagueCupSilver',
    'game.leagueCupBronze',
    'game.seasonStep',
    'game.seasonDone',
  ] as const;

  it('existent dans les huit langues, jamais la clé brute', () => {
    for (const lang of NOTIFICATION_LANGUAGES) {
      for (const key of KEYS) {
        const text = notificationString(lang, key, { count: 12 });
        expect(text.length, `${lang}/${key}`).toBeGreaterThan(0);
        expect(text, `${lang}/${key}`).not.toContain('game.');
        expect(text, `${lang}/${key}`).not.toContain('{');
      }
    }
  });

  it('l’étape de la saison porte son numéro, dans chaque langue', () => {
    for (const lang of NOTIFICATION_LANGUAGES) expect(notificationString(lang, 'game.seasonStep', { count: 12 })).toContain('12');
  });

  it('aucun texte ne compare le destinataire à quelqu’un : jamais « dépassé » ni « a doublé »', () => {
    for (const lang of ['fr', 'en'] as const) {
      for (const key of KEYS) expect(notificationString(lang, key, { count: 3 }).toLowerCase()).not.toMatch(/dépass|a doublé|overtak|passed you|behind/);
    }
  });

  it('le titre d’une invitation en duo naît du nom de l’ami, dans la langue du destinataire', () => {
    expect(buildNotificationDisplay('fr', { type: 'game_duo_invited', actorName: 'Marie' }).title).toContain('Marie');
    expect(buildNotificationDisplay('en', { type: 'game_duo_invited', actorName: 'Marie' }).title).toBe(
      `Marie ${notificationString('en', 'game.duoInvitedAction')}`,
    );
    expect(buildNotificationDisplay('en', { type: 'game_duo_accepted', actorName: 'Marie' }).action).toBe(notificationString('en', 'game.duoAcceptedAction'));
  });

  it('une notification de ligue ou de saison n’a pas d’acteur : le titre reste au client, le corps porte la phrase', () => {
    expect(buildNotificationDisplay('fr', { type: 'game_league_result', actorName: null })).toEqual({ title: null, subtitle: null, action: null });
    expect(buildNotificationDisplay('fr', { type: 'game_season_step', actorName: null })).toEqual({ title: null, subtitle: null, action: null });
  });
});

describe('le résultat de la semaine de ligue', () => {
  it('une coupe prime sur la zone, la zone sur le maintien', () => {
    expect(gameLeagueResultKey({ zone: 'promotion', cup: 'gold' })).toBe('game.leagueCupGold');
    expect(gameLeagueResultKey({ zone: 'safe', cup: 'silver' })).toBe('game.leagueCupSilver');
    expect(gameLeagueResultKey({ zone: 'relegation', cup: 'bronze' })).toBe('game.leagueCupBronze');
    expect(gameLeagueResultKey({ zone: 'promotion', cup: null })).toBe('game.leaguePromoted');
    expect(gameLeagueResultKey({ zone: 'safe', cup: null })).toBe('game.leagueStayed');
    expect(gameLeagueResultKey({ zone: 'relegation', cup: null })).toBe('game.leagueRelegated');
  });
});
