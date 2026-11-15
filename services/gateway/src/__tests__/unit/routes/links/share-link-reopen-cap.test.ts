/**
 * #9713 — ROUVRIR UN LIEN SUIT LA MÊME LOI QUE LE CRÉER.
 *
 * Sans elle, une adresse non prouvée désactivait ses cinq liens, en créait
 * cinq autres, puis rouvrait les premiers : dix liens actifs, et autant qu'on
 * veut en répétant (constat de l'audit adversarial). Les trois routes qui
 * écrivent un lien — `PATCH /links/:linkId`, `/toggle`, `/extend` — passent
 * toutes par `applyShareLinkUpdate`, où la loi se lit SOUS le tour du créateur.
 *
 * Témoins par VRAIE requête (`app.inject()`) sur les vraies routes.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { EventEmitter } from 'events';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../../middleware/auth', () => ({
  ...(jest.requireActual('../../../../middleware/auth') as object),
  createUnifiedAuthMiddleware: jest.fn(() => async (req: FastifyRequest) => {
    (req as any).authContext = (req as any)._testAuthContext;
  }),
  isRegisteredUser: jest.fn((ctx: any) => ctx?.registeredUser != null),
}));

import { registerManagementRoutes, applyShareLinkUpdate } from '../../../../routes/links/management';
import { requireShareLinkGrace } from '../../../../middleware/verification-gates';
import { ShareLinkGraceRefusedError } from '../../../../services/auth/share-link-grace';
import { registerAdminRoutes } from '../../../../routes/links/admin';

const USER_ID = '507f1f77bcf86cd799439011';
const LINK_DB_ID = '507f1f77bcf86cd799439022';
const LINK_ID = 'mshy_abc123';

type LinkState = { isActive: boolean; expiresAt: Date | null };

type Creator = { emailVerifiedAt: Date | null; phoneNumber: string | null; createdAt: Date };

const unprovenCreator = (): Creator => ({ emailVerifiedAt: null, phoneNumber: null, createdAt: new Date() });

function makePrisma(opts: { link: LinkState; creator: Creator | null; activeLinks: number }) {
  return {
    conversationShareLink: {
      findFirst: jest.fn<any>().mockResolvedValue({
        id: LINK_DB_ID,
        linkId: LINK_ID,
        createdBy: USER_ID,
        ...opts.link,
        conversation: { participants: [{ userId: USER_ID, isActive: true, role: 'member' }] },
      }),
      findUnique: jest.fn<any>().mockResolvedValue({ createdBy: USER_ID, ...opts.link }),
      count: jest.fn<any>().mockResolvedValue(opts.activeLinks),
      update: jest.fn<any>().mockResolvedValue({ id: LINK_DB_ID, linkId: LINK_ID, isActive: true }),
    },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(opts.creator ? { emailReleasedAt: null, ...opts.creator } : null),
    },
  } as any;
}

async function buildApp(prisma: ReturnType<typeof makePrisma>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.addHook('onRequest', async (req: FastifyRequest) => {
    (req as any)._testAuthContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER' },
      hasFullAccess: true,
    };
  });
  await registerManagementRoutes(app);
  await registerAdminRoutes(app);
  await app.ready();
  return app;
}

const inactive: LinkState = { isActive: false, expiresAt: null };
const expired: LinkState = { isActive: true, expiresAt: new Date(Date.now() - 60_000) };
const future = () => new Date(Date.now() + 86_400_000).toISOString();

describe('rouvrir un lien — la loi de la création (#9713)', () => {
  it.each([
    ['PATCH /links/:linkId { isActive: true }', `/links/${LINK_ID}`, { isActive: true }, inactive],
    ['PATCH /links/:linkId/toggle', `/links/${LINK_ID}/toggle`, { isActive: true }, inactive],
    ['PATCH /links/:linkId { expiresAt }', `/links/${LINK_ID}`, { expiresAt: future() }, expired],
    ['PATCH /links/:linkId/extend', `/links/${LINK_ID}/extend`, { expiresAt: future() }, expired],
  ])('%s refuses with 403 SHARE_LINK_CREATOR_EMAIL_NOT_VERIFIED when the creator already has five active links', async (_name, url, payload, link) => {
    const prisma = makePrisma({ link, creator: unprovenCreator(), activeLinks: 5 });
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'PATCH', url, payload });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'SHARE_LINK_CREATOR_EMAIL_NOT_VERIFIED', error: 'Share link creator must verify their e-mail' });
    expect(res.json().message).toContain('already has 5 active share links');
    expect(prisma.conversationShareLink.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('reopens the link while the creator has fewer than five active links', async () => {
    const prisma = makePrisma({ link: inactive, creator: unprovenCreator(), activeLinks: 4 });
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'PATCH', url: `/links/${LINK_ID}`, payload: { isActive: true } });
    expect(res.statusCode).toBe(200);
    expect(prisma.conversationShareLink.update).toHaveBeenCalledTimes(1);
    expect(prisma.conversationShareLink.count.mock.calls[0][0]).toMatchObject({ where: { createdBy: USER_ID, isActive: true } });
    await app.close();
  });

  it('reopens without limit when the creator has proven the address', async () => {
    const prisma = makePrisma({ link: inactive, creator: { ...unprovenCreator(), emailVerifiedAt: new Date() }, activeLinks: 40 });
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'PATCH', url: `/links/${LINK_ID}/toggle`, payload: { isActive: true } });
    expect(res.statusCode).toBe(200);
    expect(prisma.conversationShareLink.count).not.toHaveBeenCalled();
    expect(prisma.conversationShareLink.update).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('refuses to reopen once the creator\'s grace has run out', async () => {
    jest.useFakeTimers({
      now: new Date('2027-01-01T00:00:00.000Z'),
      doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask'],
    });
    try {
      const prisma = makePrisma({
        link: inactive,
        creator: { emailVerifiedAt: null, phoneNumber: null, createdAt: new Date('2026-10-01T00:00:00.000Z') },
        activeLinks: 0,
      });
      const app = await buildApp(prisma);
      const res = await app.inject({ method: 'PATCH', url: `/links/${LINK_ID}`, payload: { isActive: true } });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ code: 'SHARE_LINK_CREATOR_EMAIL_NOT_VERIFIED' });
      expect(res.json().message).toBe('The creator of this link must verify their e-mail before it can be reopened.');
      expect(prisma.conversationShareLink.update).not.toHaveBeenCalled();
      await app.close();
    } finally {
      jest.useRealTimers();
    }
  });

  it('fails closed when the creator row is missing', async () => {
    const prisma = makePrisma({ link: inactive, creator: null, activeLinks: 0 });
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'PATCH', url: `/links/${LINK_ID}`, payload: { isActive: true } });
    expect(res.statusCode).toBe(403);
    expect(prisma.conversationShareLink.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('does not consult the law for an edit that keeps an active link active', async () => {
    const prisma = makePrisma({ link: { isActive: true, expiresAt: null }, creator: unprovenCreator(), activeLinks: 9 });
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'PATCH', url: `/links/${LINK_ID}`, payload: { isActive: true, expiresAt: future() } });
    expect(res.statusCode).toBe(200);
    expect(prisma.conversationShareLink.count).not.toHaveBeenCalled();
    expect(prisma.conversationShareLink.update).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('does not consult the law for a rename, nor read the link again', async () => {
    const prisma = makePrisma({ link: inactive, creator: unprovenCreator(), activeLinks: 9 });
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'PATCH', url: `/links/${LINK_ID}`, payload: { name: 'Renamed' } });
    expect(res.statusCode).toBe(200);
    expect(prisma.conversationShareLink.findUnique).not.toHaveBeenCalled();
    expect(prisma.conversationShareLink.update).toHaveBeenCalledTimes(1);
    await app.close();
  });
});

describe('rouvrir et créer en même temps — un seul tour par compte (#9713)', () => {
  it('lets exactly one of a creation and a reopening through when the creator has four active links', async () => {
    let rows = 4;
    const insert = () => { rows += 1; };
    const fastifyLike = {
      prisma: {
        conversationShareLink: {
          count: jest.fn<any>(async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
            return rows;
          }),
          findUnique: jest.fn<any>(async () => ({ createdBy: USER_ID, isActive: false, expiresAt: null })),
          update: jest.fn<any>(async () => {
            await new Promise((resolve) => setTimeout(resolve, 20));
            insert();
            return { id: LINK_DB_ID };
          }),
        },
        user: { findUnique: jest.fn<any>(async () => ({ emailReleasedAt: null, ...unprovenCreator() })) },
      },
    };
    const raw = Object.assign(new EventEmitter(), { destroyed: false, writableFinished: false });
    let refused = false;
    const reply = {
      raw,
      code: () => reply,
      status: () => reply,
      send: () => { refused = true; return reply; },
      header: () => reply,
      type: () => reply,
    };
    const request = {
      authContext: {
        isAuthenticated: true,
        registeredUser: {
          id: USER_ID,
          emailVerifiedAt: null,
          activation: { phase: 'quiet', deadline: '2026-11-01T00:00:00.000Z', missing: ['email'] },
        },
      },
      server: fastifyLike,
    };

    const creation = (async () => {
      await requireShareLinkGrace(request as never, reply as never);
      if (refused) return 'refused';
      await new Promise((resolve) => setTimeout(resolve, 20));
      insert();
      raw.emit('close');
      return 'created';
    })();
    const reopening = applyShareLinkUpdate(fastifyLike as never, LINK_DB_ID, { isActive: true })
      .then(() => 'reopened')
      .catch((error: unknown) => (error instanceof ShareLinkGraceRefusedError ? 'refused' : 'crashed'));

    const outcomes = await Promise.all([creation, reopening]);
    expect(outcomes.filter((outcome) => outcome === 'refused')).toHaveLength(1);
    expect(outcomes).not.toContain('crashed');
    expect(rows).toBe(5);
  });
});
