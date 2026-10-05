/**
 * Les diffusions se lisent par leurs NOMS et se cherchent (#8876, § 6.8).
 *
 *  - la fiche dit QUI a créé, envoyé et publié dans l'application : trois personnes
 *    nommées, en UNE lecture de comptes ;
 *  - la liste cherche sur le nom et l'objet — jamais sur le corps — et suit l'envoi
 *    sans ouvrir la fiche (dates, langues, canal in-app) ;
 *  - `hasMore` se lit sur la page RENDUE (`offset + lignes rendues < total`), comme
 *    toutes les autres listes d'administration : la liste des diffusions était la
 *    seule à le calculer sur la page DEMANDÉE.
 *
 * @jest-environment node
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

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
jest.mock('../../../../services/admin/broadcast-translation.service', () => ({
  BroadcastTranslationService: jest.fn<any>().mockImplementation(() => ({ translateContent: jest.fn<any>() })),
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

const ACTOR = '507f1f77bcf86cd799439011';
const AWA = '507f1f77bcf86cd799439021';
const JEAN = '507f1f77bcf86cd799439022';
const BROADCAST = '507f1f77bcf86cd799439061';

const awa = { id: AWA, username: 'awa', displayName: 'Awa Diop', avatar: null };
const jean = { id: JEAN, username: 'jean', displayName: null, avatar: 'https://cdn/j.png' };

const broadcastRow = (over: Record<string, unknown> = {}) => ({
  id: BROADCAST,
  name: 'Rentrée',
  subject: 'Bonne rentrée',
  body: 'Corps complet',
  sourceLanguage: 'fr',
  targeting: { activityStatus: 'all' },
  translatedSubjects: null,
  translatedBodies: null,
  status: 'SENT',
  totalRecipients: 10,
  sentCount: 9,
  failedCount: 1,
  targetLanguages: ['fr', 'en'],
  createdById: AWA,
  sentById: JEAN,
  sentAt: new Date('2026-09-20T10:00:00.000Z'),
  completedAt: new Date('2026-09-20T10:05:00.000Z'),
  errorMessage: null,
  inAppSentById: AWA,
  inAppSentAt: new Date('2026-09-21T10:00:00.000Z'),
  inAppCompletedAt: null,
  inAppSentCount: 8,
  inAppFailedCount: 0,
  createdAt: new Date('2026-09-19T10:00:00.000Z'),
  updatedAt: new Date('2026-09-21T10:00:00.000Z'),
  ...over,
});

function makePrisma(rows: Record<string, unknown>[] = [], total = rows.length) {
  return {
    adminBroadcast: {
      findMany: jest.fn<any>().mockResolvedValue(rows),
      count: jest.fn<any>().mockResolvedValue(total),
      findUnique: jest.fn<any>().mockResolvedValue(broadcastRow()),
    },
    user: {
      findMany: jest.fn<any>(async (args: { where: { id: { in: string[] } } }) =>
        [awa, jean].filter((p) => args.where.id.in.includes(p.id))
      ),
    },
  } as any;
}

function buildApp(prisma: any): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('notificationService', { createSystemNotification: jest.fn<any>() });
  app.decorate('authenticate', async (request: any) => {
    request.authContext = { isAuthenticated: true, registeredUser: { id: ACTOR, role: 'ADMIN', username: 'admin' } };
  });
  app.register(broadcastRoutes);
  return app;
}

describe('GET /admin/broadcasts/:id — qui a fait quoi', () => {
  beforeEach(() => jest.clearAllMocks());

  it('nomme celui qui a créé, celui qui a envoyé et celui qui a publié dans l’application', async () => {
    const prisma = makePrisma();
    const app = buildApp(prisma);
    await app.ready();
    const body = JSON.parse((await app.inject({ method: 'GET', url: `/${BROADCAST}` })).body);

    expect(body.data.createdBy).toEqual(awa);
    expect(body.data.sentBy).toEqual(jean);
    expect(body.data.inAppSentBy).toEqual(awa);
    // Les colonnes restent servies : l'ajout est additif.
    expect(body.data).toMatchObject({ createdById: AWA, sentById: JEAN, inAppSentById: AWA, body: 'Corps complet' });
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('une diffusion jamais envoyée rend sentBy et inAppSentBy null', async () => {
    const prisma = makePrisma();
    prisma.adminBroadcast.findUnique.mockResolvedValue(
      broadcastRow({ status: 'DRAFT', sentById: null, inAppSentById: null, sentAt: null })
    );
    const app = buildApp(prisma);
    await app.ready();
    const { data } = JSON.parse((await app.inject({ method: 'GET', url: `/${BROADCAST}` })).body);

    expect(data.sentBy).toBeNull();
    expect(data.inAppSentBy).toBeNull();
    expect(data.createdBy).toEqual(awa);
    await app.close();
  });

  it('un compte disparu est servi null, sans erreur', async () => {
    const prisma = makePrisma();
    prisma.adminBroadcast.findUnique.mockResolvedValue(broadcastRow({ createdById: '507f1f77bcf86cd7994390ee' }));
    const app = buildApp(prisma);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/${BROADCAST}` });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.createdBy).toBeNull();
    await app.close();
  });

  it('ne lit que l’identité publique des personnes', async () => {
    const prisma = makePrisma();
    const app = buildApp(prisma);
    await app.ready();
    await app.inject({ method: 'GET', url: `/${BROADCAST}` });

    const select = prisma.user.findMany.mock.calls[0][0].select;
    expect(Object.keys(select).sort()).toEqual(['avatar', 'displayName', 'id', 'username']);
    await app.close();
  });
});

describe('GET /admin/broadcasts — la recherche et la pagination', () => {
  beforeEach(() => jest.clearAllMocks());

  it('cherche sur le nom et l’objet, jamais sur le corps, et pour la page et pour le compte', async () => {
    const prisma = makePrisma();
    const app = buildApp(prisma);
    await app.ready();
    await app.inject({ method: 'GET', url: '/?search=rentr%C3%A9e&status=SENT' });

    const where = prisma.adminBroadcast.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      status: 'SENT',
      OR: [
        { name: { contains: 'rentrée', mode: 'insensitive' } },
        { subject: { contains: 'rentrée', mode: 'insensitive' } },
      ],
    });
    expect(JSON.stringify(where)).not.toContain('body');
    expect(prisma.adminBroadcast.count.mock.calls[0][0].where).toEqual(where);
    await app.close();
  });

  it('sans recherche, ne pose pas de OR', async () => {
    const prisma = makePrisma();
    const app = buildApp(prisma);
    await app.ready();
    await app.inject({ method: 'GET', url: '/' });
    expect(prisma.adminBroadcast.findMany.mock.calls[0][0].where).toEqual({});
    await app.close();
  });

  it('hasMore se lit sur la page RENDUE : offset + lignes rendues < total', async () => {
    const full = makePrisma([broadcastRow(), broadcastRow({ id: 'b2' })], 12);
    const appFull = buildApp(full);
    await appFull.ready();
    const last = JSON.parse((await appFull.inject({ method: 'GET', url: '/?offset=10&limit=10' })).body);
    expect(last.data.pagination).toEqual({ total: 12, offset: 10, limit: 10, hasMore: false });

    // La base a rendu MOINS que demandé (2 lignes) alors qu'il en reste : la page
    // rendue, pas la page demandée, dit s'il y a une suite.
    const short = makePrisma([broadcastRow(), broadcastRow({ id: 'b2' })], 15);
    const appShort = buildApp(short);
    await appShort.ready();
    const more = JSON.parse((await appShort.inject({ method: 'GET', url: '/?offset=10&limit=10' })).body);
    expect(more.data.pagination.hasMore).toBe(true);

    await appFull.close();
    await appShort.close();
  });

  it('sert les champs de suivi — dates, langues, canal in-app', async () => {
    const prisma = makePrisma([broadcastRow()], 1);
    const app = buildApp(prisma);
    await app.ready();
    const row = JSON.parse((await app.inject({ method: 'GET', url: '/' })).body).data.broadcasts[0];

    expect(row).toMatchObject({
      sentAt: '2026-09-20T10:00:00.000Z',
      completedAt: '2026-09-20T10:05:00.000Z',
      sourceLanguage: 'fr',
      targetLanguages: ['fr', 'en'],
      inAppSentCount: 8,
      inAppSentAt: '2026-09-21T10:00:00.000Z',
    });
    await app.close();
  });
});
