/**
 * #4166, critère 1 — famille « include sans select à la racine ».
 *
 * `GET /admin/broadcasts` (`fastify.get('/', ...)`) chargeait
 * `adminBroadcast.findMany` sans AUCUN `select` — pas même un `include` nu,
 * la ligne `AdminBroadcast` ENTIÈRE par page, et cette route ne déclare
 * aucun `schema:` de réponse pour la retenir : « chaque ligne de liste
 * transporte `translatedBodies` / `translatedSubjects`, c'est-à-dire N
 * copies du corps complet de l'e-mail » (texte de l'issue).
 *
 * Le témoin porte sur l'APPEL PRISMA — jamais sur la réponse rendue (le
 * double ignore `select` et renvoie ce qu'on lui dit, quel que soit
 * l'argument — voir `services/gateway/CLAUDE.md` § Language Resolution :
 * « un mock Prisma rend ce qu'on lui dit quel que soit le select »).
 *
 * Fichier séparé de `admin-routes-group3.test.ts` (déjà hors budget, 1564
 * lignes) plutôt qu'ajouté dedans.
 *
 * @jest-environment node
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, jest } from '@jest/globals';

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

// Ces trois services ne sont exercés par AUCUN témoin ci-dessous (ils ne
// servent qu'à POST /:id/preview|/send|/send-inapp) — mockés uniquement
// parce que `broadcastRoutes` les importe au chargement du module, comme le
// fait déjà `admin-routes-group3.test.ts`.
jest.mock('../../../../services/admin/broadcast-translation.service', () => ({
  BroadcastTranslationService: jest.fn<any>().mockImplementation(() => ({
    translateContent: jest.fn<any>(),
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

const ADMIN_ID = '507f1f77bcf86cd799439011';

function makeMockPrisma() {
  return {
    adminBroadcast: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
    },
  };
}

function buildApp(prisma: ReturnType<typeof makeMockPrisma>): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('notificationService', { createSystemNotification: jest.fn<any>() });
  app.decorate('authenticate', async (request: any) => {
    request.authContext = {
      isAuthenticated: true,
      registeredUser: { id: ADMIN_ID, role: 'ADMIN', username: 'admin' },
    };
  });
  app.register(broadcastRoutes);
  return app;
}

describe('GET /admin/broadcasts — select explicite (#4166 critère 1)', () => {
  it('appelle adminBroadcast.findMany avec un select — jamais nu', async () => {
    const prisma = makeMockPrisma();
    const app = buildApp(prisma);
    await app.ready();

    await app.inject({ method: 'GET', url: '/' });

    expect(prisma.adminBroadcast.findMany).toHaveBeenCalledTimes(1);
    const call = prisma.adminBroadcast.findMany.mock.calls[0][0] as Record<string, unknown>;
    expect(call.select).toBeDefined();

    await app.close();
  });

  it('le select porte exactement les huit champs que la liste web sert — ni body, ni targeting, ni les traductions', async () => {
    const prisma = makeMockPrisma();
    const app = buildApp(prisma);
    await app.ready();

    await app.inject({ method: 'GET', url: '/' });

    const call = prisma.adminBroadcast.findMany.mock.calls[0][0] as { select: Record<string, unknown> };
    expect(call.select).toEqual({
      id: true,
      name: true,
      subject: true,
      status: true,
      totalRecipients: true,
      sentCount: true,
      failedCount: true,
      createdAt: true,
    });
    // Les champs lourds nommés par l'issue — jamais chargés par la LISTE.
    expect(call.select).not.toHaveProperty('body');
    expect(call.select).not.toHaveProperty('translatedSubjects');
    expect(call.select).not.toHaveProperty('translatedBodies');
    expect(call.select).not.toHaveProperty('targeting');
  });

  it('la borne de page (skip/take) reste posée — le select ne remplace pas la pagination', async () => {
    const prisma = makeMockPrisma();
    const app = buildApp(prisma);
    await app.ready();

    await app.inject({ method: 'GET', url: '/?offset=10&limit=5' });

    const call = prisma.adminBroadcast.findMany.mock.calls[0][0] as { skip: number; take: number };
    expect(call.skip).toBe(10);
    expect(call.take).toBe(5);
  });
});
