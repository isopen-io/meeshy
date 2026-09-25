/**
 * La recherche de mention propose TOUTES les personnes mentionnables, et
 * JAMAIS une personne que `validateMentionPermissions` refuserait (#7852).
 *
 * Le faux Prisma ci-dessous INTERPRÈTE les `where` avec la sémantique MongoDB :
 * `{ champ: null }` est une égalité, qui n'apparie PAS un champ absent. C'est
 * exactement ce qui vidait l'annuaire en production : un compte jamais supprimé
 * n'a pas de clé `deletedAt`, et `{ deletedAt: null }` l'écartait.
 *
 * @jest-environment node
 */

jest.mock('../../../services/CacheStore', () => {
  const store = new Map<string, string>();
  const cache = {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    del: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    keys: jest.fn(async (pattern: string) => {
      const prefix = pattern.replace(/\*$/, '');
      return [...store.keys()].filter(k => k.startsWith(prefix));
    }),
    isAvailable: jest.fn(() => true),
  };
  return { getCacheStore: jest.fn(() => cache), __store: store, __cache: cache };
});

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
}));

import { MentionService } from '../../../services/MentionService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { searchTokensFor } from '../../../utils/search-tokens';

type Row = Record<string, unknown>;

type UserRow = {
  id: string;
  username: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  isActive: boolean;
  searchTokens: string[];
  deletedAt?: Date | null;
};

const cacheModule = jest.requireMock('../../../services/CacheStore') as {
  __store: Map<string, string>;
};

function isOperator(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

function matchesField(row: Row, field: string, condition: unknown): boolean {
  const present = Object.prototype.hasOwnProperty.call(row, field);
  const value = row[field];
  if (condition === null) return present && value === null;
  if (!isOperator(condition)) return present && value === condition;
  return Object.entries(condition).every(([op, operand]) => {
    switch (op) {
      case 'isSet':
        return operand === (present && value !== undefined);
      case 'not':
        return value !== operand;
      case 'in':
        return (operand as unknown[]).includes(value);
      case 'notIn':
        return !(operand as unknown[]).includes(value);
      case 'has':
        return Array.isArray(value) && value.includes(operand);
      case 'contains':
        return typeof value === 'string' &&
          (condition.mode === 'insensitive'
            ? value.toLowerCase().includes(String(operand).toLowerCase())
            : value.includes(String(operand)));
      case 'mode':
        return true;
      case 'equals':
        return value === operand;
      default:
        throw new Error(`opérateur non interprété par le faux Prisma : ${op}`);
    }
  });
}

function matchesWhere(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'AND') return (condition as Row[]).every(w => matchesWhere(row, w));
    if (key === 'OR') return (condition as Row[]).some(w => matchesWhere(row, w));
    return matchesField(row, key, condition);
  });
}

function user(id: string, username: string, extra: Partial<UserRow> = {}): UserRow {
  const base = {
    id,
    username,
    displayName: extra.displayName ?? null,
    firstName: extra.firstName ?? null,
    lastName: extra.lastName ?? null,
  };
  return {
    ...base,
    avatar: null,
    isActive: true,
    searchTokens: searchTokensFor(base),
    ...extra,
  };
}

type ParticipantRow = { conversationId: string; userId: string | null; isActive: boolean };
type ConversationRow = { id: string; type: string };
type FriendRow = { senderId: string; receiverId: string; status: string };

type World = {
  users: UserRow[];
  conversations: ConversationRow[];
  participants: ParticipantRow[];
  friendships?: FriendRow[];
};

function publicUser(u: UserRow | undefined) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    firstName: u.firstName,
    lastName: u.lastName,
    avatar: u.avatar,
  };
}

