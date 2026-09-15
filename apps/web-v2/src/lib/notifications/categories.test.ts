import { describe, expect, test } from 'bun:test';

import {
  NOTIFICATION_CATEGORIES,
  categoryAccepts,
  categoryHue,
  categoryQuery,
  notificationAccent,
} from './categories';

/**
 * LE RAIL DES CATÉGORIES (#6288) — miroir de `NotificationCategory`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Notifications/NotificationListView.swift:8-131`).
 *
 * Ce que ces témoins gardent : l'ORDRE du rail (un fait de produit), la
 * traduction d'une catégorie en filtre SERVEUR (`?types=` / `?unreadOnly=`,
 * `services/gateway/src/routes/notifications.ts:55-62`), et la loi qui dit si
 * une ligne REÇUE en temps réel appartient à une catégorie déjà en cache.
 */

describe('le rail suit iOS', () => {
  test('onze catégories, dans l’ordre d’iOS', () => {
    expect(NOTIFICATION_CATEGORIES).toEqual([
      'all',
      'unread',
      'messages',
      'reactions',
      'mentions',
      'social',
      'contacts',
      'groups',
      'calls',
      'translations',
      'system',
    ]);
  });

  test('chaque catégorie garde la teinte de sa puce iOS', () => {
    expect(categoryHue('messages')).toBe('#3498DB');
    expect(categoryHue('mentions')).toBe('#9B59B6');
    expect(categoryHue('calls')).toBe('#E91E63');
  });
});

describe('une catégorie devient un filtre SERVEUR, jamais un tri local d’une page', () => {
  test('« Toutes » ne filtre rien', () => {
    expect(categoryQuery('all')).toEqual({});
  });

  test('« Non lues » demande `unreadOnly`, sans liste de types', () => {
    expect(categoryQuery('unread')).toEqual({ unreadOnly: true });
  });

  test('« Mentions » nomme les TROIS alias bruts du type', () => {
    const { types } = categoryQuery('mentions');
    expect(types?.split(',').sort()).toEqual(['MENTION', 'mention', 'user_mentioned']);
  });

  test('« Réactions » couvre le message, la publication, la story, l’humeur et le commentaire', () => {
    const types = categoryQuery('reactions').types?.split(',') ?? [];
    for (const type of ['message_reaction', 'post_like', 'story_reaction', 'status_reaction', 'comment_like', 'comment_reaction']) {
      expect(types).toContain(type);
    }
  });

  /**
   * iOS OUBLIE ces types dans ses catégories (#6288, défaut relevé) : un
   * commentaire de story n'apparaissait que sous « Toutes ». Le web les range
   * là où le lecteur les cherche.
   */
  test('les commentaires de story et les publications d’un ami vont sous « Social »', () => {
    const types = categoryQuery('social').types?.split(',') ?? [];
    for (const type of ['story_new_comment', 'friend_story_comment', 'story_thread_reply', 'friend_new_story', 'friend_new_post', 'friend_new_mood']) {
      expect(types).toContain(type);
    }
  });
});

describe('une ligne reçue appartient-elle à une catégorie ?', () => {
  const ligne = (type: string, isRead: boolean) => ({ type, state: { isRead } });

  test('« Toutes » accepte tout, « Non lues » seulement le non-lu', () => {
    expect(categoryAccepts('all', ligne('system', true))).toBe(true);
    expect(categoryAccepts('unread', ligne('new_message', false))).toBe(true);
    expect(categoryAccepts('unread', ligne('new_message', true))).toBe(false);
  });

  test('une catégorie de famille accepte ses types, lue ou non', () => {
    expect(categoryAccepts('mentions', ligne('user_mentioned', true))).toBe(true);
    expect(categoryAccepts('mentions', ligne('new_message', false))).toBe(false);
  });

  test('un type inconnu n’entre que sous « Toutes » (et « Non lues » s’il l’est)', () => {
    expect(categoryAccepts('system', ligne('type_de_demain', false))).toBe(false);
    expect(categoryAccepts('all', ligne('type_de_demain', false))).toBe(true);
  });
});

describe('l’accent d’une ligne suit son TYPE, pas sa catégorie', () => {
  test('un badge ne ressemble pas à une invitation', () => {
    expect(notificationAccent('achievement_unlocked')).toBe('#FBBF24');
    expect(notificationAccent('community_invite')).toBe('#F8B500');
  });

  test('une alerte de sécurité porte le rouge, un type inconnu l’indigo du système', () => {
    expect(notificationAccent('login_new_device')).toBe('#EF4444');
    expect(notificationAccent('type_de_demain')).toBe('#6366F1');
  });
});
