import { describe, it, expect, jest } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { broadcastReactionMutation } from '../broadcastReactionMutation';

type Emitted = { room: string; event: string; payload: Record<string, unknown> };

const makeManager = (sink: Emitted[]) => ({
  getIO: () => ({
    to: (room: string) => ({
      emit: (event: string, payload: Record<string, unknown>) => {
        sink.push({ room, event, payload });
      },
    }),
  }),
  enqueueOfflineReactionMutation: jest.fn(async () => {}),
});

const makePrisma = () => ({
  conversation: {
    findUnique: jest.fn(async () => ({
      lastReactionId: 'r1',
      activeCallId: null,
      lastMessageAt: new Date('2026-09-23T10:00:00Z'),
      lastReactionAt: new Date('2026-09-23T11:00:00Z'),
      lastReactionTargetKey: 'u-bob',
    })),
  },
  message: { findUnique: jest.fn(async () => ({ senderId: 'p-bob', sender: { userId: 'u-bob' } })) },
  reaction: {
    findUnique: jest.fn(async () => ({
      id: 'r1',
      emoji: '🔥',
      createdAt: new Date('2026-09-23T11:00:00Z'),
      participantId: 'p-alice',
      participant: { id: 'p-alice', userId: 'u-alice', displayName: 'Alice', user: null },
      message: { id: 'm1', senderId: 'p-bob', createdAt: new Date('2026-09-23T10:00:00Z'), deletedAt: null, content: 'Salut', originalLanguage: 'fr', translations: null, sender: { userId: 'u-bob' } },
    })),
  },
  callSession: { findUnique: jest.fn(async () => null) },
  participant: { findMany: jest.fn(async () => [{ id: 'p-bob', userId: 'u-bob', user: { systemLanguage: 'fr', role: 'USER' } }]) },
  conversationShareLink: { findMany: jest.fn(async () => []) },
});

describe('broadcastReactionMutation — troisième audience : la liste (#7545)', () => {
  it('une réaction REST pousse aussi lastReaction sur la room personnelle de chaque participant', async () => {
    const emitted: Emitted[] = [];
    await broadcastReactionMutation({
      manager: makeManager(emitted) as never,
      conversationId: 'c1',
      actorParticipantId: 'p-alice',
      eventType: 'reaction-added',
      messageId: 'm1',
      emoji: '🔥',
      payload: {} as never,
      prisma: makePrisma() as never,
      updatedByUserId: 'u-alice',
    });
    await new Promise((resolve) => setImmediate(resolve));

    const listUpdate = emitted.find((e) => e.room === 'user:u-bob' && e.event === SERVER_EVENTS.CONVERSATION_UPDATED);
    expect(listUpdate?.payload.lastReaction).toMatchObject({ emoji: '🔥', reactorName: 'Alice', targetSenderUserId: 'u-bob' });
    // #7592 — Bob est l'auteur du message réagi : sa ligne remonte, servie par le serveur.
    expect(listUpdate?.payload.listRankAt).toBe('2026-09-23T11:00:00.000Z');
  });
});
