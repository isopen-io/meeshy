import { describe, it, expect, jest } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { emitConversationActivityUpdate } from '../emitConversationActivityUpdate';
import { declaredConversationUpdatedFields } from './conversation-updated-declared-fields';

type Emitted = { room: string; event: string; payload: Record<string, unknown> };

const makeIo = (sink: Emitted[]) => ({
  to: (room: string) => ({
    emit: (event: string, payload: Record<string, unknown>) => {
      sink.push({ room, event, payload });
    },
  }),
});

const reactionRow = (message: Record<string, unknown> = {}) => ({
  id: 'r1',
  emoji: '❤️',
  createdAt: new Date('2026-09-23T11:00:00Z'),
  participantId: 'p-alice',
  participant: { id: 'p-alice', userId: 'u-alice', displayName: 'Alice', user: null },
  message: {
    id: 'm1',
    senderId: 'p-bob',
    createdAt: new Date('2026-09-23T10:00:00Z'),
    deletedAt: null,
    content: 'Le code est 4521',
    originalLanguage: 'fr',
    translations: { en: { text: 'The code is 4521' } },
    sender: { userId: 'u-bob' },
    ...message,
  },
});

const participants = [
  { id: 'p-bob', userId: 'u-bob', joinedAt: new Date('2026-01-01'), user: { systemLanguage: 'fr', role: 'USER' } },
  { id: 'p-carol', userId: 'u-carol', joinedAt: new Date('2026-01-01'), user: { systemLanguage: 'es', regionalLanguage: 'en', role: 'USER' } },
];

const LAST_MESSAGE_AT = new Date('2026-09-23T10:30:00Z');
const REACTION_AT = new Date('2026-09-23T11:00:00Z');

type PrismaOverrides = {
  reaction?: unknown;
  call?: unknown;
  lastReactionId?: string | null;
  activeCallId?: string | null;
  lastReactionTargetKey?: string | null;
  reactedMessageSender?: { senderId: string; sender: { userId: string | null } | null } | null;
};

const makePrisma = (overrides: PrismaOverrides = {}) => ({
  conversation: {
    findUnique: jest.fn(async () => {
      const lastReactionId = 'lastReactionId' in overrides ? overrides.lastReactionId : 'r1';
      return {
        lastReactionId,
        activeCallId: 'activeCallId' in overrides ? overrides.activeCallId : null,
        lastMessageAt: LAST_MESSAGE_AT,
        lastReactionAt: lastReactionId ? REACTION_AT : null,
        lastReactionTargetKey: 'lastReactionTargetKey' in overrides
          ? overrides.lastReactionTargetKey
          : lastReactionId ? 'u-bob' : null,
      };
    }),
  },
  message: {
    findUnique: jest.fn(async () =>
      'reactedMessageSender' in overrides ? overrides.reactedMessageSender : { senderId: 'p-bob', sender: { userId: 'u-bob' } },
    ),
  },
  reaction: { findUnique: jest.fn(async () => ('reaction' in overrides ? overrides.reaction : reactionRow())) },
  callSession: { findUnique: jest.fn(async () => overrides.call ?? null) },
  participant: { findMany: jest.fn(async () => participants) },
  conversationShareLink: { findMany: jest.fn(async () => []) },
});

describe('emitConversationActivityUpdate — la dernière réaction (#7545)', () => {
  it('pousse lastReaction à chaque participant, extrait résolu par SON Prisme (rang 2 chez Carol)', async () => {
    const emitted: Emitted[] = [];
    await emitConversationActivityUpdate(makePrisma() as never, makeIo(emitted) as never, {
      conversationId: 'c1',
      updatedByUserId: 'u-alice',
      reaction: true,
    });

    expect(emitted.map((e) => e.room).sort()).toEqual(['user:u-bob', 'user:u-carol']);
    for (const { event, payload } of emitted) {
      expect(event).toBe(SERVER_EVENTS.CONVERSATION_UPDATED);
      expect(payload).not.toHaveProperty('lastMessageId');
      expect(payload).not.toHaveProperty('lastMessageAt');
      expect(payload.lastReaction).toMatchObject({ emoji: '❤️', reactorName: 'Alice', targetSenderUserId: 'u-bob' });
    }
    const carol = emitted.find((e) => e.room === 'user:u-carol')!.payload.lastReaction as Record<string, unknown>;
    expect(carol.excerptTranslations).toEqual({ en: 'The code is 4521' });
  });

  it('un message réagi à vue unique ne transporte pas son extrait', async () => {
    const emitted: Emitted[] = [];
    await emitConversationActivityUpdate(makePrisma({ reaction: reactionRow({ isViewOnce: true }) }) as never, makeIo(emitted) as never, {
      conversationId: 'c1',
      updatedByUserId: 'u-alice',
      reaction: true,
    });
    expect(JSON.stringify(emitted)).not.toContain('4521');
    expect((emitted[0].payload.lastReaction as Record<string, unknown>).excerptProtection).toBe('view-once');
  });

  it('plus de dernière réaction (retirée) : lastReaction null, qui efface chez le client', async () => {
    const emitted: Emitted[] = [];
    await emitConversationActivityUpdate(makePrisma({ lastReactionId: null }) as never, makeIo(emitted) as never, {
      conversationId: 'c1',
      updatedByUserId: 'u-alice',
      reaction: true,
    });
    expect(emitted).toHaveLength(2);
    for (const { payload } of emitted) expect(payload.lastReaction).toBeNull();
  });

  it('ne pose que des champs que le contrat déclare', async () => {
    const emitted: Emitted[] = [];
    await emitConversationActivityUpdate(makePrisma({ activeCallId: 'k1', call: { id: 'k1', status: 'active', startedAt: new Date(), metadata: { type: 'audio' }, _count: { participants: 2 } } }) as never, makeIo(emitted) as never, {
      conversationId: 'c1',
      updatedByUserId: 'u-alice',
      reaction: true,
      call: true,
    });
    const declared = declaredConversationUpdatedFields();
    for (const { payload } of emitted) {
      expect(Object.keys(payload).filter((k) => !declared.has(k))).toEqual([]);
    }
  });
});

