/**
 * Les dix adresses en sursis du territoire #4274 ANNONCENT leur sursis.
 *
 * Une garde de source prouve qu'un appel est écrit ; elle ne prouve pas que
 * l'en-tête PART. C'est la leçon du cycle 122 portée à la dépréciation : un
 * résolveur dont la valeur n'atteint aucun lecteur n'a corrigé personne. Ces
 * témoins injectent de VRAIES requêtes et lisent la charge servie.
 *
 * Et ils l'injectent sur des requêtes **REFUSÉES**. C'est le cas qui décide de
 * la forme du correctif : une console d'administration dont le jeton a expiré,
 * un client mobile dont le rang est refusé, un appelant plafonné par le débit
 * — tous reçoivent une réponse, et tous doivent apprendre par quoi migrer.
 * L'annonce est donc en `onRequest`, avant `authenticate`. Un témoin posé sur
 * un 200 aurait été vert avec l'annonce dans le handler, c'est-à-dire avec un
 * correctif qui n'atteint jamais l'appelant le plus pressé de migrer.
 *
 * Le contre-témoin compte autant : les adresses CANONIQUES montées par les
 * mêmes fichiers ne portent AUCUN en-tête. Sans lui, un hook posé globalement
 * — sur le préfixe, sur l'instance — passerait tous les témoins positifs en
 * déclarant dépréciée la surface entière.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

const passeTout = async () => undefined;

jest.mock('../../../middleware/authorize', () => ({
  requirePermission: () => passeTout,
  requireHierarchy: () => passeTout,
}));
jest.mock('../../../middleware/admin-user-auth.middleware', () => ({
  requireUserModifyAccess: passeTout,
}));
jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => ({ del: jest.fn(async () => undefined) }),
}));
jest.mock('../../../services/admin/report.service', () => ({
  getReportService: () => ({ listReports: jest.fn(async () => ({ reports: [], total: 0 })) }),
}));
jest.mock('../../../routes/reports', () => ({
  signaler: jest.fn(async () => undefined),
  limiteursDeSignalement: () => [],
}));

import { reportRoutes } from '../../../routes/admin/reports';
import { registerUserWriteRoutes } from '../../../routes/admin/users-write';

const SUCCESSEUR_ADMIN_USERS = '/api/v1/admin/users/:userId';

/**
 * `authenticate` REFUSE. C'est le seul état à simuler : l'annonce court avant
 * lui, donc aucun service n'est jamais atteint — et le témoin ne dépend
 * d'aucun double de la couche métier.
 */
async function monter(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {} as never);
  app.decorate('authenticate', async (_request: unknown, reply: { status: (n: number) => { send: (b: unknown) => Promise<void> } }) => {
    await reply.status(401).send({ success: false, error: 'Unauthorized' });
  });

  await app.register(reportRoutes, { prefix: '/api/v1/admin/reports' });
  await app.register(
    async (instance) => {
      registerUserWriteRoutes(instance, {
        userManagementService: {} as never,
        userAuditService: {} as never,
      });
    },
    { prefix: '/api/v1' }
  );

  await app.ready();
  return app;
}

type EnSursis = { readonly methode: 'GET' | 'POST' | 'PATCH'; readonly url: string; readonly successeur: string };

const EN_SURSIS: readonly EnSursis[] = [
  { methode: 'POST', url: '/api/v1/admin/reports/', successeur: '/api/v1/reports' },
  { methode: 'PATCH', url: '/api/v1/admin/users/u1/role', successeur: SUCCESSEUR_ADMIN_USERS },
  { methode: 'PATCH', url: '/api/v1/admin/users/u1/status', successeur: SUCCESSEUR_ADMIN_USERS },
  { methode: 'POST', url: '/api/v1/admin/users/u1/unlock', successeur: `${SUCCESSEUR_ADMIN_USERS}/security` },
  { methode: 'POST', url: '/api/v1/admin/users/u1/enable-2fa', successeur: `${SUCCESSEUR_ADMIN_USERS}/security` },
  { methode: 'POST', url: '/api/v1/admin/users/u1/disable-2fa', successeur: `${SUCCESSEUR_ADMIN_USERS}/security` },
  { methode: 'POST', url: '/api/v1/admin/users/u1/verify-email', successeur: `${SUCCESSEUR_ADMIN_USERS}/verifications` },
  { methode: 'POST', url: '/api/v1/admin/users/u1/verify-phone', successeur: `${SUCCESSEUR_ADMIN_USERS}/verifications` },
  { methode: 'POST', url: '/api/v1/admin/users/u1/verify-age', successeur: `${SUCCESSEUR_ADMIN_USERS}/verifications` },
  { methode: 'POST', url: '/api/v1/admin/users/u1/voice-consent', successeur: `${SUCCESSEUR_ADMIN_USERS}/consents` },
];

const CANONIQUES: readonly { readonly methode: 'GET' | 'PATCH'; readonly url: string }[] = [
  { methode: 'GET', url: '/api/v1/admin/reports/' },
  { methode: 'PATCH', url: '/api/v1/admin/users/u1' },
  { methode: 'PATCH', url: '/api/v1/admin/users/u1/security' },
  { methode: 'PATCH', url: '/api/v1/admin/users/u1/verifications' },
  { methode: 'PATCH', url: '/api/v1/admin/users/u1/consents' },
];

describe("Les dix adresses en sursis l'annoncent, MÊME refusées", () => {
  it.each(EN_SURSIS)('$methode $url nomme son successeur sur un 401', async ({ methode, url, successeur }) => {
    const app = await monter();

    const res = await app.inject({ method: methode, url, payload: {} });

    expect(res.statusCode).toBe(401);
    expect(res.headers.deprecation).toBe('@1787961600');
    expect(res.headers.link).toBe(`<${successeur}>; rel="successor-version"`);

    await app.close();
  });
});

describe("Sunset n'est jamais inventé", () => {
  it('aucune des dix ne porte de date de retrait — le compteur (#4275) ne l’a pas encore fixée', async () => {
    const app = await monter();

    for (const { methode, url } of EN_SURSIS) {
      const res = await app.inject({ method: methode, url, payload: {} });
      expect(Object.keys(res.headers)).not.toContain('sunset');
    }

    await app.close();
  });
});

describe('Les adresses CANONIQUES ne se déclarent pas dépréciées', () => {
  it.each(CANONIQUES)('$methode $url ne porte ni Deprecation ni successeur', async ({ methode, url }) => {
    const app = await monter();

    const res = await app.inject({ method: methode, url, payload: {} });

    expect(Object.keys(res.headers)).not.toContain('deprecation');
    expect(res.headers.link).toBeUndefined();

    await app.close();
  });
});
