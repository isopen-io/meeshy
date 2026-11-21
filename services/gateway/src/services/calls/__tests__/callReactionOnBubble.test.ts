import { describe, it, expect, jest } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { reflectCallReactionOnBubble } from '../callReactionOnBubble';

const CALL = '64b7f0c2a1b2c3d4e5f60718';
const GROUP = '64b7f0c2a1b2c3d4e5f6071a';

const harness = (options: { mode?: string | null; bubble?: boolean; member?: boolean; unchanged?: boolean; fails?: boolean } = {}) => {
  const emitted: Array<{ room: string; event: string; payload: unknown }> = [];
  const prisma = {
    callSession: { findUnique: jest.fn(async () => ({ conversationId: GROUP, conversation: { encryptionMode: options.mode === undefined ? 'server' : options.mode } })) },
    message: { findFirst: jest.fn(async (_query: unknown) => (options.bubble === false ? null : { id: 'm-live' })) },
    participant: { findFirst: jest.fn(async () => (options.member === false ? null : { id: 'p-bob' })) },
  };
  const reactions = {
    addReaction: jest.fn(async (_options: unknown) => {
      if (options.fails) throw new Error('Maximum reactions reached');
      return { reaction: { id: 'r1' }, unchanged: options.unchanged ?? false };
    }),
    createUpdateEvent: jest.fn(async () => ({ messageId: 'm-live', conversationId: GROUP, emoji: '👍', action: 'add' })),
  };
  const io = { to: (room: string) => ({ emit: (event: string, payload: unknown) => void emitted.push({ room, event, payload }) }) };
  const reflect = () =>
    reflectCallReactionOnBubble({ prisma: prisma as never, reactions: reactions as never, io: io as never }, { callId: CALL, userId: 'bob', emoji: '👍' });
  return { prisma, reactions, emitted, reflect };
};

describe('reflectCallReactionOnBubble — la réaction d’appel se pose sur la bulle de l’appel (#19650, D4)', () => {
  it('pose la réaction de l’auteur sur la bulle « en cours » et la diffuse à la conversation, sans notification', async () => {
    const h = harness();
    expect(await h.reflect()).toBe(true);
    expect(h.prisma.message.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { conversationId: GROUP, clientMessageId: `call-summary:${CALL}`, deletedAt: null } }));
    expect(h.reactions.addReaction).toHaveBeenCalledWith({ messageId: 'm-live', participantId: 'p-bob', emoji: '👍', allowCallBubble: true });
    expect(h.emitted).toEqual([{ room: `conversation:${GROUP}`, event: SERVER_EVENTS.REACTION_ADDED, payload: expect.objectContaining({ messageId: 'm-live' }) }]);
  });

  it('idempotente : un emoji déjà posé par l’auteur ne rediffuse rien', async () => {
    const h = harness({ unchanged: true });
    expect(await h.reflect()).toBe(false);
    expect(h.emitted).toEqual([]);
  });

  it('ignorée dans une conversation chiffrée de bout en bout, sans bulle, ou pour un non-membre', async () => {
    for (const options of [{ mode: 'e2ee' }, { bubble: false }, { member: false }]) {
      const h = harness(options);
      expect(await h.reflect()).toBe(false);
      expect(h.reactions.addReaction).not.toHaveBeenCalled();
      expect(h.emitted).toEqual([]);
    }
  });

  it('un refus du service (plafond) ne lève pas', async () => {
    const h = harness({ fails: true });
    await expect(h.reflect()).resolves.toBe(false);
  });
});
