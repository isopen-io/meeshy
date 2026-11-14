/**
 * #16811 — la photo et la bannière d'un compte ne désignent qu'un fichier que
 * ce compte a TÉLÉVERSÉ. `/attachments/file/*` sert par chemin : sans la
 * garde, recopier le chemin d'une photo reçue en privé l'affichait à tous.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

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

jest.mock('../../../../routes/auth/types', () => ({
  formatUserResponse: jest.fn((u: any) => ({ ...u, formatted: true })),
}));

import { updateUserAvatar, updateUserBanner } from '../../../../routes/users/profile';

const USER_ID = '507f1f77bcf86cd799439011';
const OWN = '2026/11/507f1f77bcf86cd799439011/avatar_neuf.webp';
const FOREIGN = '2026/11/65f0c0ffee0000000000aaaa/photo_privee.jpg';

function makePrisma(stored: { readonly avatar?: string | null; readonly banner?: string | null } = {}) {
  const account = {
    id: USER_ID, username: 'alice', displayName: 'Alice', email: 'alice@example.com', phoneNumber: null,
    avatar: stored.avatar ?? null, banner: stored.banner ?? null, bio: '', role: 'USER',
  };
  return {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(account),
      update: jest.fn<any>().mockResolvedValue(account),
    },
    messageAttachment: {
      findFirst: jest.fn<any>().mockImplementation(async ({ where }: any) =>
        where.uploadedBy === USER_ID && where.OR.some((c: any) => c.filePath === OWN) ? { id: 'att-own' } : null,
      ),
    },
    participant: { updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
  };
}

async function buildApp(prisma: ReturnType<typeof makePrisma>, route: (app: FastifyInstance) => Promise<void>) {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as any);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER', username: 'alice' },
    };
  });
  app.decorate('notificationService', null as any);
  await route(app as unknown as FastifyInstance);
  await app.ready();
  return app;
}

const ROUTES = [
  ['avatar', updateUserAvatar],
  ['banner', updateUserBanner],
] as const;

describe.each(ROUTES)('PATCH /users/me/%s — un fichier de l’appelant seulement (#16811)', (field, route) => {
  it.each([
    ['le chemin de stockage', FOREIGN],
    ['la route de flux', `/api/v1/attachments/file/${encodeURIComponent(FOREIGN)}`],
    ['une adresse absolue de la route de flux', `https://gate.meeshy.me/api/v1/attachments/file/${FOREIGN}`],
  ])("refuse le fichier d'un autre (%s) en 400 IDENTITY_IMAGE_NOT_OWNED sans rien écrire", async (_label, url) => {
    const prisma = makePrisma();
    const app = await buildApp(prisma, route);
    const res = await app.inject({ method: 'PATCH', url: `/users/me/${field}`, payload: { [field]: url } });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('IDENTITY_IMAGE_NOT_OWNED');
    expect(prisma.user.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('accepte son propre téléversement, cherché parmi SES images', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma, route);
    const res = await app.inject({ method: 'PATCH', url: `/users/me/${field}`, payload: { [field]: OWN } });
    expect(res.statusCode).toBe(200);
    expect(prisma.messageAttachment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ uploadedBy: USER_ID, mimeType: { startsWith: 'image/' } }) }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ [field]: OWN }) }));
    await app.close();
  });

  it('accepte la valeur déjà posée sans lecture (rétrocompatible)', async () => {
    const prisma = makePrisma({ [field]: FOREIGN });
    const app = await buildApp(prisma, route);
    const res = await app.inject({ method: 'PATCH', url: `/users/me/${field}`, payload: { [field]: FOREIGN } });
    expect(res.statusCode).toBe(200);
    expect(prisma.messageAttachment.findFirst).not.toHaveBeenCalled();
    await app.close();
  });

  it("laisse une adresse d'un hôte tiers à #16809, sans lecture", async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma, route);
    const res = await app.inject({ method: 'PATCH', url: `/users/me/${field}`, payload: { [field]: 'https://cdn.example.com/a.png' } });
    expect(res.statusCode).toBe(200);
    expect(prisma.messageAttachment.findFirst).not.toHaveBeenCalled();
    await app.close();
  });

  it('répond 500 sans rien écrire quand la lecture du fichier échoue', async () => {
    const prisma = makePrisma();
    prisma.messageAttachment.findFirst = jest.fn<any>().mockRejectedValue(new Error('db down'));
    const app = await buildApp(prisma, route);
    const res = await app.inject({ method: 'PATCH', url: `/users/me/${field}`, payload: { [field]: OWN } });
    expect(res.statusCode).toBe(500);
    expect(prisma.user.update).not.toHaveBeenCalled();
    await app.close();
  });
});
