/**
 * « Jeu » (#9490) — la préférence serveur `notification.gameEnabled` gouverne les quatre
 * types de notification du jeu, et eux seuls ; absente d'un document antérieur, elle vaut « reçu ».
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { NOTIFICATION_PREFERENCE_DEFAULTS, type NotificationPreference } from '@meeshy/shared/types/preferences';
import { GAME_NOTIFICATION_TYPES } from '@meeshy/shared/utils/game/notifications';
import { isNotificationTypeEnabledByPreference } from '../type-preference';

const prefs = (over: Partial<NotificationPreference>): NotificationPreference => ({ ...NOTIFICATION_PREFERENCE_DEFAULTS, ...over });

describe('notification.gameEnabled', () => {
  it('coupée, elle ferme les quatre types du jeu', () => {
    for (const type of GAME_NOTIFICATION_TYPES) expect(isNotificationTypeEnabledByPreference(prefs({ gameEnabled: false }), type)).toBe(false);
  });

  it('ne ferme rien d’autre : ni les messages, ni les réactions, ni le retour d’un contact', () => {
    const off = prefs({ gameEnabled: false });
    for (const type of ['new_message', 'message_reaction', 'contact_recently_active', 'level_up', 'achievement_unlocked'] as const) {
      expect(isNotificationTypeEnabledByPreference(off, type)).toBe(true);
    }
  });

  it('activée par défaut, et ABSENTE d’un document antérieur : reçu', () => {
    for (const type of GAME_NOTIFICATION_TYPES) {
      expect(isNotificationTypeEnabledByPreference(prefs({}), type)).toBe(true);
      const legacy = { ...prefs({}), gameEnabled: undefined } as unknown as NotificationPreference;
      expect(isNotificationTypeEnabledByPreference(legacy, type)).toBe(true);
    }
  });
});
