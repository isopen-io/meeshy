/**
 * **UNE RÉACTION À MON MESSAGE REMONTE MA LIGNE — PAR LE SERVEUR** (#7592).
 *
 * Recette #7549 : B réagit 👍 au message de A ; `GET /conversations` (A) rendait
 * l'ordre inchangé, la conversation A↔B restant sous une conversation dont le
 * dernier message était plus ancien que la réaction. Le contrat #7545 laissait
 * la remontée aux clients ; la directive du 2026-09-23 la rend au serveur, qui
 * trie sur le rang du lecteur et le SERT (`listRankAt`).
 *
 * Route COMPLÈTE (`app.inject`), schéma de réponse réel : un champ que le
 * schéma ne déclare pas serait retiré par `fast-json-stringify`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const VIEWER = '507f1f77bcf86cd799439001';
const THIRD = '507f1f77bcf86cd799439003';
const OTHER_CONV = '507f1f77bcf86cd799439101';
const DIRECT_CONV = '507f1f77bcf86cd799439102';
const QUIET_CONV = '507f1f77bcf86cd799439103';

const OTHER_MESSAGE_AT = new Date('2026-09-23T12:07:16.000Z');
const DIRECT_MESSAGE_AT = new Date('2026-09-23T12:06:24.000Z');
const REACTION_AT = new Date('2026-09-23T12:07:24.082Z');
const QUIET_MESSAGE_AT = new Date('2026-09-23T11:00:00.000Z');

jest.mock('../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
}));

jest.mock('../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: async () => new Map() }),
}));

jest.mock('../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    getUnreadCountsForUser: async () => new Map(),
  })),
}));

jest.mock('../../services/ConversationBridgeService', () => ({
  ConversationBridgeService: jest.fn().mockImplementation(() => ({ buildBridgeData: async () => new Map() })),
}));

type Row = {
  id: string;
  lastMessageAt: Date | null;
  lastReactionAt?: Date | null;
  lastReactionTargetKey?: string | null;
  updatedAt: Date;
};

function conversation(row: Row) {
  return {
    title: `Conversation ${row.id.slice(-3)}`,
    description: null,
    type: 'group',
    identifier: `conv-${row.id.slice(-3)}`,
    isActive: true,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    banner: null,
    avatar: null,
    communityId: null,
    lastReactionId: null,
    activeCallId: null,
    _count: { participants: 2 },
    participants: [],
    userPreferences: [],
    messages: [],
    ...row,
  };
}

type Where = Record<string, unknown>;

function compare(value: unknown, filter: unknown): boolean {
  if (filter === null || typeof filter !== 'object' || filter instanceof Date) {
    return value === filter || (value instanceof Date && filter instanceof Date && value.getTime() === filter.getTime());
  }
  const ops = filter as Record<string, unknown>;
  const ms = value instanceof Date ? value.getTime() : null;
  if ('in' in ops) return (ops.in as unknown[]).includes(value);
  if ('lt' in ops) return ms !== null && ms < (ops.lt as Date).getTime();
  if ('gte' in ops) return ms !== null && ms >= (ops.gte as Date).getTime();
  if ('gt' in ops) return ms !== null && ms > (ops.gt as Date).getTime();
  return true;
}

const FIELDS = new Set(['id', 'lastMessageAt', 'lastReactionAt', 'lastReactionTargetKey', 'updatedAt']);

function matches(row: Record<string, unknown>, where: Where | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, filter]) => {
    if (key === 'AND') return (filter as Where[]).every((w) => matches(row, w));
    if (key === 'NOT') return !matches(row, filter as Where);
    if (!FIELDS.has(key)) return true;
    return compare(row[key] ?? null, filter);
  });
}

function sortBy(rows: Array<Record<string, unknown>>, orderBy: unknown): Array<Record<string, unknown>> {
  const [first] = Array.isArray(orderBy) ? orderBy : [orderBy];
  const [[field, direction]] = Object.entries(first as Record<string, 'asc' | 'desc'>);
  const key = (row: Record<string, unknown>) => {
    const value = row[field];
    return value instanceof Date ? value.getTime() : Number.NEGATIVE_INFINITY;
  };
  return [...rows].sort((a, b) => (direction === 'desc' ? key(b) - key(a) : key(a) - key(b)));
}

function makePrisma(rows: Row[]) {
  const table = rows.map(conversation) as Array<Record<string, unknown>>;
  const findMany = jest.fn(async (args: { where?: Where; orderBy?: unknown; skip?: number; take?: number }) => {
    const filtered = sortBy(table.filter((row) => matches(row, args.where)), args.orderBy ?? { lastMessageAt: 'desc' });
    const skip = args.skip ?? 0;
    return filtered.slice(skip, skip + (args.take ?? filtered.length));
  });
  return {
    conversation: {
      findMany,
      findFirst: jest.fn(async (args: { where: Where }) => table.find((row) => row.id === args.where.id) ?? null),
      count: jest.fn(async () => table.length),
    },
    participant: { findMany: jest.fn(async () => []) },
    reaction: { findMany: jest.fn(async () => []) },
    callSession: { findMany: jest.fn(async () => []) },
    conversationReadCursor: { findMany: jest.fn(async () => []) },
  };
}

async function buildApp(prisma: unknown): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const optionalAuth = async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    (request as unknown as Record<string, unknown>).authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: VIEWER,
      registeredUser: { id: VIEWER },
      hasFullAccess: true,
    };
  };
  const { registerCoreRoutes } = await import('../../routes/conversations/core');
  registerCoreRoutes(app, prisma as PrismaClient, optionalAuth, optionalAuth);
  await app.ready();
  return app;
}

async function list(rows: Row[], query = ''): Promise<Array<{ id: string; listRankAt: string | null }>> {
  const app = await buildApp(makePrisma(rows));
  const res = await app.inject({ method: 'GET', url: `/conversations${query}`, headers: { authorization: 'Bearer x' } });
  await app.close();
  expect(res.statusCode).toBe(200);
  return res.json().data;
}

const other = (): Row => ({ id: OTHER_CONV, lastMessageAt: OTHER_MESSAGE_AT, updatedAt: OTHER_MESSAGE_AT });
const quiet = (): Row => ({ id: QUIET_CONV, lastMessageAt: QUIET_MESSAGE_AT, updatedAt: QUIET_MESSAGE_AT });
const direct = (targetKey: string): Row => ({
  id: DIRECT_CONV,
  lastMessageAt: DIRECT_MESSAGE_AT,
  lastReactionAt: REACTION_AT,
  lastReactionTargetKey: targetKey,
  updatedAt: REACTION_AT,
});

describe('GET /conversations — le rang du lecteur (#7592)', () => {
  it('une réaction à MON message fait passer ma conversation au-dessus, et le rang est servi', async () => {
    const data = await list([other(), direct(VIEWER), quiet()]);

    expect(data.map((c) => c.id)).toEqual([DIRECT_CONV, OTHER_CONV, QUIET_CONV]);
    expect(data[0]?.listRankAt).toBe(REACTION_AT.toISOString());
    expect(data[1]?.listRankAt).toBe(OTHER_MESSAGE_AT.toISOString());
  });

  it("une réaction entre tiers s'affiche sans réordonner", async () => {
    const data = await list([other(), direct(THIRD), quiet()]);

    expect(data.map((c) => c.id)).toEqual([OTHER_CONV, DIRECT_CONV, QUIET_CONV]);
    expect(data[1]?.listRankAt).toBe(DIRECT_MESSAGE_AT.toISOString());
  });

  it('la page 1 de taille 1 est la conversation remontée', async () => {
    const data = await list([other(), direct(VIEWER), quiet()], '?limit=1');

    expect(data.map((c) => c.id)).toEqual([DIRECT_CONV]);
  });

  it("l'offset pagine sur le rang, sans doublon ni trou", async () => {
    const rows = [other(), direct(VIEWER), quiet()];
    const pages = [
      await list(rows, '?limit=1&offset=0'),
      await list(rows, '?limit=1&offset=1'),
      await list(rows, '?limit=1&offset=2'),
    ];

    expect(pages.flat().map((c) => c.id)).toEqual([DIRECT_CONV, OTHER_CONV, QUIET_CONV]);
  });

  it('le curseur `before` sur la ligne remontée rend la suite par rang, sans la resservir', async () => {
    const data = await list([other(), direct(VIEWER), quiet()], `?before=${DIRECT_CONV}`);

    expect(data.map((c) => c.id)).toEqual([OTHER_CONV, QUIET_CONV]);
  });

  it('le curseur `before` sur la ligne suivante ne ressert pas la ligne remontée', async () => {
    const data = await list([other(), direct(VIEWER), quiet()], `?before=${OTHER_CONV}`);

    expect(data.map((c) => c.id)).toEqual([QUIET_CONV]);
  });

  it('une page delta sert le rang du lecteur', async () => {
    const data = await list([other(), direct(VIEWER)], '?updatedSince=2026-09-23T12:00:00.000Z');

    const reacted = data.find((c) => c.id === DIRECT_CONV);
    expect(reacted?.listRankAt).toBe(REACTION_AT.toISOString());
  });

  it('un document antérieur à #7592 (champs de réaction ABSENTS) garde son rang de dernier message', async () => {
    const data = await list([other(), quiet()], `?before=${OTHER_CONV}`);

    expect(data.map((c) => c.id)).toEqual([QUIET_CONV]);
    expect(data[0]?.listRankAt).toBe(QUIET_MESSAGE_AT.toISOString());
  });
});
