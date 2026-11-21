/**
 * #19650 (D4) — la seule réaction admise sur un message système : celle d'un
 * appel, posée sur sa bulle « Appel … en cours » par `callReactionOnBubble.ts`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ReactionService } from '../../../services/ReactionService';

jest.mock('../../../utils/logger', () => ({ logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const MESSAGE = '507f1f77bcf86cd799439022';
const CONVERSATION = '507f1f77bcf86cd799439033';
const PARTICIPANT = '507f1f77bcf86cd799439011';

const service = (metadata: Record<string, unknown>) => {
  const prisma = {
    message: {
      findUnique: jest.fn(async () => ({
        id: MESSAGE,
        conversationId: CONVERSATION,
        messageType: 'system',
        metadata,
        conversation: { id: CONVERSATION, isActive: true, closedAt: null, encryptionMode: null, participants: [{ id: PARTICIPANT, isActive: true }] },
      })),
      update: jest.fn(async () => ({})),
    },
    reaction: {
      findFirst: jest.fn(async () => null),
      upsert: jest.fn(async () => ({ id: 'r1', messageId: MESSAGE, participantId: PARTICIPANT, emoji: '👍', createdAt: new Date(), updatedAt: new Date() })),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 1),
      groupBy: jest.fn(async () => [{ emoji: '👍', _count: { emoji: 1 } }]),
    },
    conversation: { update: jest.fn(async () => ({})), updateMany: jest.fn(async () => ({ count: 1 })) },
    participant: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(),
  };
  return new ReactionService(prisma as unknown as PrismaClient);
};

const add = (reactions: ReactionService, allowCallBubble?: boolean) =>
  reactions.addReaction({ messageId: MESSAGE, participantId: PARTICIPANT, emoji: '👍', ...(allowCallBubble === undefined ? {} : { allowCallBubble }) });

describe('ReactionService — la réaction d’un appel sur sa bulle « en cours » (#19650)', () => {
  it('est acceptée par le chemin de l’appel', async () => {
    await expect(add(service({ kind: 'call-live', callId: 'k1' }), true)).resolves.toMatchObject({ unchanged: false });
  });

  it('reste refusée sur tout autre message système', async () => {
    await expect(add(service({ kind: 'join-notice' }), true)).rejects.toThrow('Cannot react to a system message');
  });

  it('reste refusée sur la bulle hors du chemin de l’appel', async () => {
    await expect(add(service({ kind: 'call-live', callId: 'k1' }))).rejects.toThrow('Cannot react to a system message');
  });
});
