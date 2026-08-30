/**
 * `GET /people` — le CINQUIÈME analyseur d'`?expand=` rejoint le module
 * partagé (#4406, suite de #4356).
 *
 * `avecPresence` était calculé EN LIGNE —
 * `(expand ?? '').split(',').map(trim).includes('presence')` — la MÊME
 * sémantique que `parseTokenSet` (`utils/sparse-fieldset.ts`), écrite une
 * cinquième fois plutôt que réutilisée (le doc-comment du module ne comptait
 * que quatre analyseurs : `directory/person.ts`, `me/get-me.ts`,
 * `links/user.ts`, la sélection de préférences — celui-ci est resté hors
 * recensement).
 *
 * ## Pourquoi ce témoin ne peut pas prouver un changement de comportement HTTP
 *
 * L'entrée `expand` est contrainte à `type: 'string'` par le schéma de la
 * route. Sondé directement (voir la première suite ci-dessous) : un
 * `?expand=` en double, que Fastify décode en TABLEAU, est rejeté par AJV
 * avec un **400 avant même que le handler ne s'exécute** — le seul point où
 * l'implémentation en ligne (`(expand ?? '').split(',')`, qui suppose une
 * chaîne et lèverait sur un tableau) et `parseTokenSet` (défensif sur tout
 * `unknown`) auraient pu diverger. L'espace des valeurs atteignables par HTTP
 * est donc STRICTEMENT identique aux deux implémentations — c'est l'énoncé
 * même de la mission (« même sémantique que celle du module »).
 *
 * Le témoin qui prouve le ROUGE porte donc sur le CÂBLAGE lui-même — la route
 * appelle-t-elle réellement `parseTokenSet`, ou seulement un jumeau qui lui
 * ressemble ? — par un espion sur le module partagé : ROUGE tant que rien ne
 * l'importe, VERT dès que la route délègue. Les suites suivantes gardent en
 * plus la ligne rouge (réponse sans paramètre inchangée) et l'argument Prisma
 * (le `select` gagne `isOnline`/`lastActiveAt` sur `expand=presence`, jamais
 * sinon) — sur le corps ET sur la requête, jamais l'un sans l'autre.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import * as sparseFieldset from '../../../utils/sparse-fieldset';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));

jest.mock('../../../routes/users/presence-gate', () => ({
  viewerFromRequest: () => null,
  mayOrderByRawPresence: () => false,
  servedOnlineFirst: () => 0,
}));

jest.mock('@meeshy/shared/utils/presence-visibility', () => ({
  applyPresenceVisibilityAsOffline: (u: unknown) => u,
}));

jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: async () => new Map() }),
}));

import { directoryPeopleRoutes } from '../../../routes/directory/people';

const PREFIXE = '/api/v1/directory';
const VIEWER = '507f1f77bcf86cd799439011';

function buildApp(lignes: Array<Record<string, unknown>> = []) {
  const findMany = jest.fn<any>(async () => lignes);
  const prisma = {
    user: {
      findMany,
      findUnique: jest.fn<any>(async () => ({ blockedUserIds: [] })),
    },
  };
  return { prisma, findMany };
}

async function monter(prisma: unknown): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.user = { userId: VIEWER };
    req.authContext = { isAuthenticated: true, userId: VIEWER, registeredUser: { id: VIEWER } };
  });
  app.decorate('prisma', prisma as never);
  app.decorate('redis', undefined as never);
  await app.register(directoryPeopleRoutes, { prefix: PREFIXE });
  await app.ready();
  return app;
}

const chercher = (app: FastifyInstance, q: string) =>
  app.inject({ method: 'GET', url: `${PREFIXE}/people?${q}` });

describe('GET /people — pourquoi aucun témoin HTTP ne peut tomber sur le comportement', () => {
  it('AJV rejette déjà un `expand` en double (tableau) avec 400, avant le handler', async () => {
    const { prisma } = buildApp();
    const app = await monter(prisma);

    const res = await chercher(app, 'q=jean&expand=presence&expand=autre');

    expect(res.statusCode).toBe(400);

    await app.close();
  });
});

describe('GET /people — le câblage sur `utils/sparse-fieldset.ts` (#4406)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("délègue l'analyse d'`expand` à `parseTokenSet` — ROUGE tant que rien ne l'appelle", async () => {
    const espion = jest.spyOn(sparseFieldset, 'parseTokenSet');
    const { prisma } = buildApp();
    const app = await monter(prisma);

    await chercher(app, 'q=jean&expand=presence');

    expect(espion).toHaveBeenCalled();
    const [brut, connus] = espion.mock.calls[0] as [unknown, readonly string[]];
    expect(brut).toBe('presence');
    expect(connus).toContain('presence');

    await app.close();
  });
});

describe('GET /people — sans paramètre, la réponse est INCHANGÉE (clés ET valeurs)', () => {
  it('sert exactement les quatre clés de `PROJECTION_MINIMALE`, telles quelles', async () => {
    const { prisma } = buildApp([
      { id: 'u-1', username: 'jean01', displayName: 'Jean Un', avatar: null },
    ]);
    const app = await monter(prisma);

    const res = await chercher(app, 'q=jean');

    expect(res.json().data).toEqual([
      { id: 'u-1', username: 'jean01', displayName: 'Jean Un', avatar: null },
    ]);

    await app.close();
  });
});

describe('GET /people?expand=… — l’ARGUMENT Prisma, pas seulement le corps', () => {
  it("un jeton `expand` inconnu mêlé à `presence` active quand même la présence — jamais refusé", async () => {
    const { prisma, findMany } = buildApp();
    const app = await monter(prisma);

    await chercher(app, 'q=jean&expand=futur-client,presence');

    const select = findMany.mock.calls[0][0].select as Record<string, unknown>;
    expect(select.isOnline).toBe(true);
    expect(select.lastActiveAt).toBe(true);

    await app.close();
  });

  it("un `expand` qui ne nomme pas `presence` ne charge pas la présence", async () => {
    const { prisma, findMany } = buildApp();
    const app = await monter(prisma);

    await chercher(app, 'q=jean&expand=stats');

    const select = findMany.mock.calls[0][0].select as Record<string, unknown>;
    expect('isOnline' in select).toBe(false);
    expect('lastActiveAt' in select).toBe(false);

    await app.close();
  });
});
