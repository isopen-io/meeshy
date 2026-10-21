/**
 * #10819 — l'éventail `new_message` d'une GRANDE conversation ne doit plus
 * saturer la passerelle.
 *
 * Mesuré en production le 2026-10-16 : un message dans Meeshy Global (375
 * membres) lançait 370 `createMessageNotification` À LA FOIS, chacun d'une
 * quinzaine de lectures Prisma plus le badge non lu (une requête par
 * conversation du destinataire, ~1 200 au total). Pendant 10 à 14 s, la file
 * Prisma et la boucle d'événements (retard max mesuré : 20 s) faisaient
 * attendre TOUTES les routes — `/receipts`, `mark-as-received`,
 * `messages?after=`, jusqu'aux préflights OPTIONS.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import {
  MESSAGE_FANOUT_CONCURRENCY,
  notifyMessageRecipients,
} from '../../../../services/messaging/messageNotificationFanOut';

const CONV_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439051';
const SENDER_PART_ID = '507f1f77bcf86cd799439031';
const SENDER_USER_ID = '507f1f77bcf86cd799439041';

const memberIds = (count: number) =>
  Array.from({ length: count }, (_, index) => `member-${String(index).padStart(4, '0')}`);

function makePrisma(members: readonly string[]) {
  return {
    participant: {
      findUnique: jest.fn<any>().mockResolvedValue({ userId: SENDER_USER_ID, displayName: 'Alice', avatar: null }),
    },
    user: { findUnique: jest.fn<any>().mockResolvedValue({ username: 'alice', displayName: 'Alice', avatar: null }) },
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({
        title: 'Meeshy Global',
        type: 'global',
        participants: [SENDER_USER_ID, ...members].map((userId) => ({ userId })),
      }),
    },
    message: { findUnique: jest.fn<any>().mockResolvedValue({ deletedAt: null }) },
    notification: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    messageAttachment: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
  };
}

const message = {
  id: MSG_ID,
  messageType: 'text',
  replyToId: null,
  isEncrypted: false,
  encryptionMode: null,
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  expiresAt: null,
  createdAt: new Date('2026-10-16T07:13:10Z'),
  encryptedContent: null,
};

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

function trackingService(outcome: (recipientUserId: string) => Promise<unknown>) {
  const state = { inFlight: 0, peak: 0, recipients: [] as string[] };
  const createMessageNotification = jest.fn<any>(async ({ recipientUserId }: { recipientUserId: string }) => {
    state.inFlight += 1;
    state.peak = Math.max(state.peak, state.inFlight);
    state.recipients.push(recipientUserId);
    try {
      await tick();
      return await outcome(recipientUserId);
    } finally {
      state.inFlight -= 1;
    }
  });
  return {
    state,
    service: {
      createReplyNotification: jest.fn<any>().mockResolvedValue(null),
      createMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(0),
      createMessageNotification,
    },
  };
}

describe('notifyMessageRecipients — un éventail BORNÉ (#10819)', () => {
  it('la borne laisse respirer la passerelle sans ralentir un petit groupe', () => {
    expect(MESSAGE_FANOUT_CONCURRENCY).toBeGreaterThanOrEqual(4);
    expect(MESSAGE_FANOUT_CONCURRENCY).toBeLessThanOrEqual(32);
  });

  it('370 destinataires : jamais plus de MESSAGE_FANOUT_CONCURRENCY créations en vol, et chacun notifié une fois', async () => {
    const members = memberIds(370);
    const { state, service } = trackingService(async (id) => ({ id }));
    const summaries: Array<{ regular: number }> = [];

    await notifyMessageRecipients({
      prisma: makePrisma(members) as any,
      notificationService: service,
      message,
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'bonjour à tous',
      onFanOut: (summary) => summaries.push(summary),
    });

    expect(state.peak).toBe(MESSAGE_FANOUT_CONCURRENCY);
    expect([...state.recipients].sort()).toEqual(members);
    expect(summaries).toEqual([{ mentions: 0, regular: 370, reply: false }]);
  });

  it('un destinataire qui échoue ne retient ni ses voisins ni le compte rendu', async () => {
    const members = memberIds(40);
    const { state, service } = trackingService(async (id) => {
      if (id === 'member-0003') throw new Error('push en panne');
      return { id };
    });
    const errors: unknown[] = [];
    const summaries: Array<{ regular: number }> = [];

    await notifyMessageRecipients({
      prisma: makePrisma(members) as any,
      notificationService: service,
      message,
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'bonjour',
      onError: (error) => errors.push(error),
      onFanOut: (summary) => summaries.push(summary),
    });

    expect(state.recipients).toHaveLength(40);
    expect(summaries).toEqual([{ mentions: 0, regular: 39, reply: false }]);
    expect(errors).toHaveLength(1);
    expect(String((errors[0] as Error).message)).toContain('lost 1/40');
  });

  it('un groupe plus petit que la borne part d’un seul coup', async () => {
    const members = memberIds(3);
    const { state, service } = trackingService(async (id) => ({ id }));

    await notifyMessageRecipients({
      prisma: makePrisma(members) as any,
      notificationService: service,
      message,
      senderParticipantId: SENDER_PART_ID,
      conversationId: CONV_ID,
      processedContent: 'salut',
    });

    expect(state.peak).toBe(3);
  });
});
