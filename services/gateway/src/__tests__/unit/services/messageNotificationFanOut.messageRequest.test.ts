/**
 * #14107 (MSG-02, MIN-03) — une DEMANDE de message en attente ne sonne pas :
 * ni bannière régulière, ni mention, ni réponse n'atteignent son destinataire.
 * Il la découvre dans sa boîte de demandes.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { notifyMessageRecipients } from '../../../services/messaging/messageNotificationFanOut';

const CONV_ID = '507f1f77bcf86cd799439222';
const MSG_ID = '507f1f77bcf86cd799439251';
const SENDER_PART_ID = '507f1f77bcf86cd799439231';
const SENDER_USER_ID = '507f1f77bcf86cd799439241';
const DESTINATAIRE = '507f1f77bcf86cd799439242';
const MEMBRE = '507f1f77bcf86cd799439243';

function makePrisma(participants: ReadonlyArray<{ userId: string; messageRequestAt?: Date | null }>, replyAuthor?: string) {
  return {
    participant: {
      findUnique: jest.fn<any>(({ where }: any) =>
        Promise.resolve(where.id === SENDER_PART_ID ? { userId: SENDER_USER_ID, displayName: 'Alice', avatar: null } : replyAuthor ? { userId: replyAuthor } : null),
      ),
    },
    user: { findUnique: jest.fn<any>().mockResolvedValue({ username: 'alice', displayName: 'Alice', avatar: null }) },
    conversation: { findUnique: jest.fn<any>().mockResolvedValue({ title: null, type: 'direct', participants }) },
    message: {
      findUnique: jest.fn<any>(({ where }: any) => Promise.resolve(where.id === MSG_ID ? { deletedAt: null } : { senderId: 'cited-part' })),
    },
    notification: { findMany: jest.fn<any>().mockResolvedValue([]), deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
    messageAttachment: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
  };
}

const makeService = () => ({
  createReplyNotification: jest.fn<any>().mockResolvedValue(null),
  createMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(0),
  createMessageNotification: jest.fn<any>().mockResolvedValue(null),
});

const message = (overrides: Record<string, unknown> = {}) => ({
  id: MSG_ID,
  messageType: 'text',
  replyToId: null,
  isEncrypted: false,
  encryptionMode: null,
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  expiresAt: null,
  createdAt: new Date('2026-11-02T10:00:00Z'),
  encryptedContent: null,
  ...overrides,
});

const PENDING = new Date('2026-11-02T09:00:00Z');

describe('notifyMessageRecipients — la boîte de demandes ne sonne pas', () => {
  it('le destinataire d\'une demande en attente ne reçoit aucune bannière ; un autre membre, si', async () => {
    const service = makeService();
    await notifyMessageRecipients({
      prisma: makePrisma([{ userId: SENDER_USER_ID }, { userId: DESTINATAIRE, messageRequestAt: PENDING }, { userId: MEMBRE, messageRequestAt: null }]) as any,
      notificationService: service,
      message: message(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'salut',
    });
    const recipients = service.createMessageNotification.mock.calls.map((call) => (call[0] as { recipientUserId: string }).recipientUserId);
    expect(recipients).toEqual([MEMBRE]);
  });

  it('une mention ne perce pas la boîte de demandes', async () => {
    const service = makeService();
    await notifyMessageRecipients({
      prisma: makePrisma([{ userId: SENDER_USER_ID }, { userId: DESTINATAIRE, messageRequestAt: PENDING }]) as any,
      notificationService: service,
      message: message(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: '@dest coucou',
      validatedMentionUserIds: [DESTINATAIRE],
    });
    expect(service.createMentionNotificationsBatch).not.toHaveBeenCalled();
    expect(service.createMessageNotification).not.toHaveBeenCalled();
  });

  it('une réponse ne perce pas la boîte de demandes', async () => {
    const service = makeService();
    await notifyMessageRecipients({
      prisma: makePrisma([{ userId: SENDER_USER_ID }, { userId: DESTINATAIRE, messageRequestAt: PENDING }], DESTINATAIRE) as any,
      notificationService: service,
      message: message({ replyToId: '507f1f77bcf86cd799439299' }),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'en réponse',
    });
    expect(service.createReplyNotification).not.toHaveBeenCalled();
  });

  it('une fois la demande acceptée, le message sonne comme avant', async () => {
    const service = makeService();
    await notifyMessageRecipients({
      prisma: makePrisma([{ userId: SENDER_USER_ID }, { userId: DESTINATAIRE }]) as any,
      notificationService: service,
      message: message(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'salut',
    });
    expect(service.createMessageNotification).toHaveBeenCalledTimes(1);
  });
});
