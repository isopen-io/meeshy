/**
 * Tests pour notification-helpers - Structure Groupée V2
 * Valide buildNotificationTitle, buildNotificationContent et autres helpers
 */

import {
  buildNotificationTitle,
  buildNotificationContent,
  buildNotificationContextLine,
  formatContentPublishedAt,
  getNotificationIcon,
  getNotificationLink,
  requiresUserAction,
  getActorDisplayName,
  formatNotificationTimeAgo,
  groupNotificationsByDate,
} from '@/utils/notification-helpers';
import { NotificationTypeEnum } from '@/types/notification';
import type { Notification } from '@/types/notification';

describe('notification-helpers - Structure Groupée V2', () => {
  describe('getActorDisplayName', () => {
    it('devrait retourner le displayName si disponible', () => {
      const actor = {
        id: 'user_123',
        username: 'alice',
        displayName: 'Alice Martin',
        avatar: null,
      };

      expect(getActorDisplayName(actor)).toBe('Alice Martin');
    });

    it('devrait retourner le username si pas de displayName', () => {
      const actor = {
        id: 'user_123',
        username: 'alice',
        displayName: null,
        avatar: null,
      };

      expect(getActorDisplayName(actor)).toBe('alice');
    });

    it('devrait retourner le fallback si pas d\'actor', () => {
      expect(getActorDisplayName(undefined)).toBe('Un utilisateur');
    });
  });

  describe('buildNotificationTitle', () => {
    const createNotification = (overrides: Partial<Notification> = {}): Notification => ({
      id: 'notif_123',
      userId: 'user_recipient',
      type: NotificationTypeEnum.NEW_MESSAGE,
      priority: 'normal',
      content: 'Test content',
      actor: {
        id: 'user_sender',
        username: 'alice',
        displayName: 'Alice Martin',
        avatar: null,
      },
      context: {
        conversationId: 'conv_123',
        conversationTitle: 'Team Chat',
      },
      metadata: {},
      state: {
        isRead: false,
        readAt: null,
        createdAt: new Date(),
      },
      delivery: {
        emailSent: false,
        pushSent: false,
      },
      ...overrides,
    });

    it('devrait construire le title pour NEW_MESSAGE avec actor', () => {
      const notification = createNotification({
        type: NotificationTypeEnum.NEW_MESSAGE,
      });

      const title = buildNotificationTitle(notification);
      expect(title).toBe('Message de Alice Martin');
    });

    it('devrait construire le title pour USER_MENTIONED', () => {
      const notification = createNotification({
        type: NotificationTypeEnum.USER_MENTIONED,
      });

      const title = buildNotificationTitle(notification);
      expect(title).toBe('Alice Martin vous a cité');
    });

    it('devrait construire le title pour MESSAGE_REACTION', () => {
      const notification = createNotification({
        type: NotificationTypeEnum.MESSAGE_REACTION,
        metadata: {
          reactionEmoji: '👍',
        },
      });

      const title = buildNotificationTitle(notification);
      expect(title).toBe('Alice Martin a réagi à votre message');
    });

    it('devrait construire le title pour MISSED_CALL', () => {
      const notification = createNotification({
        type: NotificationTypeEnum.MISSED_CALL,
      });

      const title = buildNotificationTitle(notification);
      expect(title).toContain('Appel manqué');
      expect(title).toContain('Alice Martin');
    });

    it('devrait construire le title pour CONTACT_REQUEST', () => {
      const notification = createNotification({
        type: NotificationTypeEnum.CONTACT_REQUEST,
      });

      const title = buildNotificationTitle(notification);
      expect(title).toBe('Alice Martin veut se connecter');
    });

    it('devrait construire le title pour CONTACT_ACCEPTED', () => {
      const notification = createNotification({
        type: NotificationTypeEnum.CONTACT_ACCEPTED,
      });

      const title = buildNotificationTitle(notification);
      expect(title).toBe('Alice Martin a accepté votre invitation');
    });

    it('devrait construire le title pour NEW_CONVERSATION_GROUP', () => {
      const notification = createNotification({
        type: NotificationTypeEnum.NEW_CONVERSATION_GROUP,
      });

      const title = buildNotificationTitle(notification);
      expect(title).toBe('Invitation de Alice Martin');
    });

    it('devrait construire le title pour MEMBER_JOINED', () => {
      const notification = createNotification({
        type: NotificationTypeEnum.MEMBER_JOINED,
      });

      const title = buildNotificationTitle(notification);
      expect(title).toBe('Nouveau membre dans Team Chat');
    });

    it('devrait construire le title pour SYSTEM', () => {
      const notification = createNotification({
        type: NotificationTypeEnum.SYSTEM,
        actor: undefined, // Pas d'actor pour notifications système
      });

      const title = buildNotificationTitle(notification);
      expect(title).toBe('Notification système');
    });

    it('devrait gérer les notifications sans actor avec fallback', () => {
      const notification = createNotification({
        type: NotificationTypeEnum.NEW_MESSAGE,
        actor: undefined,
      });

      const title = buildNotificationTitle(notification);
      expect(title).toContain('Un utilisateur');
    });

    it('devrait utiliser username si pas de displayName', () => {
      const notification = createNotification({
        type: NotificationTypeEnum.NEW_MESSAGE,
        actor: {
          id: 'user_123',
          username: 'alice',
          displayName: null,
          avatar: null,
        },
      });

      const title = buildNotificationTitle(notification);
      expect(title).toContain('alice');
    });
  });

  describe('buildNotificationContent', () => {
    const createNotification = (overrides: Partial<Notification> = {}): Notification => ({
      id: 'notif_123',
      userId: 'user_recipient',
      type: NotificationTypeEnum.NEW_MESSAGE,
      priority: 'normal',
      content: 'This is the notification content',
      actor: {
        id: 'user_sender',
        username: 'alice',
        displayName: 'Alice Martin',
        avatar: null,
      },
      context: {},
      metadata: {},
      state: {
        isRead: false,
        readAt: null,
        createdAt: new Date(),
      },
      delivery: {
        emailSent: false,
        pushSent: false,
      },
      ...overrides,
    });

    it('devrait retourner le content de la notification', () => {
      const notification = createNotification({
        content: 'Hey comment ça va?',
      });

      const content = buildNotificationContent(notification);
      expect(content).toBe('Hey comment ça va?');
    });

    it('devrait retourner chaîne vide si pas de content', () => {
      const notification = createNotification({
        content: '',
      });

      const content = buildNotificationContent(notification);
      expect(content).toBe('');
    });

    it('devrait gérer le content undefined', () => {
      const notification = createNotification({
        content: undefined as any,
      });

      const content = buildNotificationContent(notification);
      expect(content).toBe('');
    });
  });

  describe('getNotificationIcon', () => {
    it('devrait retourner l\'icône pour NEW_MESSAGE', () => {
      const notification = { type: NotificationTypeEnum.NEW_MESSAGE } as Notification;
      const icon = getNotificationIcon(notification);
      expect(icon).toEqual({
        emoji: '💬',
        bgColor: 'bg-blue-50',
        color: 'text-blue-600',
      });
    });

    it('devrait retourner l\'icône pour USER_MENTIONED', () => {
      const notification = { type: NotificationTypeEnum.USER_MENTIONED } as Notification;
      const icon = getNotificationIcon(notification);
      expect(icon).toEqual({
        emoji: '@',
        bgColor: 'bg-orange-50',
        color: 'text-orange-600',
      });
    });

    it('devrait retourner l\'icône pour MISSED_CALL', () => {
      const notification = { type: NotificationTypeEnum.MISSED_CALL } as Notification;
      const icon = getNotificationIcon(notification);
      expect(icon).toEqual({
        emoji: '📞',
        bgColor: 'bg-red-50',
        color: 'text-red-600',
      });
    });

    it('devrait retourner l\'icône par défaut pour type inconnu', () => {
      const notification = { type: 'UNKNOWN_TYPE' as any } as Notification;
      const icon = getNotificationIcon(notification);
      expect(icon).toEqual({
        emoji: '🔔',
        bgColor: 'bg-gray-50',
        color: 'text-gray-600',
      });
    });
  });

  describe('getNotificationLink', () => {
    const createNotification = (overrides: Partial<Notification> = {}): Notification => ({
      id: 'notif_123',
      userId: 'user_recipient',
      type: NotificationTypeEnum.NEW_MESSAGE,
      priority: 'normal',
      content: 'Test',
      actor: undefined,
      context: {},
      metadata: {},
      state: {
        isRead: false,
        readAt: null,
        createdAt: new Date(),
      },
      delivery: {
        emailSent: false,
        pushSent: false,
      },
      ...overrides,
    });

    it('devrait retourner le lien vers la conversation pour NEW_MESSAGE', () => {
      const notification = createNotification({
        type: NotificationTypeEnum.NEW_MESSAGE,
        context: {
          conversationId: 'conv_123',
          messageId: 'msg_456',
        },
      });

      const link = getNotificationLink(notification);
      expect(link).toBe('/conversations/conv_123?messageId=msg_456');
    });

    it('devrait retourner le lien vers la conversation sans messageId', () => {
      const notification = createNotification({
        type: NotificationTypeEnum.USER_MENTIONED,
        context: {
          conversationId: 'conv_123',
        },
      });

      const link = getNotificationLink(notification);
      expect(link).toBe('/conversations/conv_123');
    });

    it('devrait retourner null si pas de conversationId', () => {
      const notification = createNotification({
        type: (NotificationTypeEnum as any).SYSTEM_ANNOUNCEMENT,
        context: {},
      });

      const link = getNotificationLink(notification);
      expect(link).toBeNull();
    });
  });

  describe('requiresUserAction', () => {
    it('devrait retourner true pour CONTACT_REQUEST', () => {
      const notification = { type: NotificationTypeEnum.CONTACT_REQUEST } as Notification;
      expect(requiresUserAction(notification)).toBe(true);
    });

    it('devrait retourner false pour NEW_MESSAGE', () => {
      const notification = { type: NotificationTypeEnum.NEW_MESSAGE } as Notification;
      expect(requiresUserAction(notification)).toBe(false);
    });
  });

  describe('getNotificationLink - cibles sociales', () => {
    const makeNotif = (overrides: Partial<Notification> = {}): Notification => ({
      id: 'notif_1',
      userId: 'user_recipient',
      type: NotificationTypeEnum.POST_LIKE,
      priority: 'normal',
      content: '',
      actor: { id: 'a', username: 'bob', displayName: 'Bob', avatar: null },
      context: {},
      metadata: {},
      state: { isRead: false, readAt: null, createdAt: new Date() },
      delivery: { emailSent: false, pushSent: false },
      ...overrides,
    });

    it('route post_like vers /post/:postId', () => {
      const n = makeNotif({ type: NotificationTypeEnum.POST_LIKE, context: { postId: 'p1' } });
      expect(getNotificationLink(n)).toBe('/post/p1');
    });

    it('route post_comment avec commentId vers /post/:postId#comment-:commentId', () => {
      const n = makeNotif({ type: NotificationTypeEnum.POST_COMMENT, context: { postId: 'p1', commentId: 'c1' } });
      expect(getNotificationLink(n)).toBe('/post/p1#comment-c1');
    });

    it('route comment_reply vers /post/:postId#comment-:commentId', () => {
      const n = makeNotif({ type: NotificationTypeEnum.COMMENT_REPLY, context: { postId: 'p2', commentId: 'c2' } });
      expect(getNotificationLink(n)).toBe('/post/p2#comment-c2');
    });

    it('route story_reaction vers /story/:postId', () => {
      const n = makeNotif({ type: NotificationTypeEnum.STORY_REACTION, context: { postId: 's1' } });
      expect(getNotificationLink(n)).toBe('/story/s1');
    });

    it('route friend_story_comment vers /story sans metadata (préfixe `friend_`)', () => {
      const n = makeNotif({ type: NotificationTypeEnum.FRIEND_STORY_COMMENT, context: { postId: 's3', commentId: 'c3' } });
      expect(getNotificationLink(n)).toBe('/story/s3#comment-c3');
    });

    it('route story_new_comment vers /story#comment', () => {
      const n = makeNotif({ type: NotificationTypeEnum.STORY_NEW_COMMENT, context: { postId: 's4', commentId: 'c4' } });
      expect(getNotificationLink(n)).toBe('/story/s4#comment-c4');
    });

    it('route story_thread_reply vers /story#comment', () => {
      const n = makeNotif({ type: NotificationTypeEnum.STORY_THREAD_REPLY, context: { postId: 's5', commentId: 'c5' } });
      expect(getNotificationLink(n)).toBe('/story/s5#comment-c5');
    });

    it('route status_reaction vers /mood/:postId (status partage mood)', () => {
      const n = makeNotif({ type: NotificationTypeEnum.STATUS_REACTION, context: { postId: 'st1' } });
      expect(getNotificationLink(n)).toBe('/mood/st1');
    });

    it('utilise metadata.contentType pour friend_new_story → /story', () => {
      const n = makeNotif({ type: NotificationTypeEnum.FRIEND_NEW_STORY, context: { postId: 's2' }, metadata: { contentType: 'STORY' } as any });
      expect(getNotificationLink(n)).toBe('/story/s2');
    });

    it('utilise metadata.contentType pour friend_new_mood → /mood', () => {
      const n = makeNotif({ type: NotificationTypeEnum.FRIEND_NEW_MOOD, context: { postId: 'm1' }, metadata: { contentType: 'MOOD' } as any });
      expect(getNotificationLink(n)).toBe('/mood/m1');
    });

    it('utilise metadata.contentType POST pour friend_new_post → /post', () => {
      const n = makeNotif({ type: NotificationTypeEnum.FRIEND_NEW_POST, context: { postId: 'pp' }, metadata: { contentType: 'POST' } as any });
      expect(getNotificationLink(n)).toBe('/post/pp');
    });

    it('replie sur metadata.postId si context.postId absent', () => {
      const n = makeNotif({ type: NotificationTypeEnum.POST_LIKE, context: {}, metadata: { postId: 'pm' } as any });
      expect(getNotificationLink(n)).toBe('/post/pm');
    });

    it('utilise metadata.postType=STORY pour router post_like → /story', () => {
      const n = makeNotif({ type: NotificationTypeEnum.POST_LIKE, context: {}, metadata: { postId: 'ps', postType: 'STORY' } as any });
      expect(getNotificationLink(n)).toBe('/story/ps');
    });

    it('utilise metadata.postType=REEL → /reel', () => {
      const n = makeNotif({ type: NotificationTypeEnum.POST_LIKE, context: {}, metadata: { postId: 'pr', postType: 'REEL' } as any });
      expect(getNotificationLink(n)).toBe('/reel/pr');
    });

    it('comment_reply via metadata (postId+commentId) → /post#comment', () => {
      const n = makeNotif({ type: NotificationTypeEnum.COMMENT_REPLY, context: {}, metadata: { postId: 'pc', commentId: 'cc' } as any });
      expect(getNotificationLink(n)).toBe('/post/pc#comment-cc');
    });

    it('comment_reaction sans postId → null (gap données gateway)', () => {
      const n = makeNotif({ type: NotificationTypeEnum.COMMENT_REACTION, context: {}, metadata: { reactionEmoji: '❤️' } as any });
      expect(getNotificationLink(n)).toBeNull();
    });

    it('route friend_request vers /contacts', () => {
      const n = makeNotif({ type: NotificationTypeEnum.FRIEND_REQUEST, context: {} });
      expect(getNotificationLink(n)).toBe('/contacts');
    });

    it('route contact_request vers /contacts', () => {
      const n = makeNotif({ type: NotificationTypeEnum.CONTACT_REQUEST, context: {} });
      expect(getNotificationLink(n)).toBe('/contacts');
    });

    it('priorise conversationId sur postId', () => {
      const n = makeNotif({ type: NotificationTypeEnum.NEW_MESSAGE, context: { conversationId: 'conv_9', postId: 'p9' } });
      expect(getNotificationLink(n)).toBe('/conversations/conv_9');
    });

    it('retourne null pour un type sans cible résoluble', () => {
      const n = makeNotif({ type: NotificationTypeEnum.SYSTEM, context: {}, metadata: {} });
      expect(getNotificationLink(n)).toBeNull();
    });
  });

  describe('formatNotificationTimeAgo', () => {
    const t = (key: string): string => {
      const map: Record<string, string> = {
        'timeAgo.now': 'just now',
        'timeAgo.minute': '{count} min',
        'timeAgo.hour': '{count}h',
        'timeAgo.day': '{count}d',
      };
      return map[key] ?? key;
    };

    it('retourne chaîne vide pour null', () => {
      expect(formatNotificationTimeAgo(null, t)).toBe('');
    });

    it('retourne chaîne vide pour une date invalide', () => {
      expect(formatNotificationTimeAgo('not-a-date', t)).toBe('');
    });

    it('retourne "just now" pour maintenant', () => {
      expect(formatNotificationTimeAgo(new Date(), t)).toBe('just now');
    });

    it('formate les minutes', () => {
      const d = new Date(Date.now() - 5 * 60 * 1000);
      expect(formatNotificationTimeAgo(d, t)).toBe('5 min');
    });

    it('formate les heures', () => {
      const d = new Date(Date.now() - 2 * 60 * 60 * 1000);
      expect(formatNotificationTimeAgo(d, t)).toBe('2h');
    });

    it('formate les jours', () => {
      const d = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      expect(formatNotificationTimeAgo(d, t)).toBe('3d');
    });

    it('formate une date absolue au-delà d\'une semaine', () => {
      const d = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
      const result = formatNotificationTimeAgo(d, t);
      expect(result).not.toBe('');
      expect(result).not.toContain('min');
      expect(result).not.toMatch(/^\d+d$/);
    });
  });

  describe('buildNotificationTitle - types sociaux (i18n)', () => {
    const tt = (key: string, params?: Record<string, string>) =>
      params && params.sender ? `${key}|${params.sender}` : key;
    const mk = (type: NotificationTypeEnum): Notification => ({
      id: 'n', userId: 'u', type, priority: 'normal', content: '',
      actor: { id: 'a', username: 'bob', displayName: 'Bob', avatar: null },
      context: {}, metadata: {},
      state: { isRead: false, readAt: null, createdAt: new Date() },
      delivery: { emailSent: false, pushSent: false },
    });

    it('post_like → titre explicite', () => {
      expect(buildNotificationTitle(mk(NotificationTypeEnum.POST_LIKE), tt)).toBe('titles.postLike|Bob');
    });
    it('comment_reaction → titre explicite', () => {
      expect(buildNotificationTitle(mk(NotificationTypeEnum.COMMENT_REACTION), tt)).toBe('titles.commentReaction|Bob');
    });
    it('comment_reply → titre explicite', () => {
      expect(buildNotificationTitle(mk(NotificationTypeEnum.COMMENT_REPLY), tt)).toBe('titles.commentReply|Bob');
    });
    it('friend_request réutilise la clé contactRequest', () => {
      expect(buildNotificationTitle(mk(NotificationTypeEnum.FRIEND_REQUEST), tt)).toBe('titles.contactRequest|Bob');
    });
    it('login_new_device → titre sans sender', () => {
      expect(buildNotificationTitle(mk(NotificationTypeEnum.LOGIN_NEW_DEVICE), tt)).toBe('titles.loginNewDevice');
    });
  });

  describe('buildNotificationContent - corps non redondant', () => {
    const tt = (key: string) => key;
    const mk = (type: NotificationTypeEnum, content: string): Notification => ({
      id: 'n', userId: 'u', type, priority: 'normal', content,
      actor: { id: 'a', username: 'bob', displayName: 'Bob', avatar: null },
      context: {}, metadata: {},
      state: { isRead: false, readAt: null, createdAt: new Date() },
      delivery: { emailSent: false, pushSent: false },
    });

    it('post_like → corps vide (le titre suffit)', () => {
      expect(buildNotificationContent(mk(NotificationTypeEnum.POST_LIKE, 'a réagi ❤️ à votre publication'), tt)).toBe('');
    });
    it('comment_reaction → corps vide', () => {
      expect(buildNotificationContent(mk(NotificationTypeEnum.COMMENT_REACTION, 'X a réagi à votre commentaire'), tt)).toBe('');
    });
    it('comment_reply → conserve le commentaire en corps', () => {
      expect(buildNotificationContent(mk(NotificationTypeEnum.COMMENT_REPLY, '😂 exactement'), tt)).toBe('😂 exactement');
    });
  });

  describe('buildNotificationTitle - préférence titre serveur', () => {
    const tt = (key: string, params?: Record<string, string>) =>
      params && params.sender ? `${key}|${params.sender}` : key;
    const mk = (overrides: Partial<Notification> = {}): Notification => ({
      id: 'n', userId: 'u', type: NotificationTypeEnum.COMMENT_REPLY, priority: 'normal', content: '',
      actor: { id: 'a', username: 'belva', displayName: 'Belva Tano', avatar: null },
      context: {}, metadata: {},
      state: { isRead: false, readAt: null, createdAt: new Date() },
      delivery: { emailSent: false, pushSent: false },
      ...overrides,
    });

    it('retourne le titre serveur tel quel quand présent (source unique)', () => {
      const n = mk({ title: 'Belva Tano a répondu à votre commentaire' });
      expect(buildNotificationTitle(n, tt)).toBe('Belva Tano a répondu à votre commentaire');
    });

    it('ignore un titre serveur vide/espaces et applique le repli i18n', () => {
      expect(buildNotificationTitle(mk({ title: '   ' }), tt)).toBe('titles.commentReply|Belva Tano');
    });

    it('applique le repli i18n quand le titre serveur est null', () => {
      expect(buildNotificationTitle(mk({ title: null }), tt)).toBe('titles.commentReply|Belva Tano');
    });

    it('applique le repli i18n quand le champ title est absent', () => {
      expect(buildNotificationTitle(mk(), tt)).toBe('titles.commentReply|Belva Tano');
    });
  });

  describe('formatContentPublishedAt', () => {
    const t = (key: string, params?: Record<string, string>) => {
      const map: Record<string, string> = {
        'timeAgo.now': "à l'instant",
        'timeAgo.minute': 'il y a {count} min',
        'timeAgo.hour': 'il y a {count}h',
        'timeAgo.yesterdayAt': 'hier {time}',
      };
      let out = map[key] ?? key;
      if (params) for (const [k, v] of Object.entries(params)) out = out.replace(`{${k}}`, v);
      return out;
    };

    it('retourne chaîne vide pour valeur absente ou invalide', () => {
      expect(formatContentPublishedAt(null, t)).toBe('');
      expect(formatContentPublishedAt(undefined, t)).toBe('');
      expect(formatContentPublishedAt('not-a-date', t)).toBe('');
    });

    it('utilise « à l\'instant » sous une minute', () => {
      const justNow = new Date(Date.now() - 10 * 1000).toISOString();
      expect(formatContentPublishedAt(justNow, t)).toBe("à l'instant");
    });

    it('utilise le format relatif minutes', () => {
      const sixMinAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
      expect(formatContentPublishedAt(sixMinAgo, t)).toBe('il y a 6 min');
    });

    it('utilise « il y a {count}h » pour aujourd\'hui au-delà d\'une heure', () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 5, 15, 14, 0));
      const threeHoursAgo = new Date(2026, 5, 15, 11, 0);
      expect(formatContentPublishedAt(threeHoursAgo.toISOString(), t, 'fr')).toBe('il y a 3h');
      jest.useRealTimers();
    });

    it('utilise « hier {time} » pour la veille', () => {
      const now = new Date();
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 14, 30);
      expect(formatContentPublishedAt(yesterday.toISOString(), t, 'fr').startsWith('hier ')).toBe(true);
    });

    // Le bucket jour est calculé via calendarDayDiff (SSOT DST-safe), pas via un
    // delta fixe de 24 h : l'avant-veille reste une date absolue même un jour de
    // transition heure d'été/hiver. La correction DST elle-même est couverte par
    // packages/shared/__tests__/utils/calendar-date.test.ts.
    it('utilise une date absolue pour l\'avant-veille (2 jours)', () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 5, 15, 14, 0));
      const twoDaysAgo = new Date(2026, 5, 13, 14, 0);
      expect(formatContentPublishedAt(twoDaysAgo.toISOString(), t, 'fr')).toMatch(/\d{2}\/\d{2}\/\d{4}/);
      jest.useRealTimers();
    });

    it('utilise une date+heure absolue au-delà', () => {
      const old = new Date('2020-01-15T09:05:00Z').toISOString();
      expect(formatContentPublishedAt(old, t, 'fr')).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });
  });

  describe('buildNotificationContextLine', () => {
    const t = (key: string, params?: Record<string, string>) => {
      const map: Record<string, string> = { 'timeAgo.minute': 'il y a {count} min' };
      let out = map[key] ?? key;
      if (params) for (const [k, v] of Object.entries(params)) out = out.replace(`{${k}}`, v);
      return out;
    };
    const mk = (overrides: Partial<Notification> = {}): Notification => ({
      id: 'n', userId: 'u', type: NotificationTypeEnum.STORY_REACTION, priority: 'normal', content: '',
      actor: { id: 'a', username: 'bob', displayName: 'Bob', avatar: null },
      context: {}, metadata: {},
      state: { isRead: false, readAt: null, createdAt: new Date() },
      delivery: { emailSent: false, pushSent: false },
      ...overrides,
    });

    it('retourne null pour un type non social', () => {
      expect(buildNotificationContextLine(mk({ type: NotificationTypeEnum.NEW_MESSAGE, subtitle: 'x' }), t)).toBeNull();
    });

    it('retourne null quand subtitle est absent', () => {
      expect(buildNotificationContextLine(mk(), t)).toBeNull();
    });

    it('retourne le subtitle seul sans postCreatedAt', () => {
      expect(buildNotificationContextLine(mk({ subtitle: 'Votre story' }), t)).toBe('Votre story');
    });

    it('décore le subtitle avec la date locale de publication', () => {
      const sixMinAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
      const n = mk({ subtitle: 'Votre story', context: { postCreatedAt: sixMinAgo } });
      expect(buildNotificationContextLine(n, t)).toBe('Votre story · il y a 6 min');
    });

    it('marque « expirée » quand le contenu lié est expiré (parité iOS)', () => {
      const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const te = (key: string) => (key === 'context.expired' ? 'expirée' : key);
      const n = mk({ subtitle: 'Story', context: { postExpiresAt: past } });
      expect(buildNotificationContextLine(n, te)).toBe('Story · expirée');
    });

    it('n’ajoute pas le marqueur quand le contenu n’est pas expiré', () => {
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const n = mk({ subtitle: 'Story', context: { postExpiresAt: future } });
      expect(buildNotificationContextLine(n, t)).toBe('Story');
    });
  });

  describe('groupNotificationsByDate', () => {
    const labels = {
      today: 'today',
      yesterday: 'yesterday',
      thisWeek: 'thisWeek',
      thisMonth: 'thisMonth',
      older: 'older',
    };

    // Facteur déterministe : createdAt injectable, reste minimal.
    const at = (createdAt: Date): Notification => ({
      id: `n_${createdAt.getTime()}`,
      userId: 'u',
      type: NotificationTypeEnum.NEW_MESSAGE,
      priority: 'normal',
      content: '',
      actor: { id: 'a', username: 'a', displayName: 'A', avatar: null },
      context: {},
      metadata: {},
      state: { isRead: false, readAt: null, createdAt },
      delivery: { emailSent: false, pushSent: false },
    });

    const bucketOf = (
      created: Date,
      now: Date
    ): string | undefined =>
      groupNotificationsByDate([at(created)], labels, now).find(
        (g) => g.notifications.length > 0
      )?.label;

    it('range une notification vieille de 3 jours dans « this week » — même un dimanche (bug d’effondrement du bucket)', () => {
      const sunday = new Date(2026, 6, 5, 12, 0, 0); // dimanche 2026-07-05
      const threeDaysAgo = new Date(2026, 6, 2, 9, 0, 0); // jeudi 2026-07-02
      expect(bucketOf(threeDaysAgo, sunday)).toBe('thisWeek');
    });

    it('n’émet jamais de bucket « today » redondant pour la fenêtre semaine un dimanche', () => {
      const sunday = new Date(2026, 6, 5, 12, 0, 0);
      const groups = groupNotificationsByDate(
        [at(new Date(2026, 6, 5, 8, 0, 0)), at(new Date(2026, 6, 3, 8, 0, 0))],
        labels,
        sunday
      );
      const today = groups.find((g) => g.label === 'today');
      const thisWeek = groups.find((g) => g.label === 'thisWeek');
      expect(today?.notifications).toHaveLength(1); // le dimanche même
      expect(thisWeek?.notifications).toHaveLength(1); // vendredi J-2
    });

    it('reste cohérent en milieu de semaine : J-5 tombe dans « this week », pas « this month »', () => {
      const wednesday = new Date(2026, 6, 8, 12, 0, 0); // mercredi 2026-07-08
      const fiveDaysAgo = new Date(2026, 6, 3, 9, 0, 0); // vendredi 2026-07-03
      expect(bucketOf(fiveDaysAgo, wednesday)).toBe('thisWeek');
    });

    it('classe today / yesterday / this week / this month / older aux bonnes bornes', () => {
      const now = new Date(2026, 6, 20, 12, 0, 0); // lundi 2026-07-20
      expect(bucketOf(new Date(2026, 6, 20, 1, 0, 0), now)).toBe('today');
      expect(bucketOf(new Date(2026, 6, 19, 23, 0, 0), now)).toBe('yesterday');
      expect(bucketOf(new Date(2026, 6, 15, 9, 0, 0), now)).toBe('thisWeek'); // J-5
      expect(bucketOf(new Date(2026, 6, 2, 9, 0, 0), now)).toBe('thisMonth'); // J-18, même mois
      expect(bucketOf(new Date(2026, 5, 25, 9, 0, 0), now)).toBe('older'); // mois précédent
    });

    it('préserve l’ordre canonique des buckets et supprime les groupes vides', () => {
      const now = new Date(2026, 6, 20, 12, 0, 0);
      const groups = groupNotificationsByDate(
        [
          at(new Date(2026, 5, 25, 9, 0, 0)), // older
          at(new Date(2026, 6, 20, 1, 0, 0)), // today
          at(new Date(2026, 6, 15, 9, 0, 0)), // thisWeek
        ],
        labels,
        now
      );
      expect(groups.map((g) => g.label)).toEqual(['today', 'thisWeek', 'older']);
    });
  });
});
