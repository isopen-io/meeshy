/**
 * La couleur d'accent de la vitrine (#19201, chantier #18857).
 *
 * `PATCH /users/me` l'accepte depuis une liste FERMÉE (jamais du texte libre), la rend à son
 * propriétaire, et la diffuse par `user:updated` aux pairs ET aux autres appareils de la
 * personne. Les fiches (`/u/:username`, `/users/:id`) la servent ; une valeur stockée hors liste
 * retombe sur `null` (accent calculé). Tout passe par `app.inject`, donc par le VRAI sérialiseur.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

jest.mock('../../../../utils/logger', () => ({
  logError: jest.fn(),
  logWarn: jest.fn(),
}));

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
}));

jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
}));

jest.mock('../../../../middleware/auth', () => ({
  authUserCacheKey: jest.fn((id: string) => `auth:user:${id}`),
  createUnifiedAuthMiddleware: jest.fn(() => async () => {}),
}));

jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({ del: jest.fn().mockResolvedValue(undefined) })),
}));

jest.mock('../../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn<any>().mockImplementation(({ op }: any) => op()),
}));

const VIEWER = '507f1f77bcf86cd7994390fe';

jest.mock('../../../../routes/users/presence-gate', () => ({
  viewerFromRequest: () => null,
  presenceFor: () => null,
  applyPresenceVisibilityAsOffline: (rows: unknown) => rows,
  gateProfilePresence: async (_f: unknown, _r: unknown, user: unknown) => user,
  getOptionalAuth: () => async (req: any) => {
    req.authContext = { type: 'user', isAuthenticated: true, isAnonymous: false, userId: VIEWER, registeredUser: { id: VIEWER, role: 'USER' } };
  },
}));

import { getUserById, getUserByUsername, updateUserProfile } from '../../../../routes/users/profile';

const USER_ID = '507f1f77bcf86cd799439011';

const storedUser = (over: Record<string, unknown> = {}) => ({
  id: USER_ID, username: 'alice', firstName: 'Alice', lastName: 'Smith', displayName: 'Alice Smith',
  email: 'alice@example.com', phoneNumber: null, avatar: null, banner: null, bio: '', role: 'USER',
  isActive: true, systemLanguage: 'fr', regionalLanguage: 'en', customDestinationLanguage: null,
  profileCompletionRate: 0, createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'),
  preferences: null, city: null, cityCircle: null, profileAccentColor: null, ...over,
});

async function patch(payload: Record<string, unknown>, after: Record<string, unknown> = {}) {
  const prisma = {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(storedUser()),
      update: jest.fn<any>().mockResolvedValue(storedUser(after)),
    },
    userVoiceModel: { updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
  };
  const emitUserUpdated = jest.fn<any>().mockResolvedValue(undefined);
  const emit = jest.fn();
  const to = jest.fn((_room: string) => ({ emit }));
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: 'log' as const, keywords: ['example'] } } });
  app.decorate('prisma', prisma as any);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER', username: 'alice' } };
  });
  app.decorate('notificationService', { emitUserUpdated } as any);
  app.decorate('socketIOHandler', { getManager: () => ({ getIO: () => ({ to }) }) } as any);
  await updateUserProfile(app as unknown as FastifyInstance);
  await app.ready();
  const res = await app.inject({ method: 'PATCH', url: '/users/me', payload });
  await app.close();
  return { res, prisma, emitUserUpdated, to, emit };
}

describe('PATCH /users/me — la couleur d’accent', () => {
  it('écrit une teinte de la liste, canonisée, et la rend au propriétaire', async () => {
    const { res, prisma } = await patch({ profileAccentColor: '#ff6b6b' }, { profileAccentColor: '#FF6B6B' });
    expect(res.statusCode).toBe(200);
    expect(prisma.user.update.mock.calls[0][0].data).toMatchObject({ profileAccentColor: '#FF6B6B' });
    expect(res.json().data.user.profileAccentColor).toBe('#FF6B6B');
  });

  it('refuse une valeur hors liste, sans rien écrire', async () => {
    for (const value of ['#123456', 'violet', 'red;background:url(x)']) {
      const { res, prisma } = await patch({ profileAccentColor: value });
      expect(res.statusCode).toBe(400);
      expect(prisma.user.update).not.toHaveBeenCalled();
    }
  });

  it('`null` rend l’accent calculé : écrit `null`, servi `null`', async () => {
    const { res, prisma } = await patch({ profileAccentColor: null }, { profileAccentColor: null });
    expect(res.statusCode).toBe(200);
    expect(prisma.user.update.mock.calls[0][0].data).toMatchObject({ profileAccentColor: null });
    expect(res.json().data.user.profileAccentColor).toBeNull();
  });

  it('diffuse le changement par user:updated aux pairs, et par profile:updated (l’instantané propre) aux autres appareils de la personne', async () => {
    const { emitUserUpdated, to, emit } = await patch({ profileAccentColor: '#4ECDC4' }, { profileAccentColor: '#4ECDC4' });
    expect(emitUserUpdated).toHaveBeenCalledWith({ userId: USER_ID, changes: { profileAccentColor: '#4ECDC4' } });
    expect(to).toHaveBeenCalledWith(ROOMS.user(USER_ID));
    expect(emit).toHaveBeenCalledWith(SERVER_EVENTS.PROFILE_UPDATED, expect.objectContaining({
      userId: USER_ID,
      profile: expect.objectContaining({ profileAccentColor: '#4ECDC4', systemLanguage: 'fr', username: 'alice' }),
    }));
  });

  it('n’envoie jamais user:updated sur la room de l’auteur : ses appareils ont profile:updated (#18924)', async () => {
    const { emit } = await patch({ profileAccentColor: '#4ECDC4' }, { profileAccentColor: '#4ECDC4' });
    expect(emit.mock.calls.map(([event]) => event)).not.toContain(SERVER_EVENTS.USER_UPDATED);
  });

  it('`null` part aussi à mes appareils : ils reviennent à l’accent calculé', async () => {
    const { emit } = await patch({ profileAccentColor: null }, { profileAccentColor: null });
    expect(emit).toHaveBeenCalledWith(SERVER_EVENTS.PROFILE_UPDATED, expect.objectContaining({
      profile: expect.objectContaining({ profileAccentColor: null }),
    }));
  });

  it('un ancien client qui ne nomme pas le champ n’écrit ni ne diffuse rien de l’accent', async () => {
    const { res, prisma, emitUserUpdated } = await patch({ bio: 'Salut' }, { bio: 'Salut' });
    expect(res.statusCode).toBe(200);
    expect('profileAccentColor' in prisma.user.update.mock.calls[0][0].data).toBe(false);
    expect(emitUserUpdated).not.toHaveBeenCalled();
  });
});

const ligne = (over: Record<string, unknown> = {}) => ({
  id: USER_ID, username: 'alice', firstName: 'A', lastName: 'S', displayName: 'Alice',
  avatar: null, banner: null, bio: '', role: 'USER', isOnline: false, lastActiveAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'), voiceModel: null,
  city: null, cityCircle: null, profileAccentColor: '#4ECDC4', ...over,
});

async function lireFiche(row: Record<string, unknown>, url: string) {
  const findFirst = jest.fn<any>(async (a?: any) => (a?.where?.blockedUserIds ? null : row));
  const prisma = { profileAddress: { findMany: async () => [] }, communityMember: { findMany: async () => [] }, user: { findFirst } };
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async () => {});
  app.decorate('prisma', prisma as never);
  await app.register(async (i) => {
    await getUserById(i);
    await getUserByUsername(i);
  }, { prefix: '/api/v1' });
  await app.ready();
  const res = await app.inject({ method: 'GET', url: `/api/v1${url}` });
  await app.close();
  return { res, findFirst };
}

describe('les fiches servent la couleur d’accent choisie (cercle Public)', () => {
  it.each(['/u/alice', `/users/${USER_ID}`])('%s la charge et la sert', async (url) => {
    const { res, findFirst } = await lireFiche(ligne(), url);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.profileAccentColor).toBe('#4ECDC4');
    const select = findFirst.mock.calls.map((call: any) => call[0]?.select).find(Boolean);
    expect(select).toMatchObject({ profileAccentColor: true });
  });

  it('`null` (automatique) part `null`', async () => {
    const { res } = await lireFiche(ligne({ profileAccentColor: null }), '/u/alice');
    expect(res.json().data.profileAccentColor).toBeNull();
  });

  it('une valeur stockée hors liste n’est jamais servie : elle retombe sur l’automatique', async () => {
    const { res } = await lireFiche(ligne({ profileAccentColor: '#123456' }), '/u/alice');
    expect(res.json().data.profileAccentColor).toBeNull();
  });
});
