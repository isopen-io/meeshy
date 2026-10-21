/**
 * #10205 — `GET /sync` lu par une session INVITÉE (sans compte Meeshy) : la
 * collection `conversations` ne porte ni effectif ni membres, et la
 * collection `participants` ne rend que la ligne de l'invité lui-même —
 * jamais le roster des autres. Même harnais que `sync-collections.test.ts`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

const USER_ID = '507f1f77bcf86cd799439000';
const CONV_MINE = '507f1f77bcf86cd799439a01';
const CONV_OTHER = '507f1f77bcf86cd799439b02'; // le lecteur n'y participe PAS

type TestAuthContext = {
  userId?: string;
  type?: 'user' | 'anonymous';
  participantId?: string;
  registeredUser?: { role?: string } | null;
};

let mockAuthContext: TestAuthContext = { userId: USER_ID, type: 'user' };

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: (_prisma: unknown, _options: unknown) =>
    async (req: FastifyRequest) => {
      (req as unknown as { authContext: TestAuthContext }).authContext = mockAuthContext;
    },
}));

// Le rate-limiter réel n'a pas sa place ici — chaque `describe` fait plusieurs
// requêtes et ce fichier ne prouve pas le débit (`sync-rate-limit.test.ts` s'en
// charge). Sans ce mock, les 60/min réels restent largement sous ce que ce
// fichier appelle — mais le geste documente l'intention et isole les deux
// préoccupations, comme `directory/presence.test.ts` le fait déjà.
jest.mock('../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));

import { syncRoutes } from '../../../routes/sync';

type Row = Record<string, unknown>;

/** Un magasin qui HONORE `where.id.in` (ou `where.conversationId.in`) — la
 *  seule façon qu'un test de RLS ait une chance de faire fuir `CONV_OTHER`
 *  s'il y a un défaut, plutôt que de rendre un jeu déjà correct. */
function scopedStore(rows: Row[], idKey: 'id' | 'conversationId') {
  return jest.fn<any>(async (args: any) => {
    const inSet: string[] | undefined = args?.where?.[idKey]?.in;
    const floor: Date | undefined = args?.where?.updatedAt?.gt ?? args?.where?.createdAt?.gt;
    return rows.filter((r) => {
      if (inSet && !inSet.includes(r[idKey] as string)) return false;
      if (floor && !(r.updatedAt as Date > floor)) return false;
      return true;
    });
  });
}

/**
 * `participant.findMany` sert TROIS requêtes distinctes selon la collection
 * (appartenance RLS, départs de `conversations`, roster + départs de
 * `participants`) — un double NAÏF qui rend toujours la même ligne fait fuiter
 * un `leftAt: undefined` (jamais produit par Prisma, qui rend `null`) dans une
 * requête censée porter un `where.OR` sur les trois colonnes de départ. Le
 * discriminant est la FORME du `where`, comme `directory/presence.test.ts` le
 * fait déjà pour un autre couple de requêtes sur la même table.
 */
function defaultParticipantFindMany() {
  return jest.fn<any>().mockImplementation((args: any) => {
    if (args?.where?.OR) return Promise.resolve([]); // aucun départ par défaut
    return Promise.resolve([{ id: 'p-mine', conversationId: CONV_MINE }]);
  });
}

function makePrisma(over: Partial<Record<string, unknown>> = {}) {
  return {
    participant: { findMany: defaultParticipantFindMany() },
    conversation: { findMany: jest.fn<any>().mockResolvedValue([]) },
    reaction: { findMany: jest.fn<any>().mockResolvedValue([]) },
    message: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userMessageDeletion: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
    conversationShareLink: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userEventSeq: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    user: { findMany: jest.fn<any>().mockResolvedValue([]) },
    ...over,
  } as any;
}

async function buildApp(prisma: any, authContext: TestAuthContext = { userId: USER_ID, type: 'user' }): Promise<FastifyInstance> {
  mockAuthContext = authContext;
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as never);
  app.decorate('redis', null as never);
  await app.register(syncRoutes);
  await app.ready();
  return app;
}

const SINCE = '2026-07-01T00:00:00.000Z';
const GUEST_ID = '507f1f77bcf86cd799439c03';
const GUEST = { userId: GUEST_ID, participantId: GUEST_ID, type: 'anonymous' as const };

const conversationRow = () => ({
  id: CONV_MINE, identifier: 'id-mine', type: 'group', title: 'T', description: null,
  avatar: null, banner: null, communityId: null, isActive: true, closedAt: null,
  memberCount: 42, lastMessageAt: new Date('2026-07-02T10:00:00Z'), defaultWriteRole: 'everyone',
  isAnnouncementChannel: false, slowModeSeconds: 0, encryptionMode: null,
  encryptionProtocol: null, autoTranslateEnabled: true,
  createdAt: new Date('2026-07-02T00:00:00Z'), updatedAt: new Date('2026-07-02T10:00:00Z'),
  participants: [{ id: 'p-other', userId: '507f1f77bcf86cd7994390aa', displayName: 'Autre' }],
});

const rosterRow = (id: string, userId: string | null) => ({
  id, conversationId: CONV_MINE, userId, type: userId ? 'user' : 'anonymous', displayName: id,
  avatar: null, role: 'member', language: 'fr', nickname: null, isActive: true, isOnline: false,
  lastActiveAt: null, joinedAt: new Date('2026-07-03T00:00:00Z'), permissions: null, user: null,
});

/** Appartenance, roster et départs, discriminés par la FORME du `where` ; le roster honore `where.id`. */
const guestParticipantStore = () => jest.fn<any>().mockImplementation((args: any) => {
  const where = args?.where ?? {};
  if (where.OR) return Promise.resolve([]);
  if (where.joinedAt || where.isActive) {
    const rows = [rosterRow(GUEST_ID, null), rosterRow('p-other', '507f1f77bcf86cd7994390aa')];
    return Promise.resolve(where.id ? rows.filter((r) => r.id === where.id) : rows);
  }
  return Promise.resolve([{ id: GUEST_ID, conversationId: CONV_MINE }]);
});

const syncAs = async (collection: string, authContext: Record<string, unknown>) => {
  const prisma = makePrisma({
    participant: { findMany: guestParticipantStore() },
    conversation: { findMany: jest.fn<any>().mockResolvedValue([conversationRow()]) },
  });
  const app = await buildApp(prisma, authContext as never);
  const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=${collection}` });
  await app.close();
  expect(res.statusCode).toBe(200);
  return res.json().data.collections[collection] as { added: Record<string, unknown>[] };
};

describe('#10205 — GET /sync lu par un invité', () => {
  it('la collection conversations ne porte ni effectif ni membres', async () => {
    const { added } = await syncAs('conversations', GUEST);
    expect(added).toHaveLength(1);
    expect(added[0]).not.toHaveProperty('memberCount');
    expect(added[0].participants ?? []).toEqual([]);
  });

  it('la collection participants ne rend que la ligne de l’invité', async () => {
    const { added } = await syncAs('participants', GUEST);
    expect(added.map((p) => p.id)).toEqual([GUEST_ID]);
  });

  it('un compte Meeshy garde l’effectif', async () => {
    const { added } = await syncAs('conversations', { userId: USER_ID, type: 'user', registeredUser: { role: 'USER' } });
    expect(added[0].memberCount).toBe(42);
  });
});
