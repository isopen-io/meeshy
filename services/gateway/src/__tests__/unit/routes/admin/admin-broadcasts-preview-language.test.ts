/**
 * `POST /admin/broadcasts/:id/preview` — ciblage et rapport de langue (#5161).
 *
 * FICHIER SÉPARÉ — `admin-routes-group3.test.ts` est un fichier hérité hors
 * budget (§ `gateway-test-file-size-budget.test.ts`) : un comportement neuf
 * rejoint un fichier à sa taille plutôt que le tas.
 *
 * `User.systemLanguage` est persisté VERBATIM (`fr`, `fr-FR`, `FR`, `fr_FR`
 * coexistent) : un `in` cru sur les codes canoniques saisis dans l'UI admin
 * rate toute variante région/casse, et un `groupBy` brut fragmente le rapport
 * en autant de buckets que de variantes. Ces témoins prouvent que le ciblage
 * ATTEINT les variantes (`resolveSystemLanguageVariants`) et que le rapport
 * les REPLIE sur leur code canonique en ADDITIONNANT les comptes — même SSOT
 * (`normalizeLanguageForDedup`) que #5146/#5155.
 *
 * @jest-environment node
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({
      info: jest.fn<any>(), warn: jest.fn<any>(), error: jest.fn<any>(), debug: jest.fn<any>(),
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

const VALID_ID = '507f1f77bcf86cd799439011';
const VALID_ADMIN_ID = '507f1f77bcf86cd799439099';

const mockPrisma: any = {
  adminBroadcast: {
    findUnique: jest.fn<any>(),
    update: jest.fn<any>(),
  },
  adminAuditLog: { create: jest.fn<any>() },
  user: {
    count: jest.fn<any>(),
    groupBy: jest.fn<any>(),
    findMany: jest.fn<any>(),
  },
};

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

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('notificationService', { createSystemNotification: jest.fn<any>() });
  app.decorate('authenticate', async (request: any) => {
    request.authContext = { isAuthenticated: true, registeredUser: { id: VALID_ADMIN_ID, role: 'ADMIN', username: 'admin' } };
  });
  app.register(broadcastRoutes);
  return app;
}

function setupPreviewMocks(opts: {
  targeting?: any;
  languageVariants?: string[];
  recipientsByLanguage?: Array<{ systemLanguage: string; _count: number }>;
} = {}) {
  const {
    targeting = {},
    languageVariants = [],
    recipientsByLanguage = [{ systemLanguage: 'en', _count: 5 }],
  } = opts;
  mockPrisma.adminBroadcast.findUnique.mockResolvedValue(fakeBroadcast({ targeting, status: 'DRAFT' }));
  mockPrisma.user.count.mockResolvedValue(10);
  mockPrisma.user.groupBy
    .mockResolvedValueOnce(recipientsByLanguage)
    .mockResolvedValueOnce([{ registrationCountry: 'US', _count: 10 }]);
  // #5161 — `resolveSystemLanguageVariants` lit les valeurs verbatim distinctes
  // via `findMany({ distinct: ['systemLanguage'] })` avant de construire le `where`.
  mockPrisma.user.findMany.mockResolvedValue(languageVariants.map(systemLanguage => ({ systemLanguage })));
  mockTranslateContent.mockResolvedValue({ subjects: {}, bodies: {} });
  mockPrisma.adminBroadcast.update.mockResolvedValue(fakeBroadcast({ status: 'READY' }));
}

describe('POST /:id/preview — ciblage et rapport de langue (#5161)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("widens the language targeting filter to every verbatim variant that folds to a targeted canonical code", async () => {
    setupPreviewMocks({ targeting: { languages: ['fr'] }, languageVariants: ['fr', 'FR', 'fr-CA', 'en'] });

    const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/preview` });

    expect(res.statusCode).toBe(200);
    const whereArg = mockPrisma.user.count.mock.calls[0][0].where;
    expect(whereArg.systemLanguage.in).toEqual(expect.arrayContaining(['fr', 'FR', 'fr-CA']));
    expect(whereArg.systemLanguage.in).not.toContain('en');
  });

  it("resolves the language filter against every distinct variant present, even when none match", async () => {
    setupPreviewMocks({ targeting: { languages: ['de'] }, languageVariants: ['fr', 'en'] });

    const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/preview` });

    expect(res.statusCode).toBe(200);
    const whereArg = mockPrisma.user.count.mock.calls[0][0].where;
    expect(whereArg.systemLanguage).toEqual({ in: [] });
  });

  it('folds recipientsByLanguage buckets onto their canonical code and sums their counts', async () => {
    setupPreviewMocks({
      recipientsByLanguage: [
        { systemLanguage: 'fr', _count: 3 },
        { systemLanguage: 'FR', _count: 2 },
        { systemLanguage: 'en', _count: 5 },
      ],
    });

    const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/preview` });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.recipientsByLanguage).toHaveLength(2);
    expect(body.data.recipientsByLanguage).toEqual(
      expect.arrayContaining([{ language: 'fr', count: 5 }, { language: 'en', count: 5 }])
    );
  });

  it('derives targetLanguages (sent to translation and persisted) from the CANONICAL buckets, not the verbatim ones', async () => {
    setupPreviewMocks({
      recipientsByLanguage: [
        { systemLanguage: 'fr', _count: 1 },
        { systemLanguage: 'fr-FR', _count: 1 },
        { systemLanguage: 'fr_FR', _count: 1 },
      ],
    });

    const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/preview` });

    expect(res.statusCode).toBe(200);
    expect(mockTranslateContent).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(), ['fr']
    );
    expect(mockPrisma.adminBroadcast.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ targetLanguages: ['fr'] }) })
    );
  });
});
