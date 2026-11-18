/**
 * Un lien suivi vers un contenu Meeshy (publication, story, conversation, profil…)
 * ne change pas de destination : l'application route par `targetType`/`targetId`,
 * le web suit `originalUrl`. Rediriger ce dernier ferait mener le même partage à
 * deux endroits selon la plateforme — et chaque `shareWithTrackingLink` le réutilise.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify from 'fastify';

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

const TOKEN = 'post42';
const OWNER = 'ulrich';
const internalLink = {
  id: 'link-1',
  token: TOKEN,
  originalUrl: 'https://meeshy.me/p/65a0000000000000000000c1',
  shortUrl: `/l/${TOKEN}`,
  createdBy: OWNER,
  targetType: 'POST',
  targetId: '65a0000000000000000000c1',
  isActive: true,
  totalClicks: 0,
  uniqueClicks: 0,
  createdAt: new Date('2026-11-01T00:00:00Z'),
  updatedAt: new Date('2026-11-01T00:00:00Z'),
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

const patch = async (link: Record<string, unknown>, payload: Record<string, unknown>) => {
  mockGetByToken.mockResolvedValue(link);
  mockUpdate.mockImplementation(async (params: any) => ({ ...link, ...params, token: link.token }));
  const app = await buildApp();
  const res = await app.inject({ method: 'PATCH', url: `/tracking-links/${TOKEN}`, headers: { 'x-test-as': `${OWNER}:USER` }, payload });
  await app.close();
  return res;
};

beforeEach(() => jest.clearAllMocks());

describe('la cible d\'un lien vers un contenu Meeshy ne se redirige pas ailleurs', () => {
  it('PATCH originalUrl sur un lien à cible interne (POST) : 400 typé, rien n\'est écrit — le web et l\'app ne divergent jamais', async () => {
    const res = await patch(internalLink, { originalUrl: 'https://evil.example/login' });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('TRACKING_TARGET_IMMUTABLE');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('les autres champs d\'un lien interne restent modifiables', async () => {
    const res = await patch(internalLink, { name: 'Campagne', isActive: false });
    expect(res.statusCode).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ originalUrl: undefined, isActive: false }));
  });

  it('un lien EXTERNE (ou ancien, sans cible déclarée) change toujours de destination', async () => {
    for (const link of [{ ...internalLink, targetType: 'EXTERNAL', targetId: null }, { ...internalLink, targetType: undefined, targetId: undefined }]) {
      jest.clearAllMocks();
      const res = await patch(link, { originalUrl: 'https://exemple.fr/nouveau' });
      expect(res.statusCode).toBe(200);
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ originalUrl: 'https://exemple.fr/nouveau' }));
    }
  });
});
