import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';
import { registerSoundRoutes } from '../sounds';

// ⚠ v1 : les fixtures utilisaient 'sound-1', rejeté par la garde ObjectId de
// la route elle-même — 4 tests sur 6 recevaient 400, dont celui censé prouver
// que `contentHash` ne fuit pas : il passait sur un corps d'erreur.
const ID = '507f1f77bcf86cd799439011';

function auth(userId = 'user-abc') {
  return async (request: unknown) => {
    (request as Record<string, unknown>)['authContext'] = {
      type: 'registered', registeredUser: { id: userId, username: 'tester' },
      userId, hasFullAccess: true,
    };
  };
}

async function buildApp(prisma: unknown, userId = 'user-abc') {
  const app = Fastify();
  registerSoundRoutes(app, prisma as import('@meeshy/shared/prisma/client').PrismaClient, auth(userId));
  await app.ready();
  return app;
}

const base = { id: ID, title: 'S', fileUrl: '/f.m4a', durationMs: 1000, waveform: [], usageCount: 0 };

describe('routes /sounds', () => {
  it('test_getSound_privateSoundOfOtherUser_returns403', async () => {
    const prisma = { sound: { findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({
      ...base, uploaderId: 'autrui', isPublic: false, mutedAt: null }) } };
    const res = await (await buildApp(prisma)).inject({ method: 'GET', url: `/sounds/${ID}` });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('SOUND_FORBIDDEN');
  });

  it('test_getSound_ownPrivateSound_returns200', async () => {
    const prisma = { sound: { findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({
      ...base, title: 'Mon son', uploaderId: 'user-abc', isPublic: false, mutedAt: null }) } };
    const res = await (await buildApp(prisma)).inject({ method: 'GET', url: `/sounds/${ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.title).toBe('Mon son');
  });

  it('test_getSound_mutedSound_returns410', async () => {
    const prisma = { sound: { findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({
      ...base, uploaderId: 'user-abc', isPublic: true, mutedAt: new Date() }) } };
    const res = await (await buildApp(prisma)).inject({ method: 'GET', url: `/sounds/${ID}` });
    expect(res.statusCode).toBe(410);
    expect(res.json().code).toBe('SOUND_MUTED');
  });

  it('test_getSound_response_neverLeaksContentHashNorUploaderId', async () => {
    const prisma = { sound: { findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({
      ...base, uploaderId: 'user-abc', isPublic: true, mutedAt: null, contentHash: 'secret-hash' }) } };
    const res = await (await buildApp(prisma)).inject({ method: 'GET', url: `/sounds/${ID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.stringify(res.json());
    expect(body).not.toContain('secret-hash');
    expect(body).not.toContain('uploaderId');
  });

  it('test_getSound_malformedId_returns400', async () => {
    const prisma = { sound: { findUnique: jest.fn() } };
    const res = await (await buildApp(prisma)).inject({ method: 'GET', url: '/sounds/pas-un-id' });
    expect(res.statusCode).toBe(400);
    expect(prisma.sound.findUnique).not.toHaveBeenCalled();
  });

  it('test_patchSound_notOwner_returns403', async () => {
    const prisma = { sound: {
      findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: ID, uploaderId: 'autrui' }),
      update: jest.fn() } };
    const res = await (await buildApp(prisma)).inject({
      method: 'PATCH', url: `/sounds/${ID}`, payload: { isPublic: false } });
    expect(res.statusCode).toBe(403);
    expect(prisma.sound.update).not.toHaveBeenCalled();
  });

  it('test_getMine_returnsRootLevelPagination', async () => {
    const prisma = { sound: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([
      { ...base, uploaderId: 'user-abc', isPublic: true, mutedAt: null, createdAt: new Date() }]) } };
    const res = await (await buildApp(prisma)).inject({ method: 'GET', url: '/sounds/mine?limit=1' });
    expect(res.statusCode).toBe(200);
    // `sendSuccess` place la pagination À LA RACINE, pas sous `meta`.
    expect(res.json().pagination).toBeDefined();
  });

  it('test_getMine_invalidCursor_returns400', async () => {
    const prisma = { sound: { findMany: jest.fn() } };
    const res = await (await buildApp(prisma)).inject({ method: 'GET', url: '/sounds/mine?cursor=pas-une-date' });
    expect(res.statusCode).toBe(400);
  });
});
