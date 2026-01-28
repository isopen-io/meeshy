/**
 * Tests pour notification-helpers - Structure Groupée V2
 * Valide buildNotificationTitle, buildNotificationContent et autres helpers
 */

import {
  buildNotificationTitle,
  buildNotificationContent,
  getNotificationIcon,
  formatNotificationContext,
  getNotificationLink,
  requiresUserAction,
  getActorDisplayName,
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

  describe('formatNotificationContext', () => {
    it('devrait formater une date récente', () => {
      const now = new Date();
      const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);

      const notification = {
        state: {
          createdAt: twoMinutesAgo,
          isRead: false,
          readAt: null,
        },
      } as Notification;

      const context = formatNotificationContext(notification);
      expect(context).toContain('il y a');
    });

    it('devrait gérer une date très ancienne', () => {
      const oldDate = new Date('2020-01-01');

      const notification = {
        state: {
          createdAt: oldDate,
          isRead: false,
          readAt: null,
        },
      } as Notification;

      const context = formatNotificationContext(notification);
      expect(context).toBeTruthy();
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
        type: NotificationTypeEnum.SYSTEM_ANNOUNCEMENT,
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
});
