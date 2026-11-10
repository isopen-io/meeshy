/**
 * #17117 / #9223 — `GET /sync?collections=conversations` est la liste du
 * client iOS publié (`ConversationSyncEngine`) : comme `GET /conversations`,
 * elle ne sert une conversation `external` qu'au client qui annonce le jeton
 * `external-conversations`. Un client publié avant ce type la rendrait comme
 * un tête-à-tête sans interlocuteur (`toConversation` replie un type inconnu
 * sur `.direct`). Le double ÉVALUE `where.type` : c'est la forme SERVIE qui parle.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { EXTERNAL_CONVERSATIONS_CAPABILITY } from '@meeshy/shared/types/external-conversation';

const USER_ID = '507f1f77bcf86cd799439000';
const DIRECT_ID = '507f1f77bcf86cd799439a01';
const EXTERNAL_ID = '507f1f77bcf86cd799439a02';

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => async (req: FastifyRequest) => {
    (req as unknown as { authContext: unknown }).authContext = { userId: USER_ID, type: 'user', registeredUser: { role: 'USER' } };
  },
}));

jest.mock('../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));

import { syncRoutes } from '../../../routes/sync';

type Row = Record<string, unknown>;
type Where = { id?: { in?: string[] }; type?: { not?: string } };

const conversationRow = (id: string, type: string): Row => ({
  id, identifier: type === 'external' ? `ext_${id}` : `mee_${id}`, type, title: null, description: null,
  avatar: null, banner: null, communityId: null, isActive: true, closedAt: null, memberCount: type === 'external' ? 1 : 2,
  lastMessageAt: new Date('2026-11-02T10:00:00Z'), defaultWriteRole: 'everyone', isAnnouncementChannel: false,
  slowModeSeconds: 0, encryptionMode: 'e2ee', encryptionProtocol: 'signal_v3', autoTranslateEnabled: false,
  createdAt: new Date('2026-11-02T00:00:00Z'), updatedAt: new Date('2026-11-02T10:00:00Z'), participants: [],
});

const ROWS: readonly Row[] = [conversationRow(DIRECT_ID, 'direct'), conversationRow(EXTERNAL_ID, 'external')];

const conversationStore = () =>
  jest.fn(async (args: { where?: Where }) =>
    ROWS.filter((row) => {
      const where = args.where ?? {};
      if (where.id?.in && !where.id.in.includes(row.id as string)) return false;
      if (where.type?.not !== undefined && row.type === where.type.not) return false;
      return true;
    }));

const makePrisma = () => ({
  participant: {
    findMany: jest.fn(async (args: { where?: { OR?: unknown } }) =>
      args.where?.OR ? [] : [{ id: 'p-direct', conversationId: DIRECT_ID }, { id: 'p-external', conversationId: EXTERNAL_ID }]),
  },
  conversation: { findMany: conversationStore() },
  reaction: { findMany: jest.fn(async () => []) },
  message: { findMany: jest.fn(async () => []) },
  userMessageDeletion: { findMany: jest.fn(async () => []) },
  userConversationPreferences: { findMany: jest.fn(async () => []) },
  conversationShareLink: { findMany: jest.fn(async () => []) },
  userEventSeq: { findUnique: jest.fn(async () => null) },
  user: { findMany: jest.fn(async () => []) },
});

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', makePrisma() as never);
  app.decorate('redis', null as never);
  await app.register(syncRoutes);
  await app.ready();
  return app;
}

const sync = async (headers: Record<string, string>) => {
  const app = await buildApp();
  const res = await app.inject({ method: 'GET', url: '/sync?since=2026-11-01T00:00:00.000Z&collections=conversations', headers });
  await app.close();
  expect(res.statusCode).toBe(200);
  const added = res.json().data.collections.conversations.added as Array<{ id: string; type: string }>;
  return { added, vary: String(res.headers.vary ?? '') };
};

describe('GET /sync (conversations) et la conversation externe', () => {
  it('un ancien client, sans en-tête de capacité, ne la reçoit pas', async () => {
    const { added } = await sync({});

    expect(added.map((row) => row.id)).toEqual([DIRECT_ID]);
  });

  it('un client qui annonce d’autres jetons seulement ne la reçoit pas non plus', async () => {
    const { added } = await sync({ 'x-meeshy-capabilities': 'onboarding-age, link-device-binding' });

    expect(added.map((row) => row.type)).toEqual(['direct']);
  });

  it('un client qui annonce le jeton la reçoit, avec son type', async () => {
    const { added } = await sync({ 'x-meeshy-capabilities': EXTERNAL_CONVERSATIONS_CAPABILITY });

    expect(added.map((row) => [row.id, row.type])).toEqual([[DIRECT_ID, 'direct'], [EXTERNAL_ID, 'external']]);
  });

  it('la réponse varie selon l’en-tête de capacité', async () => {
    const { vary } = await sync({});

    expect(vary.toLowerCase()).toContain('x-meeshy-capabilities');
  });
});
