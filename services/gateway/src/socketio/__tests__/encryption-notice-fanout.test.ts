/**
 * #11416 — l'avis d'activation du chiffrement voyage par le chemin ORDINAIRE
 * des messages : la route le remet à `broadcastMessage`, qui émet
 * `message:new` dans la room puis `syncConversationListOnNewMessage`. Ce
 * témoin tient le second maillon : chaque membre reçoit, dans SA room
 * personnelle, un `conversation:updated` dont la ligne de liste nomme l'avis
 * par sa clé localisable — ce que le web lit pour fermer le régime
 * (`apps/web/src/lib/api/realtime-encryption-regime.ts`) et ce qu'iOS décode
 * en `LastMessageNature.systemEvent`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { Message } from '@meeshy/shared/types/index';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { syncConversationListOnNewMessage } from '../postMessageSyncFanOut';
import type { QueuedPayloadFor } from '../queuedEventContract';
import type { ServerEmitIO } from '../serverEmit';

type Emitted = { readonly room: string; readonly event: string; readonly payload: Record<string, unknown> };

const CONVERSATION_ID = '507f1f77bcf86cd799439013';

const makeIo = (sink: Emitted[]) =>
  ({
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        sink.push({ room, event, payload: payload as Record<string, unknown> });
      },
    }),
  }) as unknown as ServerEmitIO;

const member = (id: string, userId: string | null) => ({
  id,
  userId,
  joinedAt: new Date('2026-10-01T00:00:00Z'),
  user: userId ? { systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null } : null,
});

const makePrisma = () =>
  ({
    participant: {
      findMany: jest.fn(async () => [member('p-admin', 'u-admin'), member('p-reader', 'u-reader'), member('p-guest', null)]),
    },
  }) as unknown as PrismaClient;

const encryptionNotice = (mode: string) =>
  ({
    id: '507f1f77bcf86cd799439015',
    conversationId: CONVERSATION_ID,
    senderId: 'p-admin',
    content: '🔒 End-to-end encryption enabled. Messages are now fully encrypted.',
    originalLanguage: 'en',
    messageType: 'system',
    messageSource: 'system',
    metadata: { kind: 'encryption-enabled', mode },
    createdAt: new Date('2026-10-24T10:00:00Z'),
  }) as unknown as Message;

async function fanOut(mode: string): Promise<Emitted[]> {
  const sink: Emitted[] = [];
  await syncConversationListOnNewMessage(
    {
      prisma: makePrisma(),
      io: makeIo(sink),
      readStatusService: { getUnreadCountsForParticipants: async () => new Map<string, number>() },
      deliveryQueue: undefined,
      connectedUsers: new Map(),
    },
    {
      normalizedId: CONVERSATION_ID,
      message: encryptionNotice(mode),
      broadcastPayload: {} as QueuedPayloadFor<'new'>,
      resolvedSenderId: 'p-admin',
    },
  );
  return sink.filter((emitted) => emitted.event === SERVER_EVENTS.CONVERSATION_UPDATED);
}

describe("l'avis d'activation du chiffrement atteint la ligne de liste de chaque membre (#11416)", () => {
  it.each(['e2ee', 'server', 'hybrid'])('mode %s : conversation:updated porte lastMessageSystemEvent dans la room de chaque membre', async (mode) => {
    const updates = await fanOut(mode);
    expect(updates.map((update) => update.room).sort()).toEqual(['user:p-guest', 'user:u-admin', 'user:u-reader']);
    updates.forEach((update) => {
      expect(update.payload).toMatchObject({
        conversationId: CONVERSATION_ID,
        lastMessageId: '507f1f77bcf86cd799439015',
        lastMessageType: 'system',
        lastMessageSystemEvent: { key: 'system.encryption-enabled', params: { mode } },
      });
    });
  });
});