describe('emitConversationActivityUpdate — le rang servi à l’auteur réagi (#7592)', () => {
  it("l'auteur du message réagi reçoit son rang (sa ligne remonte), les tiers n'en reçoivent aucun", async () => {
    const emitted: Emitted[] = [];
    await emitConversationActivityUpdate(makePrisma() as never, makeIo(emitted) as never, {
      conversationId: 'c1',
      updatedByUserId: 'u-alice',
      reaction: true,
      reactedMessageId: 'm1',
    });

    const bob = emitted.find((e) => e.room === 'user:u-bob')!.payload;
    const carol = emitted.find((e) => e.room === 'user:u-carol')!.payload;
    expect(bob.listRankAt).toBe(REACTION_AT.toISOString());
    expect(carol).not.toHaveProperty('listRankAt');
  });

  it("au retrait de la dernière réaction, l'auteur réagi reçoit le rang de son dernier message (sa ligne redescend)", async () => {
    const emitted: Emitted[] = [];
    await emitConversationActivityUpdate(makePrisma({ lastReactionId: null }) as never, makeIo(emitted) as never, {
      conversationId: 'c1',
      updatedByUserId: 'u-alice',
      reaction: true,
      reactedMessageId: 'm1',
    });

    const bob = emitted.find((e) => e.room === 'user:u-bob')!.payload;
    const carol = emitted.find((e) => e.room === 'user:u-carol')!.payload;
    expect(bob.listRankAt).toBe(LAST_MESSAGE_AT.toISOString());
    expect(carol).not.toHaveProperty('listRankAt');
  });

  it("un invité auteur est reconnu par son Participant.id", async () => {
    const guestParticipants = [
      { id: 'p-guest', userId: null, joinedAt: new Date('2026-01-01'), user: null },
      participants[1],
    ];
    const prisma = makePrisma({ lastReactionTargetKey: 'p-guest', reactedMessageSender: { senderId: 'p-guest', sender: null } });
    prisma.participant.findMany.mockResolvedValueOnce(guestParticipants as never);
    const emitted: Emitted[] = [];
    await emitConversationActivityUpdate(prisma as never, makeIo(emitted) as never, {
      conversationId: 'c1',
      updatedByUserId: 'u-alice',
      reaction: true,
      reactedMessageId: 'm1',
    });

    expect(emitted.find((e) => e.room === 'user:p-guest')!.payload.listRankAt).toBe(REACTION_AT.toISOString());
    expect(emitted.find((e) => e.room === 'user:u-carol')!.payload).not.toHaveProperty('listRankAt');
  });

  it("une mise à jour d'appel ne porte aucun rang", async () => {
    const emitted: Emitted[] = [];
    await emitConversationActivityUpdate(makePrisma() as never, makeIo(emitted) as never, {
      conversationId: 'c1',
      updatedByUserId: 'u-bob',
      call: true,
    });
    for (const { payload } of emitted) expect(payload).not.toHaveProperty('listRankAt');
  });
});

describe('emitConversationActivityUpdate — l’appel en cours (#7545)', () => {
  it('pousse activeCall quand un appel est vivant', async () => {
    const emitted: Emitted[] = [];
    const call = { id: 'k1', status: 'ringing', startedAt: new Date('2026-09-23T11:59:00Z'), metadata: { type: 'video' }, _count: { participants: 1 } };
    await emitConversationActivityUpdate(makePrisma({ activeCallId: 'k1', call }) as never, makeIo(emitted) as never, {
      conversationId: 'c1',
      updatedByUserId: 'u-bob',
      call: true,
    });
    expect(emitted).toHaveLength(2);
    for (const { payload } of emitted) {
      expect(payload.activeCall).toEqual({ id: 'k1', kind: 'video', participantCount: 1, startedAt: '2026-09-23T11:59:00.000Z' });
      expect(payload).not.toHaveProperty('lastReaction');
    }
  });

  it('pousse activeCall null quand l’appel est terminé', async () => {
    const emitted: Emitted[] = [];
    await emitConversationActivityUpdate(makePrisma({ activeCallId: null }) as never, makeIo(emitted) as never, {
      conversationId: 'c1',
      updatedByUserId: 'u-bob',
      call: true,
    });
    for (const { payload } of emitted) expect(payload.activeCall).toBeNull();
  });

  it('ne lève jamais : une panne se remonte par onError', async () => {
    const prisma = makePrisma();
    prisma.conversation.findUnique.mockRejectedValueOnce(new Error('down') as never);
    const onError = jest.fn();
    await expect(
      emitConversationActivityUpdate(prisma as never, makeIo([]) as never, { conversationId: 'c1', updatedByUserId: 'u', call: true, onError }),
    ).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalled();
  });
});
