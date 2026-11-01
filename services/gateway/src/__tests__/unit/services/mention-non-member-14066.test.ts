/**
 * #14066 — un non-membre ne peut citer personne (directive porteur 2026-10-31).
 *
 * La portée d'une conversation ouverte (`public`, `global`, `broadcast`) admet
 * tout compte À MENTIONNER ; elle ne dit rien de QUI peut mentionner. Sans
 * appartenance active, la recherche répond 403 avec le message des conversations
 * fermées (ne pas distinguer « absente » de « non membre »), et l'envoi ne valide
 * aucune mention.
 *
 * Le faux Prisma REFUSE ce que le vrai refuse : une appartenance ne se trouve que
 * pour la paire (conversation, utilisateur) ACTIVE qu'il connaît.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
}));

jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => ({ isAvailable: () => false, get: async () => null, set: async () => undefined, keys: async () => [], del: async () => undefined }),
}));

import { MentionSuggestionFinder, ACCESS_DENIED } from '../../../services/mentions/mentionSuggestions';
import { MentionService } from '../../../services/MentionService';
import { resolveMessageMentions } from '../../../services/messaging/messageMentions';

const CONVERSATION = '6a00000000000000000000c1';
const ME = '507f1f77bcf86cd799439099';
const MEMBER = '507f1f77bcf86cd799439001';
const STRANGER = '507f1f77bcf86cd799439002';
const SENDER_PARTICIPANT = '6b00000000000000000000a1';

type Membership = { readonly id: string; readonly userId: string; readonly isActive: boolean };

const person = (id: string, username: string) => ({
  id, username, firstName: null, lastName: null, displayName: username, avatar: null, equippedAvatarRing: null,
});

function fakePrisma(world: { readonly type: string; readonly memberships: readonly Membership[] }) {
  const people = { [MEMBER]: person(MEMBER, 'member'), [STRANGER]: person(STRANGER, 'stranger') };
  const active = world.memberships.filter((m) => m.isActive);
  return {
    conversation: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        where.id === CONVERSATION
          ? { id: CONVERSATION, type: world.type, participants: active.map((m) => ({ userId: m.userId })) }
          : null
      ),
    },
    participant: {
      findFirst: jest.fn(async ({ where }: { where: { conversationId: string; userId: string; isActive?: boolean } }) => {
        const found = world.memberships.find(
          (m) => where.conversationId === CONVERSATION && m.userId === where.userId && (where.isActive !== true || m.isActive)
        );
        return found ? { id: found.id } : null;
      }),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const found = world.memberships.find((m) => m.id === where.id);
        return found ? { userId: found.userId, isActive: found.isActive, conversationId: CONVERSATION } : null;
      }),
      findMany: jest.fn(async () => active.map((m) => ({ userId: m.userId, user: people[m.userId as keyof typeof people] ?? person(m.userId, 'me') }))),
    },
    conversationMessageStats: { findUnique: jest.fn(async () => null) },
    userRelation: { findMany: jest.fn(async () => []) },
    friendRequest: { findMany: jest.fn(async () => []) },
    userContact: { findMany: jest.fn(async () => []) },
    communityMember: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null) },
    user: {
      findMany: jest.fn(async ({ where }: { where: { id?: { in?: string[] } } }) =>
        (where.id?.in ?? [STRANGER]).flatMap((u) => (people[u as keyof typeof people] ? [people[u as keyof typeof people]] : []))
      ),
      findUnique: jest.fn(async () => ({ blockedUserIds: [] })),
    },
    userPreferences: { findMany: jest.fn(async () => []) },
    userPreference: { findMany: jest.fn(async () => []) },
    message: { update: jest.fn(async () => undefined) },
    mention: { findMany: jest.fn(async () => []), createMany: jest.fn(async () => ({ count: 0 })) },
  } as never;
}

const cache = { get: async () => null, set: async () => undefined, keys: async () => [], del: async () => undefined } as never;

describe('#14066 — la recherche refuse un non-membre, quelle que soit la portée', () => {
  it.each(['public', 'global', 'broadcast', 'group', 'direct'])('%s : 403, même message qu’une conversation absente', async (type) => {
    const finder = new MentionSuggestionFinder(
      fakePrisma({ type, memberships: [{ id: 'p-member', userId: MEMBER, isActive: true }] }),
      cache
    );
    await expect(finder.forConversation(CONVERSATION, ME, 'me')).rejects.toThrow(ACCESS_DENIED);
  });

  it('une appartenance QUITTÉE (inactive) ne suffit pas', async () => {
    const finder = new MentionSuggestionFinder(
      fakePrisma({ type: 'public', memberships: [{ id: 'p-me', userId: ME, isActive: false }] }),
      cache
    );
    await expect(finder.forConversation(CONVERSATION, ME, '')).rejects.toThrow(ACCESS_DENIED);
  });

  it('un membre actif d’une conversation publique reçoit toujours ses suggestions', async () => {
    const finder = new MentionSuggestionFinder(
      fakePrisma({
        type: 'public',
        memberships: [{ id: 'p-me', userId: ME, isActive: true }, { id: 'p-member', userId: MEMBER, isActive: true }],
      }),
      cache
    );
    const list = await finder.forConversation(CONVERSATION, ME, '');
    expect(list.map((s) => s.id)).toContain(MEMBER);
  });
});

describe('#14066 — à l’envoi, un expéditeur non membre ne valide aucune mention', () => {
  it('validateMentionPermissions : un expéditeur inscrit absent des membres actifs ne cite personne', async () => {
    const service = new MentionService(
      fakePrisma({ type: 'public', memberships: [{ id: 'p-member', userId: MEMBER, isActive: true }] })
    );
    const result = await service.validateMentionPermissions(CONVERSATION, [MEMBER, STRANGER], ME);
    expect(result.validUserIds).toEqual([]);
    expect(result.isValid).toBe(false);
  });

  it('validateMentionPermissions : un membre actif d’une conversation publique cite tout compte', async () => {
    const service = new MentionService(
      fakePrisma({
        type: 'public',
        memberships: [{ id: 'p-me', userId: ME, isActive: true }, { id: 'p-member', userId: MEMBER, isActive: true }],
      })
    );
    const result = await service.validateMentionPermissions(CONVERSATION, [MEMBER, STRANGER], ME);
    expect(result.validUserIds).toEqual([MEMBER, STRANGER]);
  });

  it('resolveMessageMentions : le participant expéditeur QUITTÉ ne valide rien, même un membre', async () => {
    const prisma = fakePrisma({
      type: 'public',
      memberships: [
        { id: SENDER_PARTICIPANT, userId: ME, isActive: false },
        { id: 'p-member', userId: MEMBER, isActive: true },
      ],
    });
    const validateMentionPermissions = jest.fn(async (_conversationId: string, _ids: string[], _sender: string | null) => ({
      validUserIds: [MEMBER],
    }));
    const createMentions = jest.fn(async (_messageId: string, _ids: string[]) => undefined);
    const result = await resolveMessageMentions({
      prisma,
      mentionService: {
        extractMentionsWithParticipants: () => [],
        resolveUsernames: async () => new Map(),
        validateMentionPermissions,
        createMentions,
      },
      message: { id: 'm1', conversationId: CONVERSATION, senderId: SENDER_PARTICIPANT },
      content: 'salut',
      explicitMentionedUserIds: [MEMBER],
    });
    expect(result.validatedUserIds).toEqual([]);
    expect(validateMentionPermissions).not.toHaveBeenCalled();
    expect(createMentions).not.toHaveBeenCalledWith('m1', [MEMBER]);
  });
});
