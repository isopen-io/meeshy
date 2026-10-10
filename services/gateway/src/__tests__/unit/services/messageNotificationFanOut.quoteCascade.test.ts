/**
 * #8630 — une réponse à une flamme-œil déjà consommée par un membre est MORTE
 * pour lui dès sa naissance : aucune bannière ne lui annonce son texte. Les
 * autres membres, pour qui la flamme-œil vit encore, la reçoivent.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { notifyMessageRecipients } from '../../../services/messaging/messageNotificationFanOut';

const CONV_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439051';
const FLAMME_ID = '507f1f77bcf86cd799439052';
const SENDER_PART_ID = '507f1f77bcf86cd799439031';
const SENDER_USER_ID = '507f1f77bcf86cd799439041';
const CONSUMER_USER_ID = '507f1f77bcf86cd799439042';
const CONSUMER_PART_ID = '507f1f77bcf86cd799439032';
const OTHER_USER_ID = '507f1f77bcf86cd799439043';
const FLAMME_AUTHOR_PART_ID = '507f1f77bcf86cd799439033';
const AFTER_READ = MESSAGE_EFFECT_FLAGS.EPHEMERAL | MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ;

function makePrisma() {
  return {
    participant: {
      findUnique: jest.fn<any>(async ({ where }: any) =>
        where.id === SENDER_PART_ID
          ? { userId: SENDER_USER_ID, displayName: 'Alice', avatar: null }
          : { userId: null, displayName: 'Auteur', avatar: null },
      ),
    },
    user: { findUnique: jest.fn<any>().mockResolvedValue({ username: 'alice', displayName: 'Alice', avatar: null }) },
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({
        title: 'Salon',
        type: 'group',
        participants: [{ userId: CONSUMER_USER_ID }, { userId: OTHER_USER_ID }],
      }),
    },
    message: {
      findUnique: jest.fn<any>(async ({ where }: any) =>
        where.id === MSG_ID ? { deletedAt: null } : { senderId: FLAMME_AUTHOR_PART_ID },
      ),
      findMany: jest.fn<any>(async ({ where }: any) =>
        where?.id?.in?.includes(FLAMME_ID)
          ? [{ id: FLAMME_ID, replyToId: null, senderId: FLAMME_AUTHOR_PART_ID, ephemeralDuration: null, effectFlags: AFTER_READ, expiresAt: null }]
          : [],
      ),
    },
    messageStatusEntry: {
      findMany: jest.fn<any>().mockResolvedValue([
        {
          messageId: FLAMME_ID,
          participantId: CONSUMER_PART_ID,
          ephemeralExpiresAt: new Date(Date.now() - 60_000),
          participant: { userId: CONSUMER_USER_ID },
        },
      ]),
    },
    notification: { findMany: jest.fn<any>().mockResolvedValue([]), deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
    messageAttachment: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
  };
}

describe('éventail de notifications — une réponse morte pour un membre ne lui est pas annoncée (#8630)', () => {
  it('pousse la bannière aux vivants seulement, jamais au membre qui a consommé la flamme-œil citée', async () => {
    const notificationService = {
      createReplyNotification: jest.fn<any>().mockResolvedValue(null),
      createMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(0),
      createMessageNotification: jest.fn<any>().mockResolvedValue({ id: 'n' }),
    };

    await notifyMessageRecipients({
      prisma: makePrisma() as any,
      notificationService,
      message: {
        id: MSG_ID,
        messageType: 'text',
        replyToId: FLAMME_ID,
        isEncrypted: false,
        encryptionMode: null,
        isViewOnce: false,
        isBlurred: false,
        effectFlags: 0,
        expiresAt: null,
        createdAt: new Date(),
        encryptedContent: null,
      } as any,
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'je réponds',
      validatedMentionUserIds: [CONSUMER_USER_ID],
    });

    const recipients = notificationService.createMessageNotification.mock.calls.map(
      ([params]: any) => params.recipientUserId,
    );
    expect(recipients).toEqual([OTHER_USER_ID]);
    expect(notificationService.createMentionNotificationsBatch).not.toHaveBeenCalled();
  });
});
