/**
 * Un lien suivi SANS propriétaire n'appartient à personne — donc à aucun
 * compte ordinaire (#10291).
 *
 * La garde des quatre routes de gestion s'écrivait
 * `if (link.createdBy && link.createdBy !== userId)` : un lien sans `createdBy`
 * — exactement ceux fabriqués pour un invité anonyme, que la migration
 * désactive — se laissait réactiver, rediriger, renommer, supprimer et lire par
 * N'IMPORTE QUEL compte inscrit. Un invité qui se crée un compte rallumait ainsi
 * le `m+<jeton>` de ses anciens messages vers l'adresse de son choix.
 *
 * Désormais : seul le créateur, ou un compte qui peut modérer le contenu.
 * Le témoin assert sur l'EFFET (le service n'est pas appelé), pas sur le statut.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../../services/engagement/EngagementService', () => ({
  EngagementService: jest.fn().mockImplementation(() => ({
    recordActivity: jest.fn(() => Promise.resolve()),
  })),
}));

const registeredContext = (id: string, role: string) => ({
  type: 'user' as const,
  isAuthenticated: true,
  isAnonymous: false,
  userId: id,
  hasFullAccess: true,
  registeredUser: { id, username: id, role },
});

jest.mock('../../../../middleware/auth', () => {
  const actual = jest.requireActual('../../../../middleware/auth') as Record<string, unknown>;
  return {
    ...actual,
    createUnifiedAuthMiddleware: jest.fn().mockReturnValue(async (req: any) => {
      const [id, role] = String(req.headers['x-test-as'] ?? 'mallory:USER').split(':');
      req.authContext = registeredContext(id, role);
    }),
  };
});

const mockGetByToken = jest.fn<any>();
const mockUpdate = jest.fn<any>();
const mockDelete = jest.fn<any>();
const mockDeactivate = jest.fn<any>();
const mockStats = jest.fn<any>();

jest.mock('../../../../middleware/admin-permissions.middleware', () => ({
  requireAnalyticsPermission: jest.fn(),
}));

jest.mock('../../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    getTrackingLinkByToken: mockGetByToken,
    updateTrackingLink: mockUpdate,
    deleteTrackingLink: mockDelete,
    deactivateTrackingLink: mockDeactivate,
    getTrackingLinkStats: mockStats,
    isTokenAvailable: jest.fn<any>().mockResolvedValue(true),
    buildTrackingUrl: (token: string) => `https://meeshy.me/l/${token}`,
  })),
  resolveFrontendBaseUrl: jest.fn().mockReturnValue('https://meeshy.me'),
}));

import { registerTrackingRoutes } from '../../../../routes/tracking-links/tracking';
import { registerCreationRoutes } from '../../../../routes/tracking-links/creation';

const TOKEN = 'guest1';
const ownerlessLink = {
  id: 'link-1',
  token: TOKEN,
  originalUrl: 'https://example.com/a',
  shortUrl: `/l/${TOKEN}`,
  createdBy: null,
  isActive: false,
  totalClicks: 3,
  uniqueClicks: 2,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
};

const buildApp = async () => {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', { trackingLink: {}, trackingLinkClick: {} } as any);
  app.decorate('authenticate', async () => {});
  await registerTrackingRoutes(app);
  await registerCreationRoutes(app);
  await app.ready();
  return app;
};

type Gesture = { readonly name: string; readonly method: 'PATCH' | 'DELETE' | 'GET'; readonly url: string; readonly payload?: Record<string, unknown>; readonly effect: jest.Mock<any> };

const GESTURES: ReadonlyArray<readonly [string, Gesture]> = [
  ['PATCH /tracking-links/:token (réactiver + rediriger)', { name: 'patch', method: 'PATCH', url: `/tracking-links/${TOKEN}`, payload: { isActive: true, originalUrl: 'https://phish.example/x' }, effect: mockUpdate }],
  ['DELETE /tracking-links/:token', { name: 'delete', method: 'DELETE', url: `/tracking-links/${TOKEN}`, effect: mockDelete }],
  ['PATCH /tracking-links/:token/deactivate', { name: 'deactivate', method: 'PATCH', url: `/tracking-links/${TOKEN}/deactivate`, effect: mockDeactivate }],
  ['GET /tracking-links/:token/stats', { name: 'stats', method: 'GET', url: `/tracking-links/${TOKEN}/stats`, effect: mockStats }],
];

describe('un lien sans propriétaire ne se gère pas par un compte ordinaire (#10291)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockGetByToken.mockResolvedValue(ownerlessLink);
    mockUpdate.mockResolvedValue({ ...ownerlessLink, isActive: true });
    mockDelete.mockResolvedValue(undefined);
    mockDeactivate.mockResolvedValue(ownerlessLink);
    mockStats.mockResolvedValue({ totalClicks: 3, uniqueClicks: 2 });
    app = await buildApp();
  });
  afterEach(async () => { await app.close(); });

  it.each(GESTURES)('%s — compte ordinaire : 403, aucun effet', async (_name, gesture) => {
    const response = await app.inject({
      method: gesture.method,
      url: gesture.url,
      headers: { 'x-test-as': 'mallory:USER' },
      ...(gesture.payload ? { payload: gesture.payload } : {}),
    });

    expect(response.statusCode).toBe(403);
    expect(gesture.effect).not.toHaveBeenCalled();
  });

  it.each(GESTURES)('%s — un modérateur garde la main', async (_name, gesture) => {
    const response = await app.inject({
      method: gesture.method,
      url: gesture.url,
      headers: { 'x-test-as': 'mod:MODERATOR' },
      ...(gesture.payload ? { payload: gesture.payload } : {}),
    });

    expect(response.statusCode).toBe(200);
    expect(gesture.effect).toHaveBeenCalled();
  });

  it.each(GESTURES)('%s — le créateur garde la main', async (_name, gesture) => {
    mockGetByToken.mockResolvedValue({ ...ownerlessLink, createdBy: 'alice' });

    const response = await app.inject({
      method: gesture.method,
      url: gesture.url,
      headers: { 'x-test-as': 'alice:USER' },
      ...(gesture.payload ? { payload: gesture.payload } : {}),
    });

    expect(response.statusCode).toBe(200);
    expect(gesture.effect).toHaveBeenCalled();
  });
});
