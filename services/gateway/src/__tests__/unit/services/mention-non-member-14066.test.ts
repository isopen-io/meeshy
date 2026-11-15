/**
 * #14066 — un non-membre ne peut citer personne (directive porteur 2026-10-31).
 *
 * La portée d'une conversation ouverte (`public`, `global`, `broadcast`) admet
 * tout compte À MENTIONNER ; elle ne dit rien de QUI peut mentionner. Sans
 * participation VIVANTE (active ET non bannie), la recherche répond 403 avec le
 * message des conversations fermées (ne pas distinguer « absente » de « non
 * membre »), et l'envoi ne valide aucune mention.
 *
 * Le faux Prisma REFUSE ce que le vrai refuse : il juge le `where` comme MongoDB
 * le jugerait (voir `keeps`).
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
const BANNED_AT = new Date('2026-10-30T10:00:00Z');

type Membership = {
  readonly id: string;
  readonly userId: string | null;
  readonly isActive: boolean;
  readonly bannedAt?: Date | null;
};

type ParticipationWhere = { readonly isActive?: boolean; readonly OR?: ReadonlyArray<Record<string, unknown>> };

const person = (id: string, username: string) => ({
  id, username, firstName: null, lastName: null, displayName: username, avatar: null, equippedAvatarRing: null,
});

/**
 * Le `where` d'une participation, jugé comme MongoDB le jugerait : sans
 * `isActive: true` un parti passe, sans la clause « `bannedAt` nul ou absent »
 * un banni passe. Une garde qui oublie l'une des deux laisse donc passer ici
 * exactement ce qu'elle laisserait passer en production.
 */
const keeps = (where: ParticipationWhere | undefined) => (m: Membership): boolean => {
  const bansExcluded = (where?.OR ?? []).some((clause) => Object.prototype.hasOwnProperty.call(clause, 'bannedAt'));
  return (where?.isActive !== true || m.isActive) && (!bansExcluded || m.bannedAt == null);
};

