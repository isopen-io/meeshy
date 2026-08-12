/**
 * Unit tests for socketio/utils/participant-resolver.
 * Covers resolveParticipant and resolveParticipantFromMessage.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

import {
  resolveParticipant,
  resolveParticipantFromMessage,
} from '../../../socketio/utils/participant-resolver';
import type { SocketUser } from '../../../socketio/utils/socket-helpers';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRegisteredUser(overrides: Partial<SocketUser> = {}): SocketUser {
  return {
    id: 'u-1',
    socketId: 'sock-1',
    isAnonymous: false,
    language: 'en',
    resolvedLanguages: ['en'],
    userId: 'u-1',
    displayName: 'Bob',
    ...overrides,
  };
}

function makeAnonymousUser(overrides: Partial<SocketUser> = {}): SocketUser {
  return {
    id: 'anon-token-abc',
    socketId: 'sock-2',
    isAnonymous: true,
    language: 'fr',
    resolvedLanguages: [],
    participantId: 'part-anon-1',
    displayName: 'Anonymous Alice',
    ...overrides,
  };
}

function makeConnectedUsers(...users: SocketUser[]): Map<string, SocketUser> {
  const map = new Map<string, SocketUser>();
  for (const u of users) map.set(u.id, u);
  return map;
}

function makePrisma(opts: {
  participant?: { id: string; displayName: string; nickname: string | null } | null;
  message?: { conversationId: string } | null;
} = {}) {
  return {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(opts.participant ?? null),
    },
    message: {
      findUnique: jest.fn<any>().mockResolvedValue(opts.message ?? null),
    },
  };
}

// ─── resolveParticipant ───────────────────────────────────────────────────────

describe('resolveParticipant', () => {
  it('returns null when the userIdOrToken is not in connectedUsers', async () => {
    const result = await resolveParticipant({
      prisma: makePrisma() as any,
      userIdOrToken: 'unknown-token',
      conversationId: 'conv-1',
      connectedUsers: new Map(),
    });

    expect(result).toBeNull();
  });

  // Le chemin anonyme LIT la base, et ce n'est pas une dépense évitable : sans
  // cette vérification, une socket anonyme pouvait passer un `conversationId`
  // arbitraire à n'importe quel handler gardé par l'appartenance (typing,
  // réactions…) et diffuser dans un salon dont elle ne fait pas partie. La
  // lecture re-teste aussi `isActive` : un invité banni depuis sa connexion est
  // rejeté. Ce bloc verrouillait la version qui faisait confiance à l'identité
  // en mémoire.
  it('vérifie en base que l\'invité appartient à la conversation DEMANDÉE', async () => {
    const anon = makeAnonymousUser();
    const prisma = makePrisma({ participant: { id: 'part-anon-1', displayName: 'Anon', nickname: null } });

    const result = await resolveParticipant({
      prisma: prisma as any,
      userIdOrToken: anon.id,
      conversationId: 'conv-1',
      connectedUsers: makeConnectedUsers(anon),
    });

    expect(result).not.toBeNull();
    expect(result!.isAnonymous).toBe(true);
    expect(result!.participantId).toBe('part-anon-1');
    expect(result!.userId).toBe('anon-token-abc');
    expect(prisma.participant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'part-anon-1', conversationId: 'conv-1', isActive: true },
      })
    );
  });

  it('rejette l\'invité qui n\'a pas de ligne active dans la conversation demandée', async () => {
    const anon = makeAnonymousUser();

    const result = await resolveParticipant({
      prisma: makePrisma({ participant: null }) as any,
      userIdOrToken: anon.id,
      conversationId: 'conv-etrangere',
      connectedUsers: makeConnectedUsers(anon),
    });

    expect(result).toBeNull();
  });

  it('cherche sous user.id quand le participantId manque en mémoire', async () => {
    const anon = makeAnonymousUser({ participantId: undefined });
    const prisma = makePrisma({ participant: { id: anon.id, displayName: 'Anon', nickname: null } });

    const result = await resolveParticipant({
      prisma: prisma as any,
      userIdOrToken: anon.id,
      conversationId: 'conv-1',
      connectedUsers: makeConnectedUsers(anon),
    });

    expect(result!.participantId).toBe(anon.id);
    expect(prisma.participant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: anon.id }) })
    );
  });

  it('uses "Anonymous User" display name when anonymous user has no displayName', async () => {
    const anon = makeAnonymousUser({ displayName: undefined });
    const prisma = makePrisma({ participant: { id: 'part-anon-1', displayName: null, nickname: null } });

    const result = await resolveParticipant({
      prisma: prisma as any,
      userIdOrToken: anon.id,
      conversationId: 'conv-1',
      connectedUsers: makeConnectedUsers(anon),
    });

    expect(result!.displayName).toBe('Anonymous User');
  });

  it('returns null when registered user has no active participant in the conversation', async () => {
    const user = makeRegisteredUser();
    const prisma = makePrisma({ participant: null });

    const result = await resolveParticipant({
      prisma: prisma as any,
      userIdOrToken: user.id,
      conversationId: 'conv-99',
      connectedUsers: makeConnectedUsers(user),
    });

    expect(result).toBeNull();
  });

  it('returns registered resolution with participantId from DB', async () => {
    const user = makeRegisteredUser();
    const prisma = makePrisma({
      participant: { id: 'part-db-1', displayName: 'Bob Smith', nickname: null },
    });

    const result = await resolveParticipant({
      prisma: prisma as any,
      userIdOrToken: user.id,
      conversationId: 'conv-5',
      connectedUsers: makeConnectedUsers(user),
    });

    expect(result).not.toBeNull();
    expect(result!.isAnonymous).toBe(false);
    expect(result!.participantId).toBe('part-db-1');
    expect(result!.userId).toBe('u-1');
  });

  it('prefers nickname over displayName for registered participant', async () => {
    const user = makeRegisteredUser();
    const prisma = makePrisma({
      participant: { id: 'part-1', displayName: 'Bob Smith', nickname: 'Bobby' },
    });

    const result = await resolveParticipant({
      prisma: prisma as any,
      userIdOrToken: user.id,
      conversationId: 'conv-5',
      connectedUsers: makeConnectedUsers(user),
    });

    expect(result!.displayName).toBe('Bobby');
  });

  it('falls back to socket displayName when participant has no nickname/displayName', async () => {
    const user = makeRegisteredUser({ displayName: 'Socket Bob' });
    const prisma = makePrisma({
      participant: { id: 'part-1', displayName: '', nickname: null },
    });

    const result = await resolveParticipant({
      prisma: prisma as any,
      userIdOrToken: user.id,
      conversationId: 'conv-5',
      connectedUsers: makeConnectedUsers(user),
    });

    expect(result!.displayName).toBe('Socket Bob');
  });

  it('falls back to "Unknown User" when no display name is available', async () => {
    const user = makeRegisteredUser({ displayName: undefined });
    const prisma = makePrisma({
      participant: { id: 'part-1', displayName: '', nickname: null },
    });

    const result = await resolveParticipant({
      prisma: prisma as any,
      userIdOrToken: user.id,
      conversationId: 'conv-5',
      connectedUsers: makeConnectedUsers(user),
    });

    expect(result!.displayName).toBe('Unknown User');
  });

  it('queries DB with correct userId and conversationId', async () => {
    const user = makeRegisteredUser({ id: 'u-42', userId: 'u-42' });
    const prisma = makePrisma({ participant: { id: 'p-1', displayName: 'Name', nickname: null } });

    await resolveParticipant({
      prisma: prisma as any,
      userIdOrToken: user.id,
      conversationId: 'conv-xyz',
      connectedUsers: makeConnectedUsers(user),
    });

    expect(prisma.participant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'u-42', conversationId: 'conv-xyz', isActive: true }),
      }),
    );
  });
});

// ─── resolveParticipantFromMessage ───────────────────────────────────────────

describe('resolveParticipantFromMessage', () => {
  it('returns null when the message is not found', async () => {
    const prisma = makePrisma({ message: null });

    const result = await resolveParticipantFromMessage({
      prisma: prisma as any,
      userIdOrToken: 'u-1',
      messageId: 'msg-missing',
      connectedUsers: new Map(),
    });

    expect(result).toBeNull();
    expect(prisma.message.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'msg-missing' } }),
    );
  });

  it('resolves the participant using the conversationId from the message', async () => {
    const user = makeRegisteredUser();
    const prisma = makePrisma({
      message: { conversationId: 'conv-from-msg' },
      participant: { id: 'part-via-msg', displayName: 'Alice', nickname: null },
    });

    const result = await resolveParticipantFromMessage({
      prisma: prisma as any,
      userIdOrToken: user.id,
      messageId: 'msg-1',
      connectedUsers: makeConnectedUsers(user),
    });

    expect(result).not.toBeNull();
    expect(result!.participantId).toBe('part-via-msg');
    expect(prisma.participant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ conversationId: 'conv-from-msg' }),
      }),
    );
  });

  it('returns null when the user is not in connectedUsers even if message is found', async () => {
    const prisma = makePrisma({ message: { conversationId: 'conv-1' }, participant: null });

    const result = await resolveParticipantFromMessage({
      prisma: prisma as any,
      userIdOrToken: 'not-connected',
      messageId: 'msg-2',
      connectedUsers: new Map(),
    });

    expect(result).toBeNull();
  });
});
