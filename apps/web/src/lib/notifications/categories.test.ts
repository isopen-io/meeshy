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
  test('douze catégories, dans l’ordre d’iOS — « Engagements » après « Social » (#8960)', () => {
    expect(NOTIFICATION_CATEGORIES).toEqual([
      'all',
      'unread',
      'messages',
      'reactions',
      'mentions',
      'social',
      'engagement',
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
  test('« Toutes » ne filtre aucun type, mais retire les lignes CONSOMMÉES (#8960)', () => {
    const query = categoryQuery('all');
    expect(query.types).toBeUndefined();
    const hidden = query.hideReadTypes?.split(',') ?? [];
    for (const type of ['new_message', 'message_reaction', 'user_mentioned', 'post_comment']) expect(hidden).toContain(type);
    expect(hidden).not.toContain('friend_request');
    expect(hidden).not.toContain('badge_earned');
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

describe('« X a rejoint Meeshy » (#8105)', () => {
  test('`contact_joined` se range sous « Contacts », là où vivent les demandes d’ami', () => {
    expect(categoryQuery('contacts').types?.split(',')).toContain('contact_joined');
    expect(categoryAccepts('contacts', { type: 'contact_joined', state: { isRead: false } })).toBe(true);
  });

  test('`contact_joined` prend la teinte de la famille contacts, pas l’indigo du système', () => {
    expect(notificationAccent('contact_joined')).toBe(notificationAccent('friend_request'));
  });
});

describe('« X était sur Meeshy récemment » (#8285)', () => {
  test('`contact_recently_active` se range sous « Contacts »', () => {
    expect(categoryQuery('contacts').types?.split(',')).toContain('contact_recently_active');
    expect(categoryAccepts('contacts', { type: 'contact_recently_active', state: { isRead: false } })).toBe(true);
  });

  test('`contact_recently_active` prend la teinte de la famille contacts', () => {
    expect(notificationAccent('contact_recently_active')).toBe(notificationAccent('friend_request'));
  });
});

describe('une ligne reçue appartient-elle à une catégorie ?', () => {
  const ligne = (type: string, isRead: boolean) => ({ type, state: { isRead } });

  test('« Toutes » accepte tout, « Non lues » seulement le non-lu', () => {
    expect(categoryAccepts('all', ligne('system', true))).toBe(true);
    expect(categoryAccepts('unread', ligne('new_message', false))).toBe(true);
    expect(categoryAccepts('unread', ligne('new_message', true))).toBe(false);
  });

  test('une catégorie de famille accepte ses types non lus', () => {
    expect(categoryAccepts('mentions', ligne('user_mentioned', false))).toBe(true);
    expect(categoryAccepts('mentions', ligne('new_message', false))).toBe(false);
  });

  test('une ligne qui se RELIT reste une fois lue', () => {
    expect(categoryAccepts('contacts', ligne('friend_request', true))).toBe(true);
    expect(categoryAccepts('all', ligne('missed_call', true))).toBe(true);
    expect(categoryAccepts('engagement', ligne('badge_earned', true))).toBe(true);
  });

  test('un type inconnu n’entre que sous « Toutes » (et « Non lues » s’il l’est)', () => {
    expect(categoryAccepts('system', ligne('type_de_demain', false))).toBe(false);
    expect(categoryAccepts('all', ligne('type_de_demain', false))).toBe(true);
  });
});

describe('l’accent d’une ligne suit son TYPE, pas sa catégorie', () => {
  test('un badge ne ressemble pas à une invitation', () => {
    expect(notificationAccent('achievement_unlocked')).toBe('var(--ios-warning)');
    expect(notificationAccent('community_invite')).toBe('#F8B500');
  });

  test('une alerte de sécurité porte le rouge, un type inconnu l’indigo du système', () => {
    expect(notificationAccent('login_new_device')).toBe('var(--ios-error-strong)');
    expect(notificationAccent('type_de_demain')).toBe('var(--ios-indigo-500)');
  });
});

describe('une notification CONSOMMÉE quitte la cloche (#8960, miroir de #8958 iOS)', () => {
  const lue = (type: string) => ({ type, state: { isRead: true } });

  test('un message, une réaction, une mention ou un commentaire lus ne s’affichent sous AUCUNE catégorie', () => {
    for (const category of NOTIFICATION_CATEGORIES) {
      for (const type of ['new_message', 'message_reaction', 'user_mentioned', 'post_comment', 'story_new_comment']) {
        expect(categoryAccepts(category, lue(type))).toBe(false);
      }
    }
  });

  test('une famille consommable demande à la passerelle de retirer ses lignes lues', () => {
    const { types, hideReadTypes } = categoryQuery('messages');
    expect(hideReadTypes).toBe(types);
  });

  test('une famille qui se relit ne retire rien', () => {
    expect(categoryQuery('contacts').hideReadTypes).toBeUndefined();
    expect(categoryQuery('unread')).toEqual({ unreadOnly: true });
  });
});

describe('« Engagements » regroupe les paliers (#8960)', () => {
  test('succès, badges, séries et niveaux quittent « Système »', () => {
    const engagement = categoryQuery('engagement').types?.split(',') ?? [];
    const system = categoryQuery('system').types?.split(',') ?? [];
    for (const type of ['achievement_unlocked', 'ACHIEVEMENT_UNLOCKED', 'streak_milestone', 'level_up', 'badge_earned']) {
      expect(engagement).toContain(type);
      expect(system).not.toContain(type);
    }
  });

  test('la puce porte l’ambre des paliers', () => {
    expect(categoryHue('engagement')).toBe('var(--ios-warning)');
  });
});
