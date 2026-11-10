/**
 * #17117 / #9223 — `GET /conversations/search` : un client publié avant le
 * type `external` ne la reçoit pas (il la rendrait en tête-à-tête sans
 * interlocuteur), comme `GET /conversations` et `GET /sync`. Le double ÉVALUE
 * les contraintes scalaires du `where` reçu : c'est la forme SERVIE qui parle.
 *
 * @jest-environment node
 */
import Fastify, { type FastifyInstance } from 'fastify';
import { describe, it, expect, jest } from '@jest/globals';
import { EXTERNAL_CONVERSATIONS_CAPABILITY } from '@meeshy/shared/types/external-conversation';

jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn() }) },
}));

import { registerSearchRoutes } from '../../../../routes/conversations/search';

const USER_ID = '507f1f77bcf86cd799439011';

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const RELATIONS = new Set(['participants', 'messages']);

const satisfies = (value: unknown, filter: unknown): boolean => {
  if (filter === null || typeof filter !== 'object') return value === filter;
  return Object.entries(filter as Record<string, unknown>).every(([operator, operand]) => {
    if (operator === 'not') return value !== operand;
    if (operator === 'contains' || operator === 'mode') return true;
    throw new Error(`opérateur inconnu du double : ${operator}`);
  });
};

const matches = (row: Row, where: Where | undefined): boolean =>
  !where ||
  Object.entries(where).every(([key, filter]) => {
    if (key === 'AND') return (Array.isArray(filter) ? filter : [filter]).every((clause) => matches(row, clause as Where));
    if (key === 'OR') return (filter as Where[]).some((clause) => matches(row, clause));
    if (RELATIONS.has(key)) return true;
    return satisfies(row[key], filter);
  });

const conversation = (id: string, type: string): Row => ({
  id, identifier: type === 'external' ? `ext_${id}` : `mee_${id}`, title: null, type, avatar: null, banner: null,
  isActive: true, communityId: null, encryptionMode: 'e2ee',
  lastMessageAt: new Date('2026-11-01T00:00:00.000Z'), createdAt: new Date('2026-11-01T00:00:00.000Z'),
  _count: { participants: 1 },
  participants: [{ id: `p-${id}`, userId: USER_ID, displayName: 'Moi', user: { id: USER_ID, username: 'me', displayName: 'Moi', firstName: 'M', lastName: 'Oi' } }],
  messages: [],
});

const ROWS: readonly Row[] = [conversation('c-direct', 'direct'), conversation('c-external', 'external')];

const makePrisma = () => ({
  user: { findMany: jest.fn(async () => [{ id: USER_ID }]) },
  conversation: { findMany: jest.fn(async (args: { where?: Where }) => ROWS.filter((row) => matches(row, args.where))) },
  participant: { findMany: jest.fn(async () => ROWS.map((row) => ({ conversationId: row.id }))) },
});

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const requiredAuth = async (req: { authContext?: unknown }) => {
    req.authContext = { type: 'registered', isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID } };
  };
  registerSearchRoutes(app, makePrisma() as never, requiredAuth);
  await app.ready();
  return app;
}

const search = async (headers: Record<string, string>) => {
  const app = await buildApp();
  const res = await app.inject({ method: 'GET', url: '/conversations/search?q=moi', headers });
  await app.close();
  expect(res.statusCode).toBe(200);
  return { found: (JSON.parse(res.body).data as Array<{ id: string }>).map((row) => row.id), vary: String(res.headers.vary ?? '') };
};

describe('GET /conversations/search et la conversation externe', () => {
  it('un ancien client, sans en-tête de capacité, ne la trouve pas', async () => {
    const { found } = await search({});

    expect(found).toEqual(['c-direct']);
  });

  it('un client qui annonce le jeton la trouve', async () => {
    const { found } = await search({ 'x-meeshy-capabilities': EXTERNAL_CONVERSATIONS_CAPABILITY });

    expect(found).toEqual(['c-direct', 'c-external']);
  });

  it('la réponse varie selon l’en-tête de capacité', async () => {
    const { vary } = await search({});

    expect(vary.toLowerCase()).toContain('x-meeshy-capabilities');
  });
});
