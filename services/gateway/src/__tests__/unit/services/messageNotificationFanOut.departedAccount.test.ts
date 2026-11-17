/**
 * #18910 (serveur-transport-5) — un compte SUPPRIMÉ ou DÉSACTIVÉ qui reste membre d'un groupe (la
 * purge ne retire pas ses participations) n'est pas un destinataire : ni bannière, ni mention,
 * ni réponse, ni ligne `Notification` réécrite après sa suppression. Les autres membres sont
 * notifiés comme avant. La garde ne coûte AUCUNE lecture de plus : l'état du compte voyage avec
 * les participants que l'éventail lit déjà.
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

type Member = { userId: string; user?: { isActive: boolean; deletedAt: Date | null } | null };

function makePrisma(participants: ReadonlyArray<Member>, replyAuthor?: string) {
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

const ALIVE = { isActive: true, deletedAt: null };
const DEACTIVATED = { isActive: false, deletedAt: null };
const DELETED = { isActive: false, deletedAt: new Date('2026-11-10T00:00:00Z') };

const recipientsOf = (service: ReturnType<typeof makeService>) =>
  service.createMessageNotification.mock.calls.map((call) => (call[0] as { recipientUserId: string }).recipientUserId);

describe('notifyMessageRecipients — un compte supprimé ou désactivé ne reçoit plus rien', () => {
  it.each([
    ['désactivé par un admin', DEACTIVATED],
    ['supprimé (deletedAt posé)', DELETED],
    ['dont la ligne User a disparu', null],
  ])('un membre actif %s n\'est pas notifié ; l\'autre membre, si', async (_label, user) => {
    const service = makeService();
    await notifyMessageRecipients({
      prisma: makePrisma([{ userId: SENDER_USER_ID, user: ALIVE }, { userId: DESTINATAIRE, user }, { userId: MEMBRE, user: ALIVE }]) as any,
      notificationService: service,
      message: message(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'salut',
    });
    expect(recipientsOf(service)).toEqual([MEMBRE]);
  });

  it('une mention ne perce pas : le compte supprimé reste hors du lot de mentions', async () => {
    const service = makeService();
    await notifyMessageRecipients({
      prisma: makePrisma([{ userId: SENDER_USER_ID, user: ALIVE }, { userId: DESTINATAIRE, user: DELETED }]) as any,
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

  it('une réponse au message d\'un compte supprimé ne lui crée rien', async () => {
    const service = makeService();
    await notifyMessageRecipients({
      prisma: makePrisma([{ userId: SENDER_USER_ID, user: ALIVE }, { userId: DESTINATAIRE, user: DELETED }], DESTINATAIRE) as any,
      notificationService: service,
      message: message({ replyToId: '507f1f77bcf86cd799439299' }),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'en réponse',
    });
    expect(service.createReplyNotification).not.toHaveBeenCalled();
  });

  it('l\'état du compte est demandé avec les participants déjà lus : aucune lecture de plus', async () => {
    const prisma = makePrisma([{ userId: SENDER_USER_ID, user: ALIVE }, { userId: MEMBRE, user: ALIVE }]);
    await notifyMessageRecipients({
      prisma: prisma as any,
      notificationService: makeService(),
      message: message(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'salut',
    });
    expect(prisma.conversation.findUnique.mock.calls[0][0].select.participants.select.user).toEqual({ select: { isActive: true, deletedAt: true } });
  });

  it('rétrocompatibilité : des membres vivants sont notifiés comme avant', async () => {
    const service = makeService();
    await notifyMessageRecipients({
      prisma: makePrisma([{ userId: SENDER_USER_ID, user: ALIVE }, { userId: MEMBRE, user: ALIVE }]) as any,
      notificationService: service,
      message: message(),
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'salut',
    });
    expect(recipientsOf(service)).toEqual([MEMBRE]);
  });
});
