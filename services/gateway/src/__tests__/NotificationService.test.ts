/**
 * NotificationService Unit Tests - Structure Groupée
 *
 * Tests la nouvelle architecture de notifications avec:
 * - Structure groupée (CORE, ACTOR, CONTEXT, METADATA, STATE, DELIVERY)
 * - Absence de champ `title` en DB
 * - Metadata typé par discriminated unions
 * - Formatage correct pour Socket.IO
 *
 * @jest-environment node
 */

import { NotificationService } from '../services/notifications/NotificationService';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { Server as SocketIOServer } from 'socket.io';
import type { Notification, NotificationType } from '@meeshy/shared/types/notification';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';

// Mock Prisma
//
// Tout modèle interrogé sur le chemin d'une création de notification DOIT
// figurer ici : un modèle absent ne lève pas « champ manquant » mais
// « findUnique is not a function », et l'échec surgit à des dizaines de
// lignes du test qui l'a causé. Les gardes ajoutées au service depuis
// (refetch anti-fuite du message, mute par conversation, préférences,
// incrustation des avatars vivants) interrogent chacune un modèle de plus.
const mockPrisma = {
  notification: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  conversation: {
    findUnique: jest.fn(),
  },
  message: {
    findUnique: jest.fn(),
  },
  participant: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  friendRequest: {
    findUnique: jest.fn(),
  },
  userPreferences: {
    findUnique: jest.fn(),
  },
  userConversationPreferences: {
    findMany: jest.fn(),
  },
  postComment: {
    findUnique: jest.fn(),
  },
  postMedia: {
    findMany: jest.fn(),
  },
  postReaction: {
    findMany: jest.fn(),
  },
} as any;

// Mock Socket.IO
const mockIO = {
  to: jest.fn().mockReturnThis(),
  emit: jest.fn(),
} as any;

