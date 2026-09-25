/**
 * La page membre de l'espace d'administration web (#7845) :
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
import {
  NOTIFICATION_PREFERENCE_DEFAULTS,
  PRIVACY_PREFERENCE_DEFAULTS,
  APPLICATION_PREFERENCE_DEFAULTS,
} from '@meeshy/shared/types/preferences';

const ADMIN_ID = '507f1f77bcf86cd799439001';
const TARGET_ID = '507f1f77bcf86cd799439777';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
}));

type AnyRecord = Record<string, unknown>;
type CallArgs = { where?: AnyRecord; select?: AnyRecord; orderBy?: AnyRecord; create?: AnyRecord; update?: AnyRecord; data?: AnyRecord };

type PrismaOpts = {
  target?: AnyRecord | null;
  counts?: Partial<Record<string, number>>;
  participants?: AnyRecord[];
  messages?: AnyRecord[];
  preferencesRow?: AnyRecord | null;
};

function createMockPrisma(opts: PrismaOpts = {}) {
  const target = opts.target === undefined ? { id: TARGET_ID, role: 'USER' } : opts.target;
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

const firstCall = (mock: jest.Mock): CallArgs => (mock.mock.calls[0] as unknown[])[0] as CallArgs;
const auditRows = (prisma: MockPrisma): AnyRecord[] =>
  (prisma.adminAuditLog.create as jest.Mock).mock.calls.map((c) => ((c as unknown[])[0] as { data: AnyRecord }).data);

// ─── GET /admin/users/:userId/stats ─────────────────────────────────────────

describe('GET /admin/users/:userId/stats', () => {
  const counts = {
    message: 42,
    participant: 7,
    'post.POST': 3,
    'post.REEL': 2,
    'post.STORY': 5,
    postComment: 11,
    reaction: 4,
    postReaction: 6,
    commentReaction: 1,
    messageAttachment: 9,
    postMedia: 8,
    friends: 12,
    pendingIn: 2,
    pendingOut: 1,
    reportsFiled: 3,
    reportsReceived: 4,
    userSession: 2,
    communityMember: 5,
  };

  it('sert un objet plat de nombres, réactions et médias sommés sur leurs sources', async () => {
    const prisma = createMockPrisma({
      counts,
      participants: [{ id: 'p1' }],
      messages: [{ id: 'm1' }],
    });
    const res = await call(prisma, 'ADMIN', 'GET', `/admin/users/${TARGET_ID}/stats`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: {
        messagesSent: 42,
        conversations: 7,
        posts: 3,
        reels: 2,
        stories: 5,
        comments: 11,
        reactionsGiven: 11,
        mediaUploaded: 17,
        friends: 12,
        pendingFriendRequestsIn: 2,
        pendingFriendRequestsOut: 1,
        reportsFiled: 3,
        reportsReceived: 4,
        activeSessions: 2,
        communities: 5,
      },
    });
  });

  it('exclut les lignes supprimées, les participations inactives et les sessions expirées', async () => {
    const prisma = createMockPrisma({ counts });
    await call(prisma, 'ADMIN', 'GET', `/admin/users/${TARGET_ID}/stats`);
    expect(firstCall(prisma.message.count as jest.Mock).where).toEqual({ sender: { userId: TARGET_ID }, deletedAt: null });
    expect(firstCall(prisma.participant.count as jest.Mock).where).toEqual({ userId: TARGET_ID, isActive: true });
    expect(firstCall(prisma.post.count as jest.Mock).where).toEqual(expect.objectContaining({ deletedAt: { isSet: false } }));
    expect(firstCall(prisma.postComment.count as jest.Mock).where).toEqual({ authorId: TARGET_ID, deletedAt: { isSet: false } });
    expect(firstCall(prisma.communityMember.count as jest.Mock).where).toEqual({ userId: TARGET_ID, isActive: true });
    const sessions = firstCall(prisma.userSession.count as jest.Mock).where as AnyRecord;
    expect(sessions).toEqual(expect.objectContaining({ userId: TARGET_ID, isValid: true }));
    expect((sessions.expiresAt as { gt: Date }).gt).toBeInstanceOf(Date);
  });

  it('compte les signalements reçus sur les MESSAGES de la cible, et 0 sans message', async () => {
    const withMessages = createMockPrisma({ counts, participants: [{ id: 'p1' }], messages: [{ id: 'm1' }, { id: 'm2' }] });
    await call(withMessages, 'ADMIN', 'GET', `/admin/users/${TARGET_ID}/stats`);
    const reportCalls = (withMessages.report.count as jest.Mock).mock.calls.map((c) => ((c as unknown[])[0] as CallArgs).where);
    expect(reportCalls).toContainEqual({ reportedType: 'message', reportedEntityId: { in: ['m1', 'm2'] } });

    const withoutParticipation = createMockPrisma({ counts });
    const res = await call(withoutParticipation, 'ADMIN', 'GET', `/admin/users/${TARGET_ID}/stats`);
    expect(res.json().data.reportsReceived).toBe(0);
    expect(withoutParticipation.message.findMany).not.toHaveBeenCalled();
  });

  it('rend reportsFiled à null pour AUDIT, qui n\'a pas canModerateContent, sans lire la table', async () => {
    const prisma = createMockPrisma({ counts });
    const res = await call(prisma, 'AUDIT', 'GET', `/admin/users/${TARGET_ID}/stats`);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.reportsFiled).toBeNull();
    const reporterCalls = (prisma.report.count as jest.Mock).mock.calls.filter(
      (c) => ((c as unknown[])[0] as CallArgs).where?.reporterId !== undefined
    );
    expect(reporterCalls).toHaveLength(0);
  });

  it('refuse un rôle sans canViewUsers (403)', async () => {
    const prisma = createMockPrisma({ counts });
    const res = await call(prisma, 'USER', 'GET', `/admin/users/${TARGET_ID}/stats`);
    expect(res.statusCode).toBe(403);
    expect(prisma.message.count).not.toHaveBeenCalled();
  });

  it('refuse un identifiant qui n\'est pas un ObjectId (400) avant toute lecture', async () => {
    const prisma = createMockPrisma({ counts });
    const res = await call(prisma, 'ADMIN', 'GET', '/admin/users/not-an-id/stats');
    expect(res.statusCode).toBe(400);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rend 404 sur un membre introuvable', async () => {
    const prisma = createMockPrisma({ target: null });
    const res = await call(prisma, 'ADMIN', 'GET', `/admin/users/${TARGET_ID}/stats`);
    expect(res.statusCode).toBe(404);
    expect(prisma.message.count).not.toHaveBeenCalled();
  });
});

// ─── GET /admin/users/:userId/preferences ───────────────────────────────────

describe('GET /admin/users/:userId/preferences', () => {
  it('sert les sept catégories, le stocké comblé par les défauts', async () => {
    const prisma = createMockPrisma({
      preferencesRow: { privacy: { showOnlineStatus: false }, notification: { dndEnabled: true } },
    });
    const res = await call(prisma, 'MODERATOR', 'GET', `/admin/users/${TARGET_ID}/preferences`);
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(Object.keys(data).sort()).toEqual(
      ['application', 'audio', 'document', 'message', 'notification', 'privacy', 'video']
    );
    expect(data.privacy).toEqual({ ...PRIVACY_PREFERENCE_DEFAULTS, showOnlineStatus: false });
    expect(data.notification).toEqual({ ...NOTIFICATION_PREFERENCE_DEFAULTS, dndEnabled: true });
    expect(data.application).toEqual(APPLICATION_PREFERENCE_DEFAULTS);
  });

  it('trace la consultation (VIEW_USER, surface preferences)', async () => {
    const prisma = createMockPrisma();
    await call(prisma, 'ADMIN', 'GET', `/admin/users/${TARGET_ID}/preferences`);
    const [row] = auditRows(prisma);
    expect(row).toEqual(expect.objectContaining({ userId: TARGET_ID, adminId: ADMIN_ID, action: 'VIEW_USER' }));
    expect(JSON.parse(row.metadata as string)).toEqual({ surface: 'preferences' });
  });

  it('refuse sans canViewUsers (403), un id invalide (400), un membre introuvable (404)', async () => {
    const denied = createMockPrisma();
    expect((await call(denied, 'ANALYST', 'GET', `/admin/users/${TARGET_ID}/preferences`)).statusCode).toBe(403);

    const badId = createMockPrisma();
    expect((await call(badId, 'ADMIN', 'GET', '/admin/users/xyz/preferences')).statusCode).toBe(400);

    const missing = createMockPrisma({ target: null });
    expect((await call(missing, 'ADMIN', 'GET', `/admin/users/${TARGET_ID}/preferences`)).statusCode).toBe(404);
    expect(auditRows(missing)).toHaveLength(0);
  });
});

// ─── PATCH /admin/users/:userId/preferences/:category ───────────────────────

describe('PATCH /admin/users/:userId/preferences/:category', () => {
  const url = (category: string) => `/admin/users/${TARGET_ID}/preferences/${category}`;

  it('fusionne le corps partiel sur l\'état complet et sert la catégorie complétée', async () => {
    const prisma = createMockPrisma({ preferencesRow: { notification: { soundEnabled: false } } });
    const res = await call(prisma, 'ADMIN', 'PATCH', url('notification'), { dndEnabled: true, dndStartTime: '23:00' });
    expect(res.statusCode).toBe(200);
    const upsert = firstCall(prisma.userPreferences.upsert as jest.Mock);
    expect(upsert.where).toEqual({ userId: TARGET_ID });
    expect(upsert.update).toEqual({
      notification: { ...NOTIFICATION_PREFERENCE_DEFAULTS, soundEnabled: false, dndEnabled: true, dndStartTime: '23:00' },
    });
    expect(res.json().data).toEqual({
      category: 'notification',
      preferences: { ...NOTIFICATION_PREFERENCE_DEFAULTS, soundEnabled: false, dndEnabled: true, dndStartTime: '23:00' },
    });
  });

  it('écrit une ligne d\'audit UPDATE_PREFERENCES avec les seules clés changées', async () => {
    const prisma = createMockPrisma();
    await call(prisma, 'ADMIN', 'PATCH', url('notification'), { dndEnabled: true, pushEnabled: true });
    const [row] = auditRows(prisma);
    expect(row).toEqual(expect.objectContaining({ userId: TARGET_ID, adminId: ADMIN_ID, action: 'UPDATE_PREFERENCES' }));
    expect(JSON.parse(row.changes as string)).toEqual({ 'notification.dndEnabled': { before: false, after: true } });
    expect(JSON.parse(row.metadata as string)).toEqual({ category: 'notification', keys: ['dndEnabled'] });
  });

  it('annonce la catégorie écrite aux appareils du membre (preferences:updated sur sa room)', async () => {
    const prisma = createMockPrisma();
    await call(prisma, 'ADMIN', 'PATCH', url('notification'), { dndEnabled: true });
    expect(prisma.socket.emitted).toEqual([
      { room: `user:${TARGET_ID}`, event: 'user:preferences-updated', payload: { userId: TARGET_ID, category: 'notification' } },
    ]);
  });

  it('retire les lignes héritées et purge après une écriture de privacy', async () => {
    const prisma = createMockPrisma();
    const res = await call(prisma, 'ADMIN', 'PATCH', url('privacy'), { showLastSeen: false });
    expect(res.statusCode).toBe(200);
    expect(prisma.userPreference.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: TARGET_ID }) })
    );
  });

  it('refuse d\'écrire la famille chiffrement au nom du membre (403), sans rien écrire', async () => {
    const prisma = createMockPrisma();
    const res = await call(prisma, 'BIGBOSS', 'PATCH', url('privacy'), { encryptionPreference: 'disabled', showLastSeen: false });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual(expect.objectContaining({ success: false, error: 'ADMIN_READ_ONLY_PREFERENCE' }));
    expect(prisma.userPreferences.upsert).not.toHaveBeenCalled();
    expect(auditRows(prisma)).toHaveLength(0);
  });

  it('refuse d\'allumer une fonction dont le membre n\'a pas donné le consentement (403)', async () => {
    const prisma = createMockPrisma();
    const res = await call(prisma, 'ADMIN', 'PATCH', url('audio'), { transcriptionEnabled: true });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual(expect.objectContaining({ error: 'CONSENT_REQUIRED' }));
    expect(prisma.userPreferences.upsert).not.toHaveBeenCalled();
  });

  it('refuse une catégorie inconnue (400)', async () => {
    const prisma = createMockPrisma();
    const res = await call(prisma, 'ADMIN', 'PATCH', url('encryption'), { encryptionPreference: 'always' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(expect.objectContaining({ error: 'UNKNOWN_CATEGORY' }));
    expect(prisma.userPreferences.upsert).not.toHaveBeenCalled();
  });

  it('refuse un corps invalide : clé inconnue, valeur hors énumération, corps vide (400)', async () => {
    for (const body of [{ notAKey: true }, { dndStartTime: '25:99' }, {}]) {
      const prisma = createMockPrisma();
      const res = await call(prisma, 'ADMIN', 'PATCH', url('notification'), body);
      expect(res.statusCode).toBe(400);
      expect(prisma.userPreferences.upsert).not.toHaveBeenCalled();
    }
  });

  it('nomme le champ refusé dans `issues`', async () => {
    const prisma = createMockPrisma();
    const res = await call(prisma, 'ADMIN', 'PATCH', url('application'), { theme: 'purple' });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: ['theme'] })]));
  });

  it('refuse un rôle sans canUpdateUsers (MODERATOR, 403)', async () => {
    const prisma = createMockPrisma();
    const res = await call(prisma, 'MODERATOR', 'PATCH', url('notification'), { dndEnabled: true });
    expect(res.statusCode).toBe(403);
    expect(prisma.userPreferences.upsert).not.toHaveBeenCalled();
  });

  it('refuse d\'écrire les réglages d\'un rang égal ou supérieur (ADMIN sur BIGBOSS, 403)', async () => {
    const prisma = createMockPrisma({ target: { id: TARGET_ID, role: 'BIGBOSS' } });
    const res = await call(prisma, 'ADMIN', 'PATCH', url('notification'), { dndEnabled: true });
    expect(res.statusCode).toBe(403);
    expect(prisma.userPreferences.upsert).not.toHaveBeenCalled();
  });

  it('refuse un id invalide (400) avant la garde de hiérarchie', async () => {
    const prisma = createMockPrisma();
    const res = await call(prisma, 'ADMIN', 'PATCH', '/admin/users/nope/preferences/notification', { dndEnabled: true });
    expect(res.statusCode).toBe(400);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

// ─── GET /admin/users/:userId/conversations — tri ───────────────────────────

describe('GET /admin/users/:userId/conversations — sortBy / sortOrder', () => {
  it('garde le tri historique par défaut (lastMessageAt desc)', async () => {
    const prisma = createMockPrisma();
    const res = await call(prisma, 'ADMIN', 'GET', `/admin/users/${TARGET_ID}/conversations`);
    expect(res.statusCode).toBe(200);
    expect(firstCall(prisma.conversation.findMany as jest.Mock).orderBy).toEqual({ lastMessageAt: 'desc' });
  });

  it('trie par la clé et le sens demandés, filtre par type', async () => {
    const prisma = createMockPrisma();
    await call(prisma, 'ADMIN', 'GET', `/admin/users/${TARGET_ID}/conversations?sortBy=createdAt&sortOrder=asc&type=group`);
    const args = firstCall(prisma.conversation.findMany as jest.Mock);
    expect(args.orderBy).toEqual({ createdAt: 'asc' });
    expect(args.where).toEqual(expect.objectContaining({ type: 'group' }));
  });

  it('refuse une clé ou un sens hors liste blanche (400)', async () => {
    for (const query of ['sortBy=title', 'sortOrder=sideways']) {
      const prisma = createMockPrisma();
      const res = await call(prisma, 'ADMIN', 'GET', `/admin/users/${TARGET_ID}/conversations?${query}`);
      expect(res.statusCode).toBe(400);
      expect(prisma.conversation.findMany).not.toHaveBeenCalled();
    }
  });
});
