/**
 * `POST /:id/preview` (ciblage + traduction d'une diffusion admin).
 *
 * Extrait de `admin-routes-group3.test.ts` (#5161) : ce fichier est frozen au
 * budget de taille des suites (`gateway-test-file-size-budget.test.ts`), et le
 * témoin de #5161 (expansion des variantes verbatim de `systemLanguage`) n'y
 * avait plus de place — un fichier hors budget se DÉCOUPE, il ne grossit pas
 * (`CLAUDE.md` § Code Style, budget de taille).
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({
      info: jest.fn<any>(),
      warn: jest.fn<any>(),
      error: jest.fn<any>(),
      debug: jest.fn<any>(),
    }),
  },
}));

const mockTranslateContent = jest.fn<any>();
jest.mock('../../../../services/admin/broadcast-translation.service', () => ({
  BroadcastTranslationService: jest.fn<any>().mockImplementation(() => ({
    translateContent: mockTranslateContent,
  })),
}));

jest.mock('../../../../jobs/broadcast-sender', () => ({
  BroadcastSenderJob: jest.fn<any>().mockImplementation(() => ({ execute: jest.fn<any>() })),
}));

jest.mock('../../../../jobs/broadcast-inapp-sender', () => ({
  BroadcastInAppSenderJob: jest.fn<any>().mockImplementation(() => ({ execute: jest.fn<any>() })),
}));

jest.mock('../../../../services/EmailService', () => ({
  EmailService: jest.fn<any>().mockImplementation(() => ({})),
}));

import { broadcastRoutes } from '../../../../routes/admin/broadcasts';

const mockPrisma: any = {
  adminBroadcast: {
    findUnique: jest.fn<any>(),
    update: jest.fn<any>(),
  },
  adminAuditLog: {
    create: jest.fn<any>(),
  },
  user: {
    count: jest.fn<any>(),
    groupBy: jest.fn<any>(),
    findMany: jest.fn<any>(),
  },
};

const VALID_ADMIN_ID = '507f1f77bcf86cd799439011';
const VALID_ID = '507f1f77bcf86cd799439011';

function makeAuthContext(role: string, id = VALID_ADMIN_ID) {
  return { isAuthenticated: true, registeredUser: { id, role, username: 'admin' } };
}

function buildBroadcastApp(role = 'ADMIN'): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('notificationService', { createSystemNotification: jest.fn<any>() });
  app.decorate('authenticate', async (request: any) => {
    request.authContext = makeAuthContext(role);
  });
  app.register(broadcastRoutes);
  return app;
}

function buildBroadcastAppNoAuth(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('notificationService', { createSystemNotification: jest.fn<any>() });
  app.decorate('authenticate', async (request: any) => {
    request.authContext = null;
  });
  app.register(broadcastRoutes);
  return app;
}

function fakeBroadcast(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_ID,
    name: 'Test broadcast',
    subject: 'Hello',
    body: 'Body text',
    sourceLanguage: 'fr',
    targeting: {},
    status: 'DRAFT',
    createdById: VALID_ADMIN_ID,
    translatedSubjects: null,
    translatedBodies: null,
    targetLanguages: [],
    totalRecipients: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('broadcastRoutes — POST /:id/preview', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    app = buildBroadcastApp('ADMIN');
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  function setupPreviewMocks(targeting: any = {}) {
    mockPrisma.adminBroadcast.findUnique.mockResolvedValue(
      fakeBroadcast({ targeting, status: 'DRAFT' })
    );
    mockPrisma.user.count.mockResolvedValue(10);
    mockPrisma.user.groupBy
      .mockResolvedValueOnce([{ systemLanguage: 'en', _count: 5 }, { systemLanguage: 'fr', _count: 5 }])
      .mockResolvedValueOnce([{ registrationCountry: 'US', _count: 10 }]);
    // #5161 — resolveSystemLanguageVariants() lit les valeurs verbatim
    // distinctes en base avant de construire le filtre `in`.
    mockPrisma.user.findMany.mockResolvedValue([{ systemLanguage: 'en' }, { systemLanguage: 'fr' }]);
    mockTranslateContent.mockResolvedValue({ subjects: { fr: 'Bonjour' }, bodies: { fr: 'Corps' } });
    mockPrisma.adminBroadcast.update.mockResolvedValue(fakeBroadcast({ status: 'READY' }));
  }

  it('returns 401 when unauthenticated', async () => {
    await app.close();
    const noAuthApp = buildBroadcastAppNoAuth();
    await noAuthApp.ready();

    const res = await noAuthApp.inject({ method: 'POST', url: `/${VALID_ID}/preview` });
    expect(res.statusCode).toBe(401);
    await noAuthApp.close();
  });

  it('returns 403 for USER role', async () => {
    await app.close();
    const userApp = buildBroadcastApp('USER');
    await userApp.ready();

    const res = await userApp.inject({ method: 'POST', url: `/${VALID_ID}/preview` });
    expect(res.statusCode).toBe(403);
    await userApp.close();
  });

  it('returns 404 when broadcast not found', async () => {
    mockPrisma.adminBroadcast.findUnique.mockResolvedValue(null);

    const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/preview` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 with preview data on success (no targeting)', async () => {
    setupPreviewMocks({});

    const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/preview` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.recipientCount).toBe(10);
    expect(body.data.translations).toBeDefined();
  });

  it('applies language targeting filter', async () => {
    setupPreviewMocks({ languages: ['fr', 'en'] });

    const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/preview` });
    expect(res.statusCode).toBe(200);
  });

  it('expands a canonical language target to its verbatim systemLanguage variants (#5161)', async () => {
    mockPrisma.adminBroadcast.findUnique.mockResolvedValue(
      fakeBroadcast({ targeting: { languages: ['fr'] }, status: 'DRAFT' })
    );
    // Trois lignes verbatim distinctes convergent toutes vers 'fr' ; 'en' ne
    // doit jamais entrer dans le filtre `in` construit pour ce ciblage.
    mockPrisma.user.findMany.mockResolvedValue([
      { systemLanguage: 'fr' },
      { systemLanguage: 'FR' },
      { systemLanguage: 'fr-FR' },
      { systemLanguage: 'en' },
    ]);
    mockPrisma.user.count.mockResolvedValue(3);
    mockPrisma.user.groupBy
      .mockResolvedValueOnce([
        { systemLanguage: 'fr', _count: 1 },
        { systemLanguage: 'FR', _count: 1 },
        { systemLanguage: 'fr-FR', _count: 1 },
      ])
      .mockResolvedValueOnce([{ registrationCountry: 'FR', _count: 3 }]);
    mockTranslateContent.mockResolvedValue({ subjects: { fr: 'Bonjour' }, bodies: { fr: 'Corps' } });
    mockPrisma.adminBroadcast.update.mockResolvedValue(fakeBroadcast({ status: 'READY' }));

    const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/preview` });
    expect(res.statusCode).toBe(200);

    // Le ciblage atteint les TROIS variantes verbatim, jamais 'en'.
    const countWhere = mockPrisma.user.count.mock.calls[0][0].where;
    expect([...countWhere.systemLanguage.in].sort()).toEqual(['FR', 'fr', 'fr-FR']);

    // Le rapport replie les trois buckets verbatim sur UN bucket canonique,
    // comptes additionnés — jamais une traduction par variante.
    const body = JSON.parse(res.body);
    expect(body.data.recipientsByLanguage).toEqual([{ language: 'fr', count: 3 }]);
    expect(mockPrisma.adminBroadcast.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ targetLanguages: ['fr'] }) })
    );
    expect(mockTranslateContent).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(), ['fr']
    );
  });

  it('applies country targeting filter', async () => {
    setupPreviewMocks({ countries: ['FR', 'US'] });

    const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/preview` });
    expect(res.statusCode).toBe(200);
  });

  it('applies activityStatus=active filter (last 30 days)', async () => {
    setupPreviewMocks({ activityStatus: 'active' });

    const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/preview` });
    expect(res.statusCode).toBe(200);
    const whereArg = mockPrisma.user.count.mock.calls[0][0].where;
    expect(whereArg.lastActiveAt).toBeDefined();
    expect(whereArg.lastActiveAt.gte).toBeInstanceOf(Date);
  });

  it('applies activityStatus=inactive filter (no activity in 30 days)', async () => {
    setupPreviewMocks({ activityStatus: 'inactive' });

    const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/preview` });
    expect(res.statusCode).toBe(200);
    const whereArg = mockPrisma.user.count.mock.calls[0][0].where;
    expect(whereArg.OR).toBeDefined();
    expect(Array.isArray(whereArg.OR)).toBe(true);
  });

  it('applies activityStatus=new filter (registered in last 7 days)', async () => {
    setupPreviewMocks({ activityStatus: 'new' });

    const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/preview` });
    expect(res.statusCode).toBe(200);
    const whereArg = mockPrisma.user.count.mock.calls[0][0].where;
    expect(whereArg.createdAt).toBeDefined();
    expect(whereArg.createdAt.gte).toBeInstanceOf(Date);
  });

  it('ignores unrecognized activityStatus (treats as all)', async () => {
    setupPreviewMocks({ activityStatus: 'all' });

    const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/preview` });
    expect(res.statusCode).toBe(200);
    const whereArg = mockPrisma.user.count.mock.calls[0][0].where;
    // no extra filter added for 'all'
    expect(whereArg.lastActiveAt).toBeUndefined();
    expect(whereArg.createdAt).toBeUndefined();
  });

  it('sets broadcast status to READY after preview', async () => {
    setupPreviewMocks({});

    await app.inject({ method: 'POST', url: `/${VALID_ID}/preview` });
    expect(mockPrisma.adminBroadcast.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'READY' }),
      })
    );
  });

  it('handles null targeting gracefully (falls back to empty object)', async () => {
    setupPreviewMocks(null);

    const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/preview` });
    expect(res.statusCode).toBe(200);
  });

  it('returns 500 when DB throws', async () => {
    mockPrisma.adminBroadcast.findUnique.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/preview` });
    expect(res.statusCode).toBe(500);
  });
});
