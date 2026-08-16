/**
 * MessageReadStatusService.notificationCascade.test.ts
 *
 * La cascade « conversation lue → notifications de la conversation lues » doit
 * être INDÉPENDANTE de l'avancement du curseur de lecture. Historiquement elle
 * vivait en toute fin de `markMessagesAsRead`, derrière quatre early-returns
 * (conversation sans message, dédup TTL, curseur déjà à jour) : une réaction ou
 * une mention arrivée sur un message déjà lu laissait sa notification non lue
 * pour toujours — le curseur ne bougeant plus, la cascade ne partait jamais.
 *
 * Elle doit aussi utiliser le NotificationService PARTAGÉ (celui du manager
 * Socket.IO, câblé avec `io`) quand il est enregistré : l'instance locale
 * historique n'avait pas `io`, donc `notification:counts` n'était jamais émis
 * après lecture d'une conversation (`emitCountsUpdate` early-return sur !io).
 *
 * @jest-environment node
 */

const mockMarkConversationNotificationsAsRead = jest.fn<any>().mockResolvedValue(0);

jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    markConversationNotificationsAsRead: mockMarkConversationNotificationsAsRead,
  })),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
}));

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { MessageReadStatusService } from '../../../services/MessageReadStatusService';
import { clearPrivacyPreferencesCache } from '../../../services/preferences/privacy-cache';
import {
  setSharedNotificationService,
  getSharedNotificationService,
} from '../../../services/notifications/notification-service-registry';

const PARTICIPANT_ID = '507f1f77bcf86cd799439011';
const CONVERSATION_ID = '507f1f77bcf86cd799439012';
const MESSAGE_ID = '507f1f77bcf86cd799439013';
const USER_ID = '64a000000000000000000001';

const flushAsync = () => new Promise((resolve) => setImmediate(resolve));

const mockPrisma: any = {
  conversationReadCursor: {
    findUnique: jest.fn<any>(),
    updateMany: jest.fn<any>(),
    create: jest.fn<any>(),
  },
  messageStatusEntry: {
    findMany: jest.fn<any>(),
    createMany: jest.fn<any>(),
    updateMany: jest.fn<any>(),
    count: jest.fn<any>(),
  },
  message: {
    count: jest.fn<any>(),
    findFirst: jest.fn<any>(),
    findUnique: jest.fn<any>(),
    findMany: jest.fn<any>(),
  },
  participant: {
    findUnique: jest.fn<any>(),
    findFirst: jest.fn<any>(),
    findMany: jest.fn<any>(),
  },
  userPreferences: {
    findMany: jest.fn()
  },
  userPreference: {
    findMany: jest.fn<any>(),
  },
  $transaction: jest.fn<any>().mockImplementation(async (callback: (tx: any) => Promise<any>) => callback(mockPrisma)),
};

describe('MessageReadStatusService — cascade notifications indépendante du curseur', () => {
  let service: MessageReadStatusService;

  beforeEach(() => {
    jest.clearAllMocks();
    (MessageReadStatusService as any).recentActionCache.clear();
    clearPrivacyPreferencesCache();

    service = new MessageReadStatusService(mockPrisma);

    mockPrisma.participant.findUnique.mockResolvedValue({ userId: USER_ID });
    mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
    mockPrisma.conversationReadCursor.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.conversationReadCursor.create.mockResolvedValue({});
    mockPrisma.message.findFirst.mockResolvedValue({ id: MESSAGE_ID });
    mockPrisma.message.findUnique.mockResolvedValue({ createdAt: new Date('2026-08-01T00:00:00Z') });
    mockPrisma.message.findMany.mockResolvedValue([]);
    mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);
    mockPrisma.messageStatusEntry.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.messageStatusEntry.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.userPreference.findMany.mockResolvedValue([]);
    mockPrisma.userPreferences.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    setSharedNotificationService(undefined);
  });

  it('déclenche la cascade quand la conversation ne contient AUCUN message', async () => {
    mockPrisma.message.findFirst.mockResolvedValue(null);

    await service.markMessagesAsRead(PARTICIPANT_ID, CONVERSATION_ID);
    await flushAsync();

    expect(mockMarkConversationNotificationsAsRead).toHaveBeenCalledWith(USER_ID, CONVERSATION_ID);
  });

  it("déclenche la cascade quand le curseur n'avance pas (receipt périmé)", async () => {
    mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({
      lastReadAt: new Date('2026-08-02T00:00:00Z'),
      lastDeliveredAt: new Date('2026-08-02T00:00:00Z'),
    });
    mockPrisma.conversationReadCursor.updateMany.mockResolvedValue({ count: 0 });

    await service.markMessagesAsRead(PARTICIPANT_ID, CONVERSATION_ID, MESSAGE_ID);
    await flushAsync();

    expect(mockMarkConversationNotificationsAsRead).toHaveBeenCalledWith(USER_ID, CONVERSATION_ID);
  });

  it('déduplique la cascade dans la fenêtre TTL (pas de spam Mongo sur les flushs rapprochés)', async () => {
    await service.markMessagesAsRead(PARTICIPANT_ID, CONVERSATION_ID, MESSAGE_ID);
    await flushAsync();
    await service.markMessagesAsRead(PARTICIPANT_ID, CONVERSATION_ID, MESSAGE_ID, {
      messageIds: [MESSAGE_ID],
    });
    await flushAsync();

    expect(mockMarkConversationNotificationsAsRead).toHaveBeenCalledTimes(1);
  });

  it('utilise le NotificationService PARTAGÉ (câblé io) quand il est enregistré', async () => {
    const sharedMarkRead = jest.fn<any>().mockResolvedValue(2);
    setSharedNotificationService({
      markConversationNotificationsAsRead: sharedMarkRead,
    } as any);

    await service.markMessagesAsRead(PARTICIPANT_ID, CONVERSATION_ID, MESSAGE_ID);
    await flushAsync();

    expect(sharedMarkRead).toHaveBeenCalledWith(USER_ID, CONVERSATION_ID);
    expect(mockMarkConversationNotificationsAsRead).not.toHaveBeenCalled();
  });

  it('expose le service partagé via le registre', () => {
    expect(getSharedNotificationService()).toBeUndefined();
    const marker = { markConversationNotificationsAsRead: jest.fn<any>() } as any;
    setSharedNotificationService(marker);
    expect(getSharedNotificationService()).toBe(marker);
  });

  it("le marquage n'échoue pas quand la cascade échoue", async () => {
    mockMarkConversationNotificationsAsRead.mockRejectedValueOnce(new Error('mongo down'));

    await expect(
      service.markMessagesAsRead(PARTICIPANT_ID, CONVERSATION_ID, MESSAGE_ID)
    ).resolves.toBeDefined();
    await flushAsync();
  });

  it('ne déclenche pas la cascade pour un participant anonyme (sans userId)', async () => {
    mockPrisma.participant.findUnique.mockResolvedValue({ userId: null });

    await service.markMessagesAsRead(PARTICIPANT_ID, CONVERSATION_ID, MESSAGE_ID);
    await flushAsync();

    expect(mockMarkConversationNotificationsAsRead).not.toHaveBeenCalled();
  });
});