// Mock logger
jest.mock('../utils/logger-enhanced', () => ({
  notificationLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('NotificationService - Structure Groupée', () => {
  let service: NotificationService;

  beforeEach(() => {
    jest.clearAllMocks();

    // `clearAllMocks` remet les compteurs d'appels à zéro mais NE purge PAS
    // les implémentations : sans ces défauts, le `mockResolvedValue` du test
    // précédent fuiterait dans le suivant. On repose donc un état neutre —
    // « rien ne bloque » — que chaque test surcharge à sa guise.
    //
    // `message.findUnique` en particulier n'est pas optionnel : la garde
    // anti-fuite en tête de `createMessageNotification` refetch le message
    // et rend `null` s'il a disparu. Un mock qui rend `undefined` fait donc
    // sortir la méthode AVANT tout `notification.create`, et le test échoue
    // sur un `calls[0]` indéfini sans jamais dire pourquoi.
    mockPrisma.message.findUnique.mockResolvedValue({
      id: 'msg_123',
      deletedAt: null,
      expiresAt: null,
      isViewOnce: false,
      viewOnceCount: 0,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      messageType: 'text',
      translations: null,
    });
    // Aucune conversation en sourdine : le filtre de mute laisse tout passer.
    mockPrisma.userConversationPreferences.findMany.mockResolvedValue([]);
    // Aucune préférence enregistrée → le service applique ses défauts.
    mockPrisma.userPreferences.findUnique.mockResolvedValue(null);
    // Incrustation des avatars vivants : aucun acteur à rafraîchir.
    mockPrisma.user.findMany.mockResolvedValue([]);

    service = new NotificationService(mockPrisma);
    service.setSocketIO(mockIO);
  });

  describe('Structure Groupée - new_message', () => {
    it('devrait créer une notification avec structure groupée complète', async () => {
      const mockSender = {
        id: 'user_sender',
        username: 'alice',
        displayName: 'Alice Martin',
        avatar: 'https://cdn.example.com/alice.jpg',
      };

      const mockConversation = {
        id: 'conv_123',
        title: 'Équipe Dev',
        type: 'group',
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockSender);
      mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation);
      mockPrisma.notification.create.mockImplementation((data) => ({
        id: 'notif_abc',
        ...data.data,
      }));

      const result = await service.createMessageNotification({
        recipientUserId: 'user_recipient',
        senderId: 'user_sender',
        messageId: 'msg_123',
        conversationId: 'conv_123',
        messagePreview: 'Salut! Comment vas-tu?',
      });

      expect(result).toBeDefined();

      // Vérifier l'appel à create
      const createCall = mockPrisma.notification.create.mock.calls[0][0];
      const notificationData = createCall.data;

      // CORE
      expect(notificationData.userId).toBe('user_recipient');
      expect(notificationData.type).toBe('new_message');
      expect(notificationData.priority).toBe('normal');
      expect(notificationData.content).toBe('Salut! Comment vas-tu?');

      // Le titre n'est plus « absent » mais explicitement `null` : le service
      // persiste désormais `title`/`subtitle` comme source unique pour le push
      // ET l'in-app, déjà localisés dans la langue résolue du destinataire.
      // Quand aucune langue n'est résolue, il pose `null` — le client compose
      // alors lui-même. `null`, pas `undefined` : le champ existe en base.
      expect(notificationData.title).toBeNull();

      // ACTOR
      expect(notificationData.actor).toEqual({
        id: 'user_sender',
        username: 'alice',
        displayName: 'Alice Martin',
        avatar: 'https://cdn.example.com/alice.jpg',
      });

      // CONTEXT. Le refetch anti-fuite en tête de méthode sert aussi à
      // alimenter les champs que l'extension de notification iOS persiste
      // sans réseau : `messageCreatedAt` et `messageType` viennent de la
      // relecture, pas des paramètres d'appel.
      expect(notificationData.context).toMatchObject({
        conversationId: 'conv_123',
        conversationTitle: 'Équipe Dev',
        conversationType: 'group',
        messageId: 'msg_123',
        messageType: 'text',
      });
      expect(notificationData.context.messageCreatedAt)
        .toBe(new Date('2026-01-01T00:00:00Z').toISOString());

      // METADATA. Un message sans pièce jointe ne porte aucun tableau
      // `attachments` : la clé est omise plutôt que posée à vide.
      expect(notificationData.metadata).toEqual({
        action: 'view_message',
        messagePreview: 'Salut! Comment vas-tu?',
      });

      // STATE
      expect(notificationData.isRead).toBe(false);
      expect(notificationData.readAt).toBeNull();
      expect(notificationData.createdAt).toBeInstanceOf(Date);

      // DELIVERY
      expect(notificationData.delivery).toEqual({
        emailSent: false,
        pushSent: false,
      });
    });

    it('ne stocke aucun titre figé quand la langue du destinataire est inconnue', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user_sender',
        username: 'bob',
      });
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 'conv_123',
        title: 'Test',
      });
      mockPrisma.notification.create.mockImplementation((data) => data.data);

      await service.createMessageNotification({
        recipientUserId: 'user_recipient',
        senderId: 'user_sender',
        messageId: 'msg_123',
        conversationId: 'conv_123',
        messagePreview: 'Test message',
      });

      const createCall = mockPrisma.notification.create.mock.calls[0][0];
      expect(createCall.data.title).toBeNull();
    });
  });

  describe('Structure Groupée - user_mentioned', () => {
    it('devrait créer une notification de mention avec metadata correct', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user_sender',
        username: 'charlie',
        displayName: 'Charlie',
      });
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 'conv_123',
        title: 'Projet',
      });
      mockPrisma.notification.create.mockImplementation((data) => ({
        id: 'notif_mention',
        ...data.data,
      }));

      const result = await service.createMentionNotification({
        mentionedUserId: 'user_mentioned',
        mentionerUserId: 'user_sender',
        messageId: 'msg_123',
        conversationId: 'conv_123',
        messagePreview: 'Merci @alice pour ton aide!',
      });

      expect(result).toBeDefined();

      const createCall = mockPrisma.notification.create.mock.calls[0][0];

      // Type
      expect(createCall.data.type).toBe('user_mentioned');

      // Context avec originalMessageId
      expect(createCall.data.context.messageId).toBe('msg_123');

      // Metadata spécifique mention : l'aperçu du message mentionnant, plus
      // l'action que le tap doit déclencher côté client.
      expect(createCall.data.metadata).toEqual({
        action: 'view_message',
        messagePreview: 'Merci @alice pour ton aide!',
      });
      expect(createCall.data.content).toContain('Merci @alice');
    });
  });

  describe('Structure Groupée - message_reaction', () => {
    it('devrait créer une notification de réaction avec emoji dans metadata', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user_sender',
        username: 'diane',
      });
      mockPrisma.message.findUnique.mockResolvedValue({
        id: 'msg_original',
        content: 'Super idée!',
        conversationId: 'conv_123',
      });
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 'conv_123',
        title: 'Team',
      });
      mockPrisma.notification.create.mockImplementation((data) => ({
        id: 'notif_reaction',
        ...data.data,
      }));

      const result = await service.createReactionNotification({
        messageAuthorId: 'user_author',
        reactorUserId: 'user_sender',
        messageId: 'msg_original',
        conversationId: 'conv_123',
        reactionEmoji: '❤️',
      });

      expect(result).toBeDefined();

      const createCall = mockPrisma.notification.create.mock.calls[0][0];

      // Type
      expect(createCall.data.type).toBe('message_reaction');

      // Metadata avec emoji. Le contenu du message réagi est porté par
      // `messageContent` (et non `messagePreview` comme pour une mention :
      // une réaction cite le message d'autrui, elle n'en est pas l'aperçu).
      expect(createCall.data.metadata).toEqual({
        action: 'view_message',
        messageContent: 'Super idée!',
        reactionEmoji: '❤️',
      });
    });
  });

  describe('Structure Groupée - missed_call', () => {
    it('devrait créer une notification d\'appel manqué avec callSessionId', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user_caller',
        username: 'eve',
      });
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 'conv_123',
        type: 'direct',
      });
      mockPrisma.notification.create.mockImplementation((data) => ({
        id: 'notif_call',
        ...data.data,
      }));

      const result = await service.createMissedCallNotification({
        recipientUserId: 'user_recipient',
        callerId: 'user_caller',
        conversationId: 'conv_123',
        callSessionId: 'call_999',
        callType: 'video',
      });

      expect(result).toBeDefined();

      const createCall = mockPrisma.notification.create.mock.calls[0][0];

      // Type
      expect(createCall.data.type).toBe('missed_call');

      // Priority élevée pour appels
      expect(createCall.data.priority).toBe('high');

      // Context avec callSessionId
      expect(createCall.data.context).toEqual({
        conversationId: 'conv_123',
        conversationType: 'direct',
        callSessionId: 'call_999',
      });

      // Metadata avec callType. Pas de `duration` : un appel manqué n'a par
      // définition aucune durée, le champ a été retiré plutôt que posé à null.
      expect(createCall.data.metadata).toEqual({
        action: 'view_conversation',
        callType: 'video',
      });
    });
  });

  describe('Structure Groupée - friend_request', () => {
    it('devrait créer une notification de demande d\'ami', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user_requester',
        username: 'frank',
        displayName: 'Frank',
      });
      mockPrisma.notification.create.mockImplementation((data) => ({
        id: 'notif_friend',
        ...data.data,
      }));

      const result = await service.createFriendRequestNotification({
        userId: 'user_recipient',
        requesterId: 'user_requester',
        friendRequestId: 'req_789',
      });

      expect(result).toBeDefined();

      const createCall = mockPrisma.notification.create.mock.calls[0][0];

      // Type
      expect(createCall.data.type).toBe('friend_request');

      // Context avec friendRequestId
      expect(createCall.data.context).toEqual({
        friendRequestId: 'req_789',
      });

      // Actor
      expect(createCall.data.actor.username).toBe('frank');
    });
  });

  describe('Formatage pour Socket.IO', () => {
    it('devrait émettre la notification avec structure groupée complète', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user_sender',
        username: 'alice',
      });
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 'conv_123',
        title: 'Test',
      });
      mockPrisma.notification.create.mockImplementation((data) => ({
        id: 'notif_socket',
        ...data.data,
      }));

      await service.createMessageNotification({
        recipientUserId: 'user_recipient',
        senderId: 'user_sender',
        messageId: 'msg_123',
        conversationId: 'conv_123',
        messagePreview: 'Test',
      });

      // Vérifier l'émission Socket.IO — la room user-scoped `user:${id}` que les
      // sockets enregistrés rejoignent à l'auth, PAS l'id brut (régression :
      // io.to(userId) n'atteignait aucun socket → notification:new jamais reçue).
      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.user('user_recipient'));
      expect(mockIO.to).not.toHaveBeenCalledWith('user_recipient');
      expect(mockIO.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.NOTIFICATION_NEW,
        expect.objectContaining({
          id: 'notif_socket',
          actor: expect.any(Object),
          context: expect.any(Object),
          metadata: expect.any(Object),
          state: expect.any(Object),
          delivery: expect.any(Object),
        })
      );

      // Le payload socket porte le même en-tête que la bannière native : le
      // titre est le NOM DE L'ACTEUR, pas une phrase composée côté serveur.
      // C'est ce qui permet à iOS de donner l'intention de communication au
      // bon interlocuteur — un titre du type « Nouveau message » casserait ça.
      const emitCall = mockIO.emit.mock.calls[0][1];
      expect(emitCall.title).toBe('alice');
    });
  });

  describe('Formatage des Notifications', () => {
    it('devrait formater correctement les dates dans state', async () => {
      const mockNotification = {
        id: 'notif_123',
        userId: 'user_123',
        type: 'new_message',
        priority: 'normal',
        content: 'Test',
        actor: { id: 'sender', username: 'alice' },
        context: {},
        metadata: {},
        isRead: false,
        readAt: null,
        createdAt: new Date('2025-01-28T10:00:00Z'),
        expiresAt: null,
        delivery: { emailSent: false, pushSent: false },
      };

      mockPrisma.notification.create.mockResolvedValue(mockNotification);

      // Utiliser la méthode privée formatNotification via réflexion
      const formatted = (service as any).formatNotification(mockNotification);

      expect(formatted.state.createdAt).toBeInstanceOf(Date);
      expect(formatted.state.readAt).toBeNull();
      expect(formatted.state.isRead).toBe(false);
    });

    it('devrait gérer les acteurs null pour notifications système', async () => {
      const mockNotification = {
        id: 'notif_sys',
        userId: 'user_123',
        type: 'system',
        priority: 'normal',
        content: 'System message',
        actor: null,
        context: {},
        metadata: { category: 'announcement' },
        isRead: false,
        readAt: null,
        createdAt: new Date(),
        delivery: { emailSent: false, pushSent: false },
      };

      const formatted = (service as any).formatNotification(mockNotification);

      expect(formatted.actor).toBeUndefined();
      expect(formatted.type).toBe('system');
    });
  });

  describe('getUserNotifications - Pagination', () => {
    it('devrait retourner des notifications paginées avec structure groupée', async () => {
      const mockNotifications = [
        {
          id: 'notif_1',
          userId: 'user_123',
          type: 'new_message',
          priority: 'normal',
          content: 'Message 1',
          actor: { id: 'sender1', username: 'alice' },
          context: { conversationId: 'conv_1' },
          metadata: {},
          isRead: false,
          readAt: null,
          createdAt: new Date(),
          delivery: { emailSent: false, pushSent: false },
        },
        {
          id: 'notif_2',
          userId: 'user_123',
          type: 'user_mentioned',
          priority: 'high',
          content: 'Mention',
          actor: { id: 'sender2', username: 'bob' },
          context: { conversationId: 'conv_1', messageId: 'msg_1' },
          metadata: { mentionContext: 'Test mention' },
          isRead: true,
          readAt: new Date(),
          createdAt: new Date(),
          delivery: { emailSent: false, pushSent: false },
        },
      ];

      mockPrisma.notification.findMany.mockResolvedValue(mockNotifications);
      mockPrisma.notification.count.mockResolvedValue(2);

      const result = await service.getUserNotifications({
        userId: 'user_123',
        limit: 10,
        offset: 0,
      });

      expect(result.notifications).toHaveLength(2);
      expect(result.total).toBe(2);

      // Vérifier structure groupée
      result.notifications.forEach((notif) => {
        expect(notif).toHaveProperty('actor');
        expect(notif).toHaveProperty('context');
        expect(notif).toHaveProperty('metadata');
        expect(notif).toHaveProperty('state');
        expect(notif).toHaveProperty('delivery');
        // Le champ existe désormais en base ; ce qui compte est qu'aucun titre
        // figé ne soit relu ici quand rien n'a été persisté.
        expect(notif.title ?? null).toBeNull();
      });
    });
  });

  describe('markAsRead', () => {
    it('devrait marquer une notification comme lue', async () => {
      const mockNotification = {
        id: 'notif_123',
        userId: 'user_123',
        isRead: false,
        readAt: null,
        createdAt: new Date(),
      };

      mockPrisma.notification.findUnique.mockResolvedValue(mockNotification);
      mockPrisma.notification.update.mockResolvedValue({
        ...mockNotification,
        isRead: true,
        readAt: new Date(),
      });

      const result = await service.markAsRead('notif_123');

      expect(result).toBeDefined();
      expect(mockPrisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif_123' },
        data: {
          isRead: true,
          readAt: expect.any(Date),
        },
      });
    });
  });

  describe('markAllAsRead', () => {
    it('devrait marquer toutes les notifications comme lues', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 5 });

      const count = await service.markAllAsRead('user_123');

      expect(count).toBe(5);
      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user_123',
          isRead: false,
        },
        data: {
          isRead: true,
          readAt: expect.any(Date),
        },
      });
    });
  });

  describe('getUnreadCount', () => {
    it('devrait retourner le nombre de notifications non lues', async () => {
      mockPrisma.notification.count.mockResolvedValue(12);

      const count = await service.getUnreadCount('user_123');

      expect(count).toBe(12);
      expect(mockPrisma.notification.count).toHaveBeenCalledWith({
        where: {
          userId: 'user_123',
          isRead: false,
        },
      });
    });
  });

  describe('deleteNotification', () => {
    it('devrait supprimer une notification', async () => {
      mockPrisma.notification.delete.mockResolvedValue({ id: 'notif_123' });

      const result = await service.deleteNotification('notif_123');

      expect(result).toBe(true);
      expect(mockPrisma.notification.delete).toHaveBeenCalledWith({
        where: { id: 'notif_123' },
      });
    });

    it('devrait retourner false en cas d\'erreur', async () => {
      mockPrisma.notification.delete.mockRejectedValue(new Error('Not found'));

      const result = await service.deleteNotification('notif_invalid');

      expect(result).toBe(false);
    });
  });

  describe('Validation des Types', () => {
    it('devrait accepter tous les types valides de NotificationType', async () => {
      const validTypes: NotificationType[] = [
        'new_message',
        'user_mentioned',
        'message_reaction',
        'missed_call',
        'friend_request',
        'friend_accepted',
        'member_joined',
        'system',
      ];

      // Juste vérifier que les types sont reconnus
      validTypes.forEach((type) => {
        expect(type).toBeDefined();
      });
    });
  });

  describe('Gestion des Erreurs', () => {
    it('devrait retourner null si l\'utilisateur n\'existe pas', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.createMessageNotification({
        userId: 'user_recipient',
        senderId: 'user_invalid',
        messageId: 'msg_123',
        conversationId: 'conv_123',
        preview: 'Test',
      });

      expect(result).toBeNull();
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });

    it('devrait gérer les erreurs de création gracieusement', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user_sender',
        username: 'alice',
      });
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 'conv_123',
      });
      mockPrisma.notification.create.mockRejectedValue(new Error('DB Error'));

      const result = await service.createMessageNotification({
        userId: 'user_recipient',
        senderId: 'user_sender',
        messageId: 'msg_123',
        conversationId: 'conv_123',
        preview: 'Test',
      });

      expect(result).toBeNull();
    });
  });
});
