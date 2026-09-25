/**
 * La fiche utilisateur de l'espace d'administration web (#7873, #7845) :
 *
 *   GET /admin/users                        — filtres booléens / rôle / dates
 *                                             COERCÉS avant d'atteindre Prisma
 *   GET /admin/users/:userId/communities    — appartenances, paginées
 *   GET /admin/users/:userId/voice-profile  — métadonnées du profil vocal + consentements
 *
 * Harnais : VRAIS `permissionsService`, `UserManagementService`,
 * `sanitizationService` et `UserAuditService` — seul Prisma est doublé. Les
 * témoins assertent sur la REQUÊTE envoyée à Prisma (projection, `where`,
 * `orderBy`) et sur la VALEUR SERVIE (`app.inject`), jamais sur un double de
 * service qui accepterait n'importe quoi.
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
type CallArgs = { where?: AnyRecord; select?: AnyRecord; orderBy?: AnyRecord; skip?: number; take?: number };

type PrismaOpts = {
  users?: AnyRecord[];
  target?: AnyRecord | null;
  memberships?: AnyRecord[];
  membershipsCount?: number;
  voiceModel?: AnyRecord | null;
};

function createMockPrisma(opts: PrismaOpts) {
  const target = opts.target === undefined ? { id: TARGET_ID } : opts.target;
  return {
    user: {
      findUnique: jest.fn(async () => target),
      findMany: jest.fn(async () => opts.users ?? []),
      count: jest.fn(async () => opts.users?.length ?? 0),
    },
    communityMember: {
      findMany: jest.fn(async () => opts.memberships ?? []),
      count: jest.fn(async () => opts.membershipsCount ?? (opts.memberships?.length ?? 0)),
    },
    userVoiceModel: {
      findUnique: jest.fn(async () => (opts.voiceModel === undefined ? null : opts.voiceModel)),
    },
    adminAuditLog: {
      create: jest.fn(async (args: { data: AnyRecord }) => ({ id: 'audit-1', ...args.data })),
    },
  };
}

type MockPrisma = ReturnType<typeof createMockPrisma>;

async function buildApp(prisma: MockPrisma, role: string): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  (app as unknown as { prisma: PrismaClient }).prisma = prisma as unknown as PrismaClient;
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

async function get(prisma: MockPrisma, role: string, url: string) {
  const app = await buildApp(prisma, role);
  const res = await app.inject({ method: 'GET', url: `/api/v1${url}` });
  await app.close();
  return res;
}

const firstCall = (mock: jest.Mock): CallArgs => (mock.mock.calls[0] as unknown[])[0] as CallArgs;

// ─── GET /admin/users — les filtres arrivent en CHAÎNES ─────────────────────

describe('GET /admin/users — coercition des filtres de la querystring', () => {
  it('traduit "true"/"false" en booléens avant Prisma (jamais la chaîne "false", vraie en JS)', async () => {
    const prisma = createMockPrisma({});
    const res = await get(prisma, 'ADMIN',
      '/admin/users?isActive=false&emailVerified=false&phoneVerified=true&twoFactorEnabled=false');
    expect(res.statusCode).toBe(200);
    const { where } = firstCall(prisma.user.findMany as jest.Mock);
    expect(where).toEqual(expect.objectContaining({
      isActive: false,
      emailVerifiedAt: null,
      phoneVerifiedAt: { not: null },
      twoFactorEnabledAt: null,
    }));
  });

  it('ignore une valeur booléenne qui n\'est ni "true" ni "false"', async () => {
    const prisma = createMockPrisma({});
    await get(prisma, 'ADMIN', '/admin/users?isActive=maybe&emailVerified=1');
    const { where } = firstCall(prisma.user.findMany as jest.Mock);
    expect(where).not.toHaveProperty('isActive');
    expect(where).not.toHaveProperty('emailVerifiedAt');
  });

  it('ne passe à Prisma qu\'un rôle de la liste blanche', async () => {
    const accepted = createMockPrisma({});
    await get(accepted, 'ADMIN', '/admin/users?role=MODERATOR');
    expect(firstCall(accepted.user.findMany as jest.Mock).where).toEqual(expect.objectContaining({ role: 'MODERATOR' }));

    const rejected = createMockPrisma({});
    await get(rejected, 'ADMIN', '/admin/users?role=superuser');
    expect(firstCall(rejected.user.findMany as jest.Mock).where).not.toHaveProperty('role');
  });

  it('ignore une date illisible au lieu de faire tomber la requête en 500', async () => {
    const prisma = createMockPrisma({});
    const res = await get(prisma, 'ADMIN', '/admin/users?createdAfter=not-a-date&createdBefore=2026-09-01T00:00:00.000Z');
    expect(res.statusCode).toBe(200);
    const { where } = firstCall(prisma.user.findMany as jest.Mock);
    expect(where).toEqual(expect.objectContaining({ createdAt: { lte: new Date('2026-09-01T00:00:00.000Z') } }));
  });

  it('trie par la clé demandée (sortBy=username ⇒ orderBy.username)', async () => {
    const prisma = createMockPrisma({});
    await get(prisma, 'ADMIN', '/admin/users?sortBy=username&sortOrder=asc');
    expect(firstCall(prisma.user.findMany as jest.Mock).orderBy).toEqual({ username: 'asc' });
  });

  it('retombe sur createdAt quand un MODERATOR trie par lastActiveAt (l\'ORDRE révèle la présence)', async () => {
    const prisma = createMockPrisma({});
    await get(prisma, 'MODERATOR', '/admin/users?sortBy=lastActiveAt&sortOrder=asc');
    expect(firstCall(prisma.user.findMany as jest.Mock).orderBy).toEqual({ createdAt: 'asc' });
  });

  describe('les lignes servies portent lastActiveAt, masqué sans canViewPresence', () => {
    const row = {
      id: TARGET_ID,
      username: 'alice',
      role: 'USER',
      isActive: true,
      isOnline: true,
      lastActiveAt: new Date('2026-09-20T10:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      email: 'alice@example.com',
    };

    it('ADMIN lit la présence réelle', async () => {
      const res = await get(createMockPrisma({ users: [row] }), 'ADMIN', '/admin/users');
      const [user] = res.json().data.users;
      expect(user.isOnline).toBe(true);
      expect(user.lastActiveAt).toBe('2026-09-20T10:00:00.000Z');
    });

    it('MODERATOR la lit masquée (isOnline=false, lastActiveAt=null)', async () => {
      const res = await get(createMockPrisma({ users: [row] }), 'MODERATOR', '/admin/users');
      const [user] = res.json().data.users;
      expect(user.id).toBe(TARGET_ID);
      expect(user.isOnline).toBe(false);
      expect(user.lastActiveAt).toBeNull();
    });
  });
});

// ─── GET /admin/users/:userId/communities ───────────────────────────────────

describe('GET /admin/users/:userId/communities', () => {
  const membership = {
    id: 'cm-1',
    role: 'admin',
    joinedAt: new Date('2026-05-01T00:00:00.000Z'),
    isActive: true,
    leftAt: null,
    community: {
      id: 'com-1',
      identifier: 'mshy_paris',
      name: 'Paris',
      avatar: null,
      isPrivate: true,
      isActive: true,
      createdBy: TARGET_ID,
      createdAt: new Date('2026-04-01T00:00:00.000Z'),
      _count: { members: 12 },
    },
  };

  it('refuse un rôle sans canViewUsers (USER ⇒ 403)', async () => {
    const res = await get(createMockPrisma({}), 'USER', `/admin/users/${TARGET_ID}/communities`);
    expect(res.statusCode).toBe(403);
  });

  it('rend 404 quand la cible n\'existe pas', async () => {
    const res = await get(createMockPrisma({ target: null }), 'ADMIN', `/admin/users/${TARGET_ID}/communities`);
    expect(res.statusCode).toBe(404);
  });

  it('sert chaque communauté avec l\'appartenance de la cible, memberCount actif et isCreator', async () => {
    const other = {
      ...membership,
      id: 'cm-2',
      role: 'member',
      isActive: false,
      leftAt: new Date('2026-06-01T00:00:00.000Z'),
      community: { ...membership.community, id: 'com-2', createdBy: ADMIN_ID, _count: { members: 3 } },
    };
    const res = await get(createMockPrisma({ memberships: [membership, other], membershipsCount: 7 }),
      'MODERATOR', `/admin/users/${TARGET_ID}/communities?offset=0&limit=2`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pagination).toEqual({ total: 7, offset: 0, limit: 2, hasMore: true });
    expect(body.data).toEqual([
      {
        id: 'com-1',
        identifier: 'mshy_paris',
        name: 'Paris',
        avatar: null,
        isPrivate: true,
        isActive: true,
        createdAt: '2026-04-01T00:00:00.000Z',
        memberCount: 12,
        isCreator: true,
        membership: { id: 'cm-1', role: 'admin', joinedAt: '2026-05-01T00:00:00.000Z', isActive: true, leftAt: null },
      },
      expect.objectContaining({
        id: 'com-2',
        memberCount: 3,
        isCreator: false,
        membership: { id: 'cm-2', role: 'member', joinedAt: '2026-05-01T00:00:00.000Z', isActive: false, leftAt: '2026-06-01T00:00:00.000Z' },
      }),
    ]);
  });

  it('interroge les appartenances de la cible, triées par joinedAt desc, et compte les seuls membres ACTIFS', async () => {
    const prisma = createMockPrisma({ memberships: [membership] });
    await get(prisma, 'ADMIN', `/admin/users/${TARGET_ID}/communities?offset=5&limit=10`);
    const args = firstCall(prisma.communityMember.findMany as jest.Mock);
    expect(args.where).toEqual({ userId: TARGET_ID });
    expect(args.orderBy).toEqual({ joinedAt: 'desc' });
    expect(args.skip).toBe(5);
    expect(args.take).toBe(10);
    const community = (args.select as AnyRecord).community as { select: AnyRecord };
    expect(community.select._count).toEqual({ select: { members: { where: { isActive: true } } } });
    // `createdBy` sert à calculer `isCreator` ; il n'est pas servi tel quel.
    expect(community.select).toHaveProperty('createdBy', true);
  });

  it('ne sert pas createdBy brut ni l\'objet _count', async () => {
    const res = await get(createMockPrisma({ memberships: [membership] }), 'ADMIN', `/admin/users/${TARGET_ID}/communities`);
    const [item] = res.json().data;
    expect(item).not.toHaveProperty('createdBy');
    expect(item).not.toHaveProperty('_count');
  });
});

// ─── GET /admin/users/:userId/voice-profile ─────────────────────────────────

describe('GET /admin/users/:userId/voice-profile', () => {
  const consents = {
    id: TARGET_ID,
    voiceProfileConsentAt: new Date('2026-03-01T00:00:00.000Z'),
    voiceDataConsentAt: new Date('2026-03-02T00:00:00.000Z'),
    voiceCloningEnabledAt: null,
  };
  const voiceModel = {
    profileId: 'vfp_abc',
    audioCount: 4,
    totalDurationMs: 61000,
    embeddingModel: 'openvoice_v2',
    embeddingDimension: 256,
    qualityScore: 0.82,
    version: 2,
    voiceAnalysisAt: new Date('2026-03-03T00:00:00.000Z'),
    voiceAnalysisModel: 'voice_quality_analyzer_v1',
    nextRecalibrationAt: null,
    voicePublicAt: null,
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    updatedAt: new Date('2026-03-04T00:00:00.000Z'),
  };

  const BINARY_OR_REFERENCE_FIELDS = [
    'embedding',
    'chatterboxConditionals',
    'referenceAudioUrl',
    'referenceAudioId',
    'embeddingPath',
    'trainingAudioSamples',
    'fingerprint',
    'signatureShort',
    'voiceCharacteristics',
  ];

  it('refuse un rôle sans canViewUsers (ANALYST ⇒ 403)', async () => {
    const res = await get(createMockPrisma({}), 'ANALYST', `/admin/users/${TARGET_ID}/voice-profile`);
    expect(res.statusCode).toBe(403);
  });

  it('rend 404 quand la cible n\'existe pas', async () => {
    const res = await get(createMockPrisma({ target: null }), 'ADMIN', `/admin/users/${TARGET_ID}/voice-profile`);
    expect(res.statusCode).toBe(404);
  });

  it('sert les métadonnées du profil et les trois consentements', async () => {
    const res = await get(createMockPrisma({ target: consents, voiceModel }), 'MODERATOR', `/admin/users/${TARGET_ID}/voice-profile`);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({
      voiceProfile: {
        profileId: 'vfp_abc',
        audioCount: 4,
        totalDurationMs: 61000,
        embeddingModel: 'openvoice_v2',
        embeddingDimension: 256,
        qualityScore: 0.82,
        version: 2,
        voiceAnalysisAt: '2026-03-03T00:00:00.000Z',
        voiceAnalysisModel: 'voice_quality_analyzer_v1',
        nextRecalibrationAt: null,
        voicePublicAt: null,
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-04T00:00:00.000Z',
      },
      consents: {
        voiceProfileConsentAt: '2026-03-01T00:00:00.000Z',
        voiceDataConsentAt: '2026-03-02T00:00:00.000Z',
        voiceCloningEnabledAt: null,
      },
    });
  });

  it('sert voiceProfile=null quand la cible n\'a pas de modèle vocal', async () => {
    const res = await get(createMockPrisma({ target: consents, voiceModel: null }), 'ADMIN', `/admin/users/${TARGET_ID}/voice-profile`);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.voiceProfile).toBeNull();
    expect(res.json().data.consents.voiceDataConsentAt).toBe('2026-03-02T00:00:00.000Z');
  });

  it('ne DEMANDE à Prisma aucun champ binaire ni aucune référence au média source', async () => {
    const prisma = createMockPrisma({ target: consents, voiceModel });
    await get(prisma, 'BIGBOSS', `/admin/users/${TARGET_ID}/voice-profile`);
    const args = firstCall(prisma.userVoiceModel.findUnique as jest.Mock);
    expect(args.where).toEqual({ userId: TARGET_ID });
    expect(args.select).toBeDefined();
    BINARY_OR_REFERENCE_FIELDS.forEach((field) => expect(args.select).not.toHaveProperty(field));
    expect(args.select).toHaveProperty('profileId', true);
  });

  it('ne SERT aucun champ binaire même si la ligne rendue en porte (fail-closed)', async () => {
    const leaky = { ...voiceModel, embedding: Buffer.from([1, 2, 3]), chatterboxConditionals: Buffer.from([4]), referenceAudioUrl: '/a.mp3' };
    const res = await get(createMockPrisma({ target: consents, voiceModel: leaky }), 'BIGBOSS', `/admin/users/${TARGET_ID}/voice-profile`);
    const served = res.json().data.voiceProfile;
    expect(served).not.toHaveProperty('embedding');
    expect(served).not.toHaveProperty('chatterboxConditionals');
    expect(served).not.toHaveProperty('referenceAudioUrl');
  });

  it('écrit une ligne d\'audit VIEW_USER qui nomme la surface consultée', async () => {
    const prisma = createMockPrisma({ target: consents, voiceModel });
    await get(prisma, 'ADMIN', `/admin/users/${TARGET_ID}/voice-profile`);
    const { data } = (prisma.adminAuditLog.create as jest.Mock).mock.calls[0][0] as { data: AnyRecord };
    expect(data).toEqual(expect.objectContaining({
      adminId: ADMIN_ID,
      userId: TARGET_ID,
      entityId: TARGET_ID,
      action: 'VIEW_USER',
      metadata: JSON.stringify({ surface: 'voice-profile' }),
    }));
  });
});