function fakePrisma(world: World) {
  const userById = (id: string | null) => world.users.find(u => u.id === id);
  return {
    conversation: {
      findUnique: jest.fn(async ({ where, include }: { where: { id: string }; include?: Row }) => {
        const conversation = world.conversations.find(c => c.id === where.id);
        if (!conversation) return null;
        if (!include) return conversation;
        return {
          ...conversation,
          participants: world.participants
            .filter(p => p.conversationId === conversation.id && p.isActive)
            .map(p => ({ userId: p.userId })),
        };
      }),
    },
    participant: {
      findMany: jest.fn(async ({ where }: { where: Row }) =>
        world.participants
          .filter(p => matchesWhere(p as unknown as Row, where))
          .map(p => ({ ...p, user: publicUser(userById(p.userId)) }))
      ),
      findFirst: jest.fn(async ({ where }: { where: Row }) =>
        world.participants.find(p => matchesWhere(p as unknown as Row, where)) ?? null
      ),
    },
    friendRequest: {
      findMany: jest.fn(async ({ where }: { where: Row }) =>
        (world.friendships ?? [])
          .filter(f => matchesWhere(f as unknown as Row, where))
          .map(f => ({
            ...f,
            sender: publicUser(userById(f.senderId)),
            receiver: publicUser(userById(f.receiverId)),
          }))
      ),
    },
    user: {
      findMany: jest.fn(async ({ where, take }: { where: Row; take?: number }) =>
        world.users
          .filter(u => matchesWhere(u as unknown as Row, where))
          .sort((a, b) => a.username.localeCompare(b.username))
          .slice(0, take ?? Infinity)
          .map(publicUser)
      ),
    },
    conversationMessageStats: {
      findUnique: jest.fn(async () => null),
    },
    post: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        where.id === POST ? { id: POST, authorId: AUTHOR.id, deletedAt: null, author: publicUser(AUTHOR) } : null
      ),
    },
    postComment: {
      findMany: jest.fn(async () => []),
    },
  };
}

const ME = user('000000000000000000000001', 'recette');
const MEMBER_SILENT = user('000000000000000000000002', 'melanie', { displayName: 'Mélanie' });
const MEMBER_OTHER = user('000000000000000000000003', 'atabeth');
const STRANGER = user('000000000000000000000004', 'meeshy', { displayName: 'Meeshy' });
const FRIEND = user('000000000000000000000005', 'memefriend');
const INTERLOCUTOR = user('000000000000000000000006', 'merone');
const AUTHOR = user('000000000000000000000007', 'author');
const DELETED = user('000000000000000000000008', 'medeleted', { deletedAt: new Date('2026-01-01') });
const NULLED = user('000000000000000000000009', 'menulled', { deletedAt: null });

const GROUP = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const PUBLIC = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const DIRECT = 'aaaaaaaaaaaaaaaaaaaaaaa3';
const BROADCAST = 'aaaaaaaaaaaaaaaaaaaaaaa4';
const FOREIGN_GROUP = 'aaaaaaaaaaaaaaaaaaaaaaa5';
const POST = 'bbbbbbbbbbbbbbbbbbbbbbb1';

function world(): World {
  return {
    users: [ME, MEMBER_SILENT, MEMBER_OTHER, STRANGER, FRIEND, INTERLOCUTOR, AUTHOR, DELETED, NULLED],
    conversations: [
      { id: GROUP, type: 'group' },
      { id: PUBLIC, type: 'public' },
      { id: DIRECT, type: 'direct' },
      { id: BROADCAST, type: 'broadcast' },
      { id: FOREIGN_GROUP, type: 'group' },
    ],
    participants: [
      { conversationId: GROUP, userId: ME.id, isActive: true },
      { conversationId: GROUP, userId: MEMBER_SILENT.id, isActive: true },
      { conversationId: GROUP, userId: MEMBER_OTHER.id, isActive: true },
      { conversationId: PUBLIC, userId: ME.id, isActive: true },
      { conversationId: DIRECT, userId: ME.id, isActive: true },
      { conversationId: DIRECT, userId: INTERLOCUTOR.id, isActive: true },
      { conversationId: BROADCAST, userId: ME.id, isActive: true },
      { conversationId: FOREIGN_GROUP, userId: MEMBER_SILENT.id, isActive: true },
    ],
    friendships: [{ senderId: ME.id, receiverId: FRIEND.id, status: 'accepted' }],
  };
}

function serviceFor(w: World) {
  const prisma = fakePrisma(w);
  return { prisma, service: new MentionService(prisma as unknown as PrismaClient) };
}

const usernames = (list: ReadonlyArray<{ username: string }>) => list.map(s => s.username);

