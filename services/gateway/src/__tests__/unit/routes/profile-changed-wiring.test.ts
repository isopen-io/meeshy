/**
 * #19384 — chaque écriture qui change la fiche d'un autre annonce
 * `user:profile-changed` : PATCH /users/me (bio, ville, cercle de la ville,
 * langues, voix publique), le décor, les adresses, l'échantillon de voix. Une
 * écriture qui ne touche pas la fiche n'annonce rien ; un refus n'annonce rien.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

const mockAnnounce = jest.fn<(fastify: unknown, params: { userId: string }) => Promise<void>>(async () => undefined);

jest.mock('../../../services/notifications/profile-changed', () => ({
  ...(jest.requireActual('../../../services/notifications/profile-changed') as object),
  announceProfileChanged: (fastify: unknown, params: { userId: string }) => mockAnnounce(fastify, params),
}));
jest.mock('../../../utils/logger', () => ({
  ...(jest.requireActual('../../../utils/logger') as object),
  logError: jest.fn(),
  logWarn: jest.fn(),
}));
jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) },
}));
jest.mock('../../../middleware/auth', () => ({
  authUserCacheKey: jest.fn((id: string) => `auth:user:${id}`),
  createUnifiedAuthMiddleware: jest.fn(() => async (request: { authContext?: unknown }) => {
    request.authContext = { isAuthenticated: true, registeredUser: { id: USER, role: 'USER' }, userId: USER };
  }),
}));
jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({ del: jest.fn(async () => undefined) })),
}));
jest.mock('../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn(({ op }: { op: () => unknown }) => op()),
}));
jest.mock('../../../routes/auth/types', () => ({
  formatUserResponse: jest.fn((u: Record<string, unknown>) => ({ ...u })),
}));

const mockAddressOutcome = jest.fn<() => unknown>();
jest.mock('../../../services/profile-addresses/ProfileAddressService', () => ({
  ProfileAddressService: jest.fn().mockImplementation(() => ({
    list: async () => [],
    create: async () => mockAddressOutcome(),
    reorder: async () => mockAddressOutcome(),
    update: async () => mockAddressOutcome(),
    remove: async () => mockAddressOutcome(),
  })),
}));

const mockVoiceResult = jest.fn<() => unknown>();
jest.mock('../../../services/ZmqSingleton', () => ({
  ZMQSingleton: { getInstance: jest.fn(async () => ({})) },
}));
jest.mock('../../../services/VoiceProfileService', () => ({
  VoiceProfileService: jest.fn().mockImplementation(() => ({
    registerProfile: async () => mockVoiceResult(),
    updateProfile: async () => mockVoiceResult(),
    deleteProfile: async () => mockVoiceResult(),
  })),
}));

import { updateUserProfile } from '../../../routes/users/profile';
import { meAddressRoutes } from '../../../routes/users/me-addresses';
import { voiceProfileRoutes } from '../../../routes/voice-profile';
import profileDecorRoutes from '../../../routes/me/profile-decor';
import { buildPackIndex } from '../../../services/packs/PackIndex';

const USER = '507f1f77bcf86cd799439011';
const WRITTEN_AT = new Date('2026-11-17T09:30:00.000Z');

const userRow = (over: Record<string, unknown> = {}) => ({
  id: USER, username: 'alice', displayName: 'Alice', firstName: 'Alice', lastName: 'Cooper',
  email: 'a@example.com', phoneNumber: null, avatar: null, banner: null, bio: 'bio', role: 'USER',
  systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null,
  city: null, cityCircle: null, updatedAt: WRITTEN_AT, createdAt: WRITTEN_AT, ...over,
});

async function boot(register: (app: FastifyInstance) => Promise<void>, prisma: Record<string, unknown> = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', {
    user: {
      findUnique: jest.fn(async () => userRow()),
      update: jest.fn(async () => userRow()),
    },
    userVoiceModel: { updateMany: jest.fn(async () => ({ count: 1 })) },
    userPreferences: { findMany: jest.fn(async () => []) },
    ...prisma,
  } as never);
  app.decorate('notificationService', null as never);
  app.decorate('socketIOHandler', null as never);
  app.decorate('authenticate', async (request: { authContext?: unknown }) => {
    request.authContext = { isAuthenticated: true, registeredUser: { id: USER, role: 'USER' }, userId: USER };
  });
  await register(app);
  await app.ready();
  return app;
}

beforeEach(() => {
  mockAnnounce.mockClear();
});

describe('PATCH /users/me', () => {
  it.each([
    ['la bio', { bio: 'Nouvelle bio' }],
    ['la ville', { city: 'Lyon' }],
    ['le cercle de la ville', { cityCircle: 'FRIEND' }],
    ['la langue régionale', { regionalLanguage: 'en' }],
    ['la voix publique', { voicePublic: true }],
  ])('%s annonce la fiche changée, à l’horloge de l’écriture', async (_label, payload) => {
    const app = await boot(async (a) => updateUserProfile(a));
    const res = await app.inject({ method: 'PATCH', url: '/users/me', payload });
    expect(res.statusCode).toBe(200);
    expect(mockAnnounce).toHaveBeenCalledWith(expect.anything(), { userId: USER });
    await app.close();
  });

  it('un réglage hors fiche n’annonce rien', async () => {
    const app = await boot(async (a) => updateUserProfile(a));
    const res = await app.inject({ method: 'PATCH', url: '/users/me', payload: { displayName: 'Alice Cooper' } });
    expect(res.statusCode).toBe(200);
    expect(mockAnnounce).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('PUT /profile-decor', () => {
  const INDEX = buildPackIndex({ registries: [[]], retained: [], contractItemKeys: () => [] });

  it('un décor équipé annonce la fiche changée', async () => {
    const app = await boot(
      async (a) => { await a.register(profileDecorRoutes, { index: INDEX }); },
      {
        user: { update: jest.fn(async () => ({ equippedAvatarRing: null, equippedBanner: null, equippedBannerFrame: null })) },
        userPackOwnership: { findMany: jest.fn(async () => []) },
      },
    );
    const res = await app.inject({ method: 'PUT', url: '/profile-decor', payload: { avatarRing: null } });
    expect(res.statusCode).toBe(200);
    expect(mockAnnounce).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: USER }));
    await app.close();
  });
});

describe('/users/me/addresses', () => {
  const ADDRESS = { id: 'a1', title: 'Site', url: 'https://example.com', glyph: 'link', circle: 'PUBLIC', position: 0, isShown: true, clicks: 0 };

  it.each([
    ['POST', '/users/me/addresses', { url: 'https://example.com' }, ADDRESS],
    ['PATCH', '/users/me/addresses/a1', { title: 'Autre' }, ADDRESS],
    ['DELETE', '/users/me/addresses/a1', undefined, undefined],
    ['PUT', '/users/me/addresses/order', { ids: ['a1'] }, [ADDRESS]],
  ] as const)('%s %s accepté annonce la fiche changée', async (method, url, payload, value) => {
    mockAddressOutcome.mockReturnValue({ ok: true, value });
    const app = await boot(async (a) => meAddressRoutes(a));
    const res = await app.inject({ method, url, payload: payload as never });
    expect(res.statusCode).toBeLessThan(300);
    expect(mockAnnounce).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: USER }));
    await app.close();
  });

  it('un refus n’annonce rien', async () => {
    mockAddressOutcome.mockReturnValue({ ok: false, refusal: { status: 404, error: 'Address not found', code: 'NOT_FOUND' } });
    const app = await boot(async (a) => meAddressRoutes(a));
    const res = await app.inject({ method: 'DELETE', url: '/users/me/addresses/a1' });
    expect(res.statusCode).toBe(404);
    expect(mockAnnounce).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('/voice/profile', () => {
  it('supprimer son échantillon de voix annonce la fiche changée', async () => {
    mockVoiceResult.mockReturnValue({ success: true, data: { deleted: true } });
    const app = await boot(async (a) => voiceProfileRoutes(a));
    const res = await app.inject({ method: 'DELETE', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(mockAnnounce).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: USER }));
    await app.close();
  });

  it('un échec n’annonce rien', async () => {
    mockVoiceResult.mockReturnValue({ success: false, error: 'nope', errorCode: 'PROFILE_NOT_FOUND' });
    const app = await boot(async (a) => voiceProfileRoutes(a));
    const res = await app.inject({ method: 'DELETE', url: '/' });
    expect(res.statusCode).toBe(400);
    expect(mockAnnounce).not.toHaveBeenCalled();
    await app.close();
  });
});
