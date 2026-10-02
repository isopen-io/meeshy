/**
 * **TOUTE ACTIVITÉ REMONTE LA LIGNE — POUR TOUS, PAR LE SERVEUR** (#9026).
 *
 * Recette #7549 : B réagit 👍 au message de A ; `GET /conversations` (A) rendait
 * l'ordre inchangé. #7592 avait rendu la remontée au serveur, mais pour le seul
 * AUTEUR réagi ; la directive porteur du 2026-10-01 l'étend à TOUS les
 * participants et à toute activité (réaction, appel, épingle) : rang =
 * max(`lastMessageAt`, `lastActivityAt`), trié et SERVI (`listRankAt`).
 *
 * Route COMPLÈTE (`app.inject`), schéma de réponse réel : un champ que le
 * schéma ne déclare pas serait retiré par `fast-json-stringify`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { matchesMongoWhere } from '../helpers/mongo-where';

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
  lastActivityAt?: Date | null;
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

/**
 * Le `where` de la route, réduit aux colonnes que ce double porte, puis évalué
 * avec les sémantiques MESURÉES contre `mongo:8` (`helpers/mongo-where.ts`,
 * #8309) : une clé ABSENTE n'est pas une clé nulle, et c'est elle que porte une
 * conversation sans activité.
 */
const FIELDS = new Set(['id', 'lastMessageAt', 'lastReactionAt', 'lastReactionTargetKey', 'lastActivityAt', 'updatedAt']);

function rankWhere(where: Where): Where {
  return Object.fromEntries(
    Object.entries(where).flatMap(([key, filter]): Array<[string, unknown]> => {
      if (key === 'AND' || key === 'OR' || key === 'NOT') {
        return [[key, Array.isArray(filter) ? (filter as Where[]).map(rankWhere) : rankWhere(filter as Where)]];
      }
      return FIELDS.has(key) ? [[key, filter]] : [];
    })
  );
}

function matches(row: Record<string, unknown>, where: Where | undefined): boolean {
  return matchesMongoWhere(row, where && rankWhere(where));
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
/** B a réagi au message de A : #7592 a écrit la dernière réaction, #9026 l'activité. */
const direct = (): Row => ({
  id: DIRECT_CONV,
  lastMessageAt: DIRECT_MESSAGE_AT,
  lastReactionAt: REACTION_AT,
  lastReactionTargetKey: THIRD,
  lastActivityAt: REACTION_AT,
  updatedAt: REACTION_AT,
});

/** Une réaction écrite AVANT #9026 : colonnes #7592 seules, aucune activité. */
const legacyReaction = (targetKey: string): Row => ({
  id: DIRECT_CONV,
  lastMessageAt: DIRECT_MESSAGE_AT,
  lastReactionAt: REACTION_AT,
  lastReactionTargetKey: targetKey,
  updatedAt: REACTION_AT,
});

describe('GET /conversations — le rang de TOUS les participants (#9026)', () => {
  it('une activité (réaction entre tiers comprise) fait passer la conversation au-dessus, et le rang est servi', async () => {
    const data = await list([other(), direct(), quiet()]);

    expect(data.map((c) => c.id)).toEqual([DIRECT_CONV, OTHER_CONV, QUIET_CONV]);
    expect(data[0]?.listRankAt).toBe(REACTION_AT.toISOString());
    expect(data[1]?.listRankAt).toBe(OTHER_MESSAGE_AT.toISOString());
  });

  it('une réaction antérieure à #9026 (sans lastActivityAt) ne réordonne plus, même à MON message', async () => {
    const data = await list([other(), legacyReaction(VIEWER), quiet()]);

    expect(data.map((c) => c.id)).toEqual([OTHER_CONV, DIRECT_CONV, QUIET_CONV]);
    expect(data[1]?.listRankAt).toBe(DIRECT_MESSAGE_AT.toISOString());
  });

  it('la page 1 de taille 1 est la conversation remontée', async () => {
    const data = await list([other(), direct(), quiet()], '?limit=1');

    expect(data.map((c) => c.id)).toEqual([DIRECT_CONV]);
  });

  it("l'offset pagine sur le rang, sans doublon ni trou", async () => {
    const rows = [other(), direct(), quiet()];
    const pages = [
      await list(rows, '?limit=1&offset=0'),
      await list(rows, '?limit=1&offset=1'),
      await list(rows, '?limit=1&offset=2'),
    ];

    expect(pages.flat().map((c) => c.id)).toEqual([DIRECT_CONV, OTHER_CONV, QUIET_CONV]);
  });

  it('le curseur `before` sur la ligne remontée rend la suite par rang, sans la resservir', async () => {
    const data = await list([other(), direct(), quiet()], `?before=${DIRECT_CONV}`);

    expect(data.map((c) => c.id)).toEqual([OTHER_CONV, QUIET_CONV]);
  });

  it('le curseur `before` sur la ligne suivante ne ressert pas la ligne remontée', async () => {
    const data = await list([other(), direct(), quiet()], `?before=${OTHER_CONV}`);

    expect(data.map((c) => c.id)).toEqual([QUIET_CONV]);
  });

  it('une page delta sert le rang', async () => {
    const data = await list([other(), direct()], '?updatedSince=2026-09-23T12:00:00.000Z');

    const reacted = data.find((c) => c.id === DIRECT_CONV);
    expect(reacted?.listRankAt).toBe(REACTION_AT.toISOString());
  });

  it('une activité PLUS ANCIENNE que le dernier message ne recule pas la ligne', async () => {
    const stale: Row = { ...other(), lastActivityAt: QUIET_MESSAGE_AT };
    const data = await list([stale, legacyReaction(THIRD), quiet()]);

    expect(data.map((c) => c.id)).toEqual([OTHER_CONV, DIRECT_CONV, QUIET_CONV]);
    expect(data[0]?.listRankAt).toBe(OTHER_MESSAGE_AT.toISOString());
  });

  it("un document antérieur (champs d'activité ABSENTS) garde son rang de dernier message", async () => {
    const data = await list([other(), quiet()], `?before=${OTHER_CONV}`);

    expect(data.map((c) => c.id)).toEqual([QUIET_CONV]);
    expect(data[0]?.listRankAt).toBe(QUIET_MESSAGE_AT.toISOString());
  });
});