describe('recherche de mention — la portée des suggestions est celle de la validation (#7852)', () => {
  beforeEach(() => {
    cacheModule.__store.clear();
  });

  describe('groupe', () => {
    it('`@me` trouve un membre qui n’a jamais écrit, et jamais un non-membre ni un ami hors groupe', async () => {
      const { service } = serviceFor(world());

      const result = await service.getUserSuggestionsForConversation(GROUP, ME.id, 'me');

      expect(usernames(result)).toEqual(['melanie']);
    });

    it('sans saisie, propose tous les membres actifs sauf soi, et aucun ami extérieur', async () => {
      const { service } = serviceFor(world());

      const result = await service.getUserSuggestionsForConversation(GROUP, ME.id, '');

      expect(usernames(result).sort()).toEqual(['atabeth', 'melanie']);
      expect(result.every(s => s.badge === 'conversation')).toBe(true);
    });

    it('chaque suggestion d’un groupe est acceptée par validateMentionPermissions', async () => {
      const { service } = serviceFor(world());

      const suggestions = await service.getUserSuggestionsForConversation(GROUP, ME.id, 'e');
      const validation = await service.validateMentionPermissions(GROUP, suggestions.map(s => s.id), ME.id);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(validation.validUserIds).toEqual(suggestions.map(s => s.id));
      expect(validation.errors).toEqual([]);
    });

    it('refuse de lister les membres d’un groupe dont l’appelant n’est pas membre', async () => {
      const { service } = serviceFor(world());

      await expect(service.getUserSuggestionsForConversation(FOREIGN_GROUP, ME.id, 'me')).rejects.toThrow('accès refusé');
    });
  });

  describe('conversation directe', () => {
    it('ne propose que l’interlocuteur — ni ami, ni annuaire', async () => {
      const { service } = serviceFor(world());

      const result = await service.getUserSuggestionsForConversation(DIRECT, ME.id, 'me');

      expect(usernames(result)).toEqual(['merone']);
    });
  });

  describe('conversation publique, globale ou broadcast', () => {
    it('`@me` trouve un compte de l’annuaire qui n’a JAMAIS eu de champ deletedAt', async () => {
      const { service } = serviceFor(world());

      const result = await service.getUserSuggestionsForConversation(PUBLIC, ME.id, 'me');

      expect(usernames(result)).toContain('meeshy');
      expect(result.find(s => s.username === 'meeshy')?.badge).toBe('other');
    });

    it('met les amis avant l’annuaire, écarte les comptes supprimés, garde ceux dont deletedAt vaut null', async () => {
      const { service } = serviceFor(world());

      const result = await service.getUserSuggestionsForConversation(PUBLIC, ME.id, 'me');

      expect(result[0]).toMatchObject({ username: 'memefriend', badge: 'friend' });
      expect(usernames(result)).toContain('menulled');
      expect(usernames(result)).not.toContain('medeleted');
      expect(usernames(result)).not.toContain('recette');
    });

    it('un broadcast cherche aussi l’annuaire, et la validation accepte ce qu’il propose', async () => {
      const { service } = serviceFor(world());

      const suggestions = await service.getUserSuggestionsForConversation(BROADCAST, ME.id, 'mee');
      const validation = await service.validateMentionPermissions(BROADCAST, suggestions.map(s => s.id), ME.id);

      expect(usernames(suggestions)).toEqual(['meeshy']);
      expect(validation.validUserIds).toEqual([STRANGER.id]);
      expect(validation.errors).toEqual([]);
    });

    it('à UNE lettre, l’annuaire n’est pas interrogé', async () => {
      const { service, prisma } = serviceFor(world());

      await service.getUserSuggestionsForConversation(PUBLIC, ME.id, 'm');

      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });
  });

  describe('cache', () => {
    it('une liste vide mise en cache ne masque pas les résultats', async () => {
      const w = world();
      const { service } = serviceFor(w);

      const before = await service.getUserSuggestionsForConversation(GROUP, ME.id, 'zo');
      w.users.push(user('00000000000000000000000a', 'zoe'));
      w.participants.push({ conversationId: GROUP, userId: '00000000000000000000000a', isActive: true });
      const after = await service.getUserSuggestionsForConversation(GROUP, ME.id, 'zo');

      expect(before).toEqual([]);
      expect(usernames(after)).toEqual(['zoe']);
    });

    it('une entrée écrite sous l’ancienne clé n’est pas relue', async () => {
      cacheModule.__store.set(`mentions:suggestions:${PUBLIC}:${ME.id}:me`, '[]');
      const { service } = serviceFor(world());

      const result = await service.getUserSuggestionsForConversation(PUBLIC, ME.id, 'me');

      expect(usernames(result)).toContain('meeshy');
    });

    it('l’invalidation d’une conversation efface les entrées que la recherche a écrites', async () => {
      const { service } = serviceFor(world());
      await service.getUserSuggestionsForConversation(GROUP, ME.id, 'me');
      expect(cacheModule.__store.size).toBe(1);

      await service.invalidateCacheForConversation(GROUP);

      expect(cacheModule.__store.size).toBe(0);
    });
  });

  describe('contexte post', () => {
    it('`@me` trouve un compte hors contacts, badge other, après les amis', async () => {
      const { service } = serviceFor(world());

      const result = await service.getUserSuggestionsForPost(POST, ME.id, 'me');

      expect(result[0]).toMatchObject({ username: 'memefriend', badge: 'friend' });
      expect(result.find(s => s.username === 'meeshy')?.badge).toBe('other');
      expect(usernames(result)).not.toContain('medeleted');
    });
  });
});
