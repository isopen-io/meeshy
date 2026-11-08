/**
 * « Créer des Connaissances automatiquement » vue par l'administration (#14406,
 * audit #14464 C1 et C7) : la préférence est LISIBLE, jamais écrite au nom d'un
 * membre — un administrateur ne lève ni une opposition (RGPD art. 21) ni le
 * défaut protecteur d'un mineur. La valeur servie est la valeur EFFECTIVE.
 *
 * Harnais repris de `admin-user-member-page.test.ts`. La page membre de l'espace d'administration web (#7845) :
 *
 *   GET   /admin/users/:userId/stats                   — compteurs de la fiche
 *   GET   /admin/users/:userId/preferences             — sept catégories, défauts appliqués
 *   PATCH /admin/users/:userId/preferences/:category   — écriture partielle, tracée
 *   GET   /admin/users/:userId/conversations           — tri `sortBy` / `sortOrder`
 *
 * Harnais : VRAIS `permissionsService`, `UserAuditService`, registre des
 * préférences et `ConsentValidationService` — seul Prisma est doublé. Les
 * témoins assertent sur la REQUÊTE envoyée à Prisma et sur la VALEUR SERVIE
 * (`app.inject`, donc à travers le sérialiseur).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const ADMIN_ID = '507f1f77bcf86cd799439001';
const TARGET_ID = '507f1f77bcf86cd799439777';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
}));

type AnyRecord = Record<string, unknown>;

type PrismaOpts = {
  target?: AnyRecord | null;
  counts?: Partial<Record<string, number>>;
  participants?: AnyRecord[];
  messages?: AnyRecord[];
  preferencesRow?: AnyRecord | null;
};

function createMockPrisma(opts: PrismaOpts = {}) {
  const target = opts.target === undefined ? { id: TARGET_ID, role: 'USER', birthDate: null } : opts.target;
  const count = (name: string) => jest.fn(async () => opts.counts?.[name] ?? 0);
  let row: AnyRecord | null = opts.preferencesRow ?? null;
  const emitted: Array<{ room: string; event: string; payload: unknown }> = [];
  return {
    socket: {
      emitted,
      io: { to: (room: string) => ({ emit: (event: string, payload: unknown) => emitted.push({ room, event, payload }) }) },
    },
    user: { findUnique: jest.fn(async () => target) },
    message: { count: count('message'), findMany: jest.fn(async () => opts.messages ?? []) },
    participant: { count: count('participant'), findMany: jest.fn(async () => opts.participants ?? []) },
    post: {
      count: jest.fn(async (args: { where: { type: string } }) => opts.counts?.[`post.${args.where.type}`] ?? 0),
    },
    postComment: { count: count('postComment') },
    reaction: { count: count('reaction') },
    postReaction: { count: count('postReaction') },
    commentReaction: { count: count('commentReaction') },
    messageAttachment: { count: count('messageAttachment') },
    postMedia: { count: count('postMedia') },
    friendRequest: {
      count: jest.fn(async (args: { where: AnyRecord }) => {
        if (args.where.status === 'accepted') return opts.counts?.friends ?? 0;
        return args.where.receiverId ? opts.counts?.pendingIn ?? 0 : opts.counts?.pendingOut ?? 0;
      }),
    },
    report: {
      count: jest.fn(async (args: { where: AnyRecord }) =>
        args.where.reporterId ? opts.counts?.reportsFiled ?? 0 : opts.counts?.reportsReceived ?? 0),
    },
    userSession: { count: count('userSession') },
    communityMember: { count: count('communityMember') },
    conversation: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
    userPreferences: {
      findUnique: jest.fn(async () => row),
      findMany: jest.fn(async () => (row ? [{ userId: TARGET_ID, ...row }] : [])),
      upsert: jest.fn(async (args: { update: AnyRecord }) => {
        row = { ...(row ?? {}), ...args.update };
        return { id: 'prefs-1', ...row };
      }),
    },
    userPreference: {
      findMany: jest.fn(async () => []),
      deleteMany: jest.fn(async (_args: unknown) => ({ count: 0 })),
    },
    adminAuditLog: {
      create: jest.fn(async (args: { data: AnyRecord }) => ({ id: 'audit-1', createdAt: new Date(), ...args.data })),
    },
  };
}

type MockPrisma = ReturnType<typeof createMockPrisma>;

async function buildApp(prisma: MockPrisma, role: string): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  (app as unknown as { prisma: PrismaClient }).prisma = prisma as unknown as PrismaClient;
  (app as unknown as { socketIOHandler: unknown }).socketIOHandler = { io: prisma.socket.io };
  app.decorate('authenticate', async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    (request as unknown as AnyRecord).authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: ADMIN_ID,
      registeredUser: { id: ADMIN_ID, role },
      hasFullAccess: true,
    };
  });
  const { userAdminRoutes } = await import('../../../../routes/admin/users');
  await app.register(userAdminRoutes, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

async function call(prisma: MockPrisma, role: string, method: 'GET' | 'PATCH', url: string, payload?: unknown) {
  const app = await buildApp(prisma, role);
  const res = await app.inject({ method, url: `/api/v1${url}`, ...(payload === undefined ? {} : { payload: payload as AnyRecord }) });
  await app.close();
  return res;
}

const auditRows = (prisma: MockPrisma): AnyRecord[] =>
  (prisma.adminAuditLog.create as jest.Mock).mock.calls.map((c) => ((c as unknown[])[0] as { data: AnyRecord }).data);


const MINOR = new Date('2012-01-01T00:00:00Z');
const prefsUrl = `/admin/users/${TARGET_ID}/preferences`;

describe('PATCH /admin/users/:userId/preferences/privacy — autoAcquaintance en lecture seule', () => {
  it.each([true, false])('autoAcquaintance: %p est refusé (403), sans rien écrire ni tracer', async (value) => {
    const prisma = createMockPrisma({ preferencesRow: { privacy: { showOnlineStatus: true, autoAcquaintance: !value } } });

    const res = await call(prisma, 'ADMIN', 'PATCH', `${prefsUrl}/privacy`, { autoAcquaintance: value });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual(expect.objectContaining({ success: false, error: 'ADMIN_READ_ONLY_PREFERENCE' }));
    expect(prisma.userPreferences.upsert).not.toHaveBeenCalled();
    expect(auditRows(prisma)).toHaveLength(0);
  });

  it('un BIGBOSS non plus', async () => {
    const prisma = createMockPrisma();
    const res = await call(prisma, 'BIGBOSS', 'PATCH', `${prefsUrl}/privacy`, { autoAcquaintance: true, showLastSeen: false });
    expect(res.statusCode).toBe(403);
    expect(prisma.userPreferences.upsert).not.toHaveBeenCalled();
  });
});

describe('GET /admin/users/:userId/preferences — la valeur EFFECTIVE de autoAcquaintance', () => {
  const served = async (opts: PrismaOpts) => (await call(createMockPrisma(opts), 'ADMIN', 'GET', prefsUrl)).json().data.privacy.autoAcquaintance;

  it('sans choix : activée pour un âge inconnu ou un majeur, désactivée pour un mineur déclaré', async () => {
    expect(await served({})).toBe(true);
    expect(await served({ target: { id: TARGET_ID, role: 'USER', birthDate: new Date('1990-01-01T00:00:00Z') } })).toBe(true);
    expect(await served({ target: { id: TARGET_ID, role: 'USER', birthDate: MINOR } })).toBe(false);
  });

  it('le choix stocké l’emporte', async () => {
    expect(await served({ preferencesRow: { privacy: { autoAcquaintance: false } } })).toBe(false);
    expect(await served({ target: { id: TARGET_ID, role: 'USER', birthDate: MINOR }, preferencesRow: { privacy: { autoAcquaintance: true } } })).toBe(true);
  });
});

describe('PATCH admin — la réponse sert la valeur EFFECTIVE (contre-audit #14464 N5)', () => {
  it('mineur sans choix : le GET et la réponse du PATCH d’un réglage voisin disent tous deux false', async () => {
    const target = { id: TARGET_ID, role: 'USER', birthDate: MINOR };
    const got = (await call(createMockPrisma({ target }), 'ADMIN', 'GET', prefsUrl)).json().data.privacy.autoAcquaintance;
    const patched = (await call(createMockPrisma({ target }), 'ADMIN', 'PATCH', `${prefsUrl}/privacy`, { showLastSeen: false })).json().data.preferences.autoAcquaintance;
    expect({ got, patched }).toEqual({ got: false, patched: false });
  });
});