function fakePrisma(world: { readonly type: string; readonly memberships: readonly Membership[] }) {
  const people = { [MEMBER]: person(MEMBER, 'member'), [STRANGER]: person(STRANGER, 'stranger') };
  const profileOf = (userId: string) => people[userId as keyof typeof people] ?? person(userId, 'me');
  return {
    conversation: {
      findUnique: jest.fn(async (args: { where: { id: string }; include?: { participants?: { where?: ParticipationWhere } } }) =>
        args.where.id === CONVERSATION
          ? {
              id: CONVERSATION,
              type: world.type,
              participants: world.memberships.filter(keeps(args.include?.participants?.where)).map((m) => ({ userId: m.userId })),
            }
          : null
      ),
    },
    participant: {
      findFirst: jest.fn(async ({ where }: { where: ParticipationWhere & { conversationId: string; userId: string } }) => {
        const found = world.memberships.find(
          (m) => where.conversationId === CONVERSATION && m.userId === where.userId && keeps(where)(m)
        );
        return found ? { id: found.id } : null;
      }),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const found = world.memberships.find((m) => m.id === where.id);
        return found
          ? { userId: found.userId, isActive: found.isActive, bannedAt: found.bannedAt ?? null, conversationId: CONVERSATION }
          : null;
      }),
      findMany: jest.fn(async ({ where }: { where?: ParticipationWhere & { userId?: { not?: string } } }) =>
        world.memberships
          .filter(keeps(where))
          .filter((m) => where?.userId?.not === undefined || m.userId !== where.userId.not)
          .flatMap((m) => (m.userId ? [{ userId: m.userId, user: profileOf(m.userId) }] : []))
      ),
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

const emptyCache = { get: async () => null, set: async () => undefined, keys: async () => [], del: async () => undefined } as never;

const filledCache = (list: unknown) =>
  ({ get: async () => JSON.stringify(list), set: async () => undefined, keys: async () => [], del: async () => undefined }) as never;

function mentionResolver(validUserIds: readonly string[]) {
  const validateMentionPermissions = jest.fn(async (_conversationId: string, _ids: string[], _sender: string | null) => ({
    validUserIds: [...validUserIds],
  }));
  const createMentions = jest.fn(async (_messageId: string, _ids: string[]) => undefined);
  return {
    validateMentionPermissions,
    createMentions,
    service: {
      extractMentionsWithParticipants: () => [],
      resolveUsernames: async () => new Map(),
      validateMentionPermissions,
      createMentions,
    },
  };
}

describe('#14066 — la recherche refuse un non-membre, quelle que soit la portée', () => {
  it.each(['public', 'global', 'broadcast', 'group', 'direct'])('%s : 403, même message qu’une conversation absente', async (type) => {
    const finder = new MentionSuggestionFinder(
      fakePrisma({ type, memberships: [{ id: 'p-member', userId: MEMBER, isActive: true }] }),
      emptyCache
    );
    await expect(finder.forConversation(CONVERSATION, ME, 'me')).rejects.toThrow(ACCESS_DENIED);
  });

  it('une appartenance QUITTÉE (inactive) ne suffit pas', async () => {
    const finder = new MentionSuggestionFinder(
      fakePrisma({ type: 'public', memberships: [{ id: 'p-me', userId: ME, isActive: false }] }),
      emptyCache
    );
    await expect(finder.forConversation(CONVERSATION, ME, '')).rejects.toThrow(ACCESS_DENIED);
  });

  it('un membre BANNI, encore actif, ne reçoit rien', async () => {
    const finder = new MentionSuggestionFinder(
      fakePrisma({
        type: 'public',
        memberships: [{ id: 'p-me', userId: ME, isActive: true, bannedAt: BANNED_AT }, { id: 'p-member', userId: MEMBER, isActive: true }],
      }),
      emptyCache
    );
    await expect(finder.forConversation(CONVERSATION, ME, '')).rejects.toThrow(ACCESS_DENIED);
  });

  it('la garde passe AVANT un cache rempli : la liste en cache ne sort pas pour un non-membre', async () => {
    const finder = new MentionSuggestionFinder(
      fakePrisma({ type: 'public', memberships: [{ id: 'p-member', userId: MEMBER, isActive: true }] }),
      filledCache([{ id: MEMBER, username: 'member', displayName: 'member', avatar: null, badge: 'conversation', inConversation: true, isFriend: false }])
    );
    await expect(finder.forConversation(CONVERSATION, ME, '')).rejects.toThrow(ACCESS_DENIED);
  });

  it('un membre actif d’un groupe reçoit ses membres, sans les bannis', async () => {
    const finder = new MentionSuggestionFinder(
      fakePrisma({
        type: 'group',
        memberships: [
          { id: 'p-me', userId: ME, isActive: true },
          { id: 'p-member', userId: MEMBER, isActive: true },
          { id: 'p-banned', userId: STRANGER, isActive: true, bannedAt: BANNED_AT },
        ],
      }),
      emptyCache
    );
    const list = await finder.forConversation(CONVERSATION, ME, '');
    expect(list.map((s) => s.id)).toEqual([MEMBER]);
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

  it('validateMentionPermissions : un expéditeur BANNI ne cite personne', async () => {
    const service = new MentionService(
      fakePrisma({
        type: 'public',
        memberships: [{ id: 'p-me', userId: ME, isActive: true, bannedAt: BANNED_AT }, { id: 'p-member', userId: MEMBER, isActive: true }],
      })
    );
    const result = await service.validateMentionPermissions(CONVERSATION, [MEMBER], ME);
    expect(result.validUserIds).toEqual([]);
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

  it.each([
    ['QUITTÉ', { isActive: false }],
    ['BANNI', { isActive: true, bannedAt: BANNED_AT }],
  ] as const)('resolveMessageMentions : le participant expéditeur %s ne valide rien, même un membre', async (_label, state) => {
    const prisma = fakePrisma({
      type: 'public',
      memberships: [{ id: SENDER_PARTICIPANT, userId: ME, ...state }, { id: 'p-member', userId: MEMBER, isActive: true }],
    });
    const resolver = mentionResolver([MEMBER]);
    const result = await resolveMessageMentions({
      prisma,
      mentionService: resolver.service,
      message: { id: 'm1', conversationId: CONVERSATION, senderId: SENDER_PARTICIPANT },
      content: 'salut',
      explicitMentionedUserIds: [MEMBER],
    });
    expect(result.validatedUserIds).toEqual([]);
    expect(resolver.validateMentionPermissions).not.toHaveBeenCalled();
    expect(resolver.createMentions).not.toHaveBeenCalled();
  });

  it('resolveMessageMentions : un expéditeur ANONYME vivant cite, sans User.id ; parti, il ne cite personne', async () => {
    const alive = mentionResolver([MEMBER]);
    const aliveResult = await resolveMessageMentions({
      prisma: fakePrisma({ type: 'public', memberships: [{ id: SENDER_PARTICIPANT, userId: null, isActive: true }] }),
      mentionService: alive.service,
      message: { id: 'm1', conversationId: CONVERSATION, senderId: SENDER_PARTICIPANT },
      content: 'salut',
      explicitMentionedUserIds: [MEMBER],
    });
    expect(alive.validateMentionPermissions).toHaveBeenCalledWith(CONVERSATION, [MEMBER], null);
    expect(aliveResult.validatedUserIds).toEqual([MEMBER]);

    const gone = mentionResolver([MEMBER]);
    const goneResult = await resolveMessageMentions({
      prisma: fakePrisma({ type: 'public', memberships: [{ id: SENDER_PARTICIPANT, userId: null, isActive: false }] }),
      mentionService: gone.service,
      message: { id: 'm1', conversationId: CONVERSATION, senderId: SENDER_PARTICIPANT },
      content: 'salut',
      explicitMentionedUserIds: [MEMBER],
    });
    expect(goneResult.validatedUserIds).toEqual([]);
    expect(gone.validateMentionPermissions).not.toHaveBeenCalled();
  });

  it('resolveMessageMentions : une lecture de l’expéditeur en ÉCHEC ne crée aucune mention et le signale', async () => {
    const prisma = fakePrisma({ type: 'public', memberships: [] });
    (prisma as unknown as { participant: { findUnique: jest.Mock } }).participant.findUnique = jest.fn(async () => {
      throw new Error('ECONNRESET');
    });
    const resolver = mentionResolver([MEMBER]);
    const onError = jest.fn();
    const result = await resolveMessageMentions({
      prisma,
      mentionService: resolver.service,
      message: { id: 'm1', conversationId: CONVERSATION, senderId: SENDER_PARTICIPANT },
      content: 'salut',
      explicitMentionedUserIds: [MEMBER],
      onError,
    });
    expect(result.validatedUserIds).toEqual([]);
    expect(result.reconciled).toBe(false);
    expect(resolver.createMentions).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
  });
});
