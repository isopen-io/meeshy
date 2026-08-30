/**
 * `{GET,POST,PATCH,DELETE} /me/categories[...]` deviennent les adresses
 * CANONIQUES ; les cinq adresses `/me/preferences/categories[...]`
 * deviennent des ALIAS dépréciés qui s'annoncent (#4359, suivi de #4182).
 *
 * Ce témoin monte les DEUX plugins sur la MÊME instance Fastify, aux
 * préfixes réels de `routes/index.ts` (`${API_PREFIX}/me` pour l'entrée
 * `me-categories`, `${API_PREFIX}/me/preferences/categories` pour le
 * sous-arbre que `categoriesRoutes` occupe sous l'entrée `me-preferences`),
 * et n'exerce que `app.inject()` — jamais un double du handler — pour que
 * les assertions portent sur ce que le SÉRIALISEUR rend, schéma de réponse
 * compris. Même patron que `me-permissions-canonical-address.test.ts`
 * (#4350).
 *
 * `GET /me/preferences/categories/:categoryId` (détail) n'a AUCUNE nouvelle
 * adresse et n'est PAS déprécié par ce lot (#4182 critère 6) — ce fichier ne
 * porte donc que CINQ paires canonique/alias, jamais six.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

import { meCategoriesRoutes } from '../../../routes/me/categories';
import { categoriesRoutes } from '../../../routes/me/preferences/categories';
import { ROUTE_TABLE } from '../../../routes/index';

const PREFIXE_API = '/api/v1';
const USER_ID = '68a000000000000000000001';

const now = new Date('2026-08-30T00:00:00Z');

const makeCategoryRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'cat-1',
  userId: USER_ID,
  name: 'Travail',
  color: '#3B82F6',
  icon: 'briefcase',
  order: 0,
  isExpanded: true,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

function makePrisma() {
  return {
    userConversationCategory: {
      findMany: jest.fn<any>().mockResolvedValue([makeCategoryRow()]),
      count: jest.fn<any>().mockResolvedValue(1),
      findFirst: jest.fn<any>().mockResolvedValue(makeCategoryRow()),
      update: jest.fn<any>().mockResolvedValue(makeCategoryRow({ name: 'Updated' })),
      delete: jest.fn<any>().mockResolvedValue({}),
    },
  } as any;
}

/**
 * Monte les DEUX adresses réelles sur UNE instance.
 *
 * `fastify.authenticate` — la garde AUTONOME du montage canonique
 * (`onRequest`, comme `server.ts`) — et le `preHandler` reproduisant la
 * topologie réelle du parent de l'alias (`userPreferencesRoutes`, hors
 * territoire de #4359) posent tous deux EXACTEMENT la même forme de
 * `request.auth` : les handlers partagés ne peuvent pas voir la différence
 * de montage.
 */
async function monter(opts: { prisma?: ReturnType<typeof makePrisma>; authenticated?: boolean } = {}): Promise<FastifyInstance> {
  const { prisma = makePrisma(), authenticated = true } = opts;
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);

  const poserAuth = async (req: FastifyRequest) => {
    (req as any).auth = authenticated ? { userId: USER_ID, isAuthenticated: true } : { isAuthenticated: false };
  };

  app.decorate('authenticate', poserAuth);

  await app.register(meCategoriesRoutes, { prefix: `${PREFIXE_API}/me` });
  await app.register(
    async (fastify) => {
      fastify.addHook('preHandler', poserAuth);
      await fastify.register(categoriesRoutes);
    },
    { prefix: `${PREFIXE_API}/me/preferences/categories` }
  );

  await app.ready();
  return app;
}

const lireCanonique = (app: FastifyInstance) =>
  app.inject({ method: 'GET', url: `${PREFIXE_API}/me/categories` });

const lireAlias = (app: FastifyInstance) =>
  app.inject({ method: 'GET', url: `${PREFIXE_API}/me/preferences/categories` });

describe('GET /me/categories sert les catégories de l’appelant (#4359)', () => {
  it('rend 200 et NOMME un champ de data — jamais seulement statusCode', async () => {
    const app = await monter();

    const res = await lireCanonique(app);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data[0].id).toBe('cat-1');
    expect(body.data[0].name).toBe('Travail');
    await app.close();
  });

  it("n'annonce AUCUNE dépréciation sur l'adresse canonique", async () => {
    const app = await monter();

    const res = await lireCanonique(app);

    expect(res.headers.deprecation).toBeUndefined();
    expect(res.headers.link).toBeUndefined();
    await app.close();
  });

  it('exige une identité — 401 sans authentification, jamais un handler qui devine', async () => {
    const app = await monter({ authenticated: false });

    expect((await lireCanonique(app)).statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /me/preferences/categories reste vivante et annonce sa dépréciation (#4359)', () => {
  it('répond toujours 200 avec les mêmes catégories — ce n’est PAS une redirection', async () => {
    const app = await monter();

    const res = await lireAlias(app);

    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].id).toBe('cat-1');
    await app.close();
  });

  it('pose l’en-tête Deprecation (RFC 9745, @<epoch>) — même sans verdict favorable', async () => {
    const app = await monter({ authenticated: false });

    // `onRequest` court AVANT le `preHandler` d'authentification : l'annonce
    // part même sur le refus — l'appelant qui échoue est celui qui a le plus
    // besoin de savoir migrer (`utils/deprecation.ts`).
    const res = await lireAlias(app);

    expect(res.statusCode).toBe(401);
    expect(res.headers.deprecation).toMatch(/^@\d+$/);
    await app.close();
  });

  it('pointe son Link vers la nouvelle adresse canonique', async () => {
    const app = await monter();

    const res = await lireAlias(app);

    expect(res.headers.link).toBe(`</api/v1/me/categories>; rel="successor-version"`);
    await app.close();
  });
});

describe('Les routes scopées par :categoryId annoncent un successeur DÉRIVÉ de la requête (#4359)', () => {
  it('PATCH /me/preferences/categories/:categoryId pointe Link vers le MÊME id', async () => {
    const app = await monter();

    const res = await app.inject({
      method: 'PATCH',
      url: `${PREFIXE_API}/me/preferences/categories/cat-42`,
      payload: { name: 'Renamed' },
    });

    expect(res.headers.link).toBe(`</api/v1/me/categories/cat-42>; rel="successor-version"`);
    await app.close();
  });

  it('DELETE /me/preferences/categories/:categoryId pointe Link vers le MÊME id', async () => {
    const app = await monter();

    const res = await app.inject({
      method: 'DELETE',
      url: `${PREFIXE_API}/me/preferences/categories/cat-99`,
    });

    expect(res.headers.link).toBe(`</api/v1/me/categories/cat-99>; rel="successor-version"`);
    await app.close();
  });

  it('POST /me/preferences/categories/reorder pointe Link vers /me/categories/reorder', async () => {
    const app = await monter();

    const res = await app.inject({
      method: 'POST',
      url: `${PREFIXE_API}/me/preferences/categories/reorder`,
      payload: { updates: [] },
    });

    expect(res.headers.link).toBe(`</api/v1/me/categories/reorder>; rel="successor-version"`);
    await app.close();
  });
});

describe('GET /me/preferences/categories/:categoryId (détail) — hors périmètre de #4359', () => {
  it("n'annonce AUCUNE dépréciation : pas d'alias, pas de nouvelle adresse (#4182 critère 6)", async () => {
    const app = await monter();

    const res = await app.inject({ method: 'GET', url: `${PREFIXE_API}/me/preferences/categories/cat-1` });

    expect(res.statusCode).toBe(200);
    expect(res.headers.deprecation).toBeUndefined();
    expect(res.headers.link).toBeUndefined();
    await app.close();
  });

  it("n'a AUCUN équivalent monté sous /me/categories/:categoryId en GET", async () => {
    const app = await monter();

    const res = await app.inject({ method: 'GET', url: `${PREFIXE_API}/me/categories/cat-1` });

    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('Les deux adresses servent EXACTEMENT la même chose — une seule implémentation (#4359)', () => {
  it('parité clé à clé, GET (liste)', async () => {
    const app = await monter();

    const canonique = (await lireCanonique(app)).json();
    const alias = (await lireAlias(app)).json();

    // L'alias porte des en-têtes de dépréciation en PLUS, jamais un CORPS
    // différent : `data` doit être identique clé à clé.
    expect(alias.data).toEqual(canonique.data);
    expect(Object.keys(alias.data[0]).sort()).toEqual(Object.keys(canonique.data[0]).sort());
    expect(canonique.success).toBe(true);
    expect(alias.success).toBe(true);

    await app.close();
  });

  it('parité clé à clé, PATCH /:categoryId', async () => {
    const app = await monter();

    const canonique = await app.inject({
      method: 'PATCH',
      url: `${PREFIXE_API}/me/categories/cat-1`,
      payload: { name: 'Updated' },
    });
    const alias = await app.inject({
      method: 'PATCH',
      url: `${PREFIXE_API}/me/preferences/categories/cat-1`,
      payload: { name: 'Updated' },
    });

    expect(alias.json().data).toEqual(canonique.json().data);
    expect(Object.keys(alias.json().data).sort()).toEqual(Object.keys(canonique.json().data).sort());

    await app.close();
  });

  it('parité clé à clé, DELETE /:categoryId', async () => {
    const app = await monter();

    const canonique = await app.inject({ method: 'DELETE', url: `${PREFIXE_API}/me/categories/cat-1` });
    const alias = await app.inject({ method: 'DELETE', url: `${PREFIXE_API}/me/preferences/categories/cat-1` });

    expect(alias.json()).toEqual(canonique.json());

    await app.close();
  });
});

describe('Le point de montage — routes/index.ts (#4359)', () => {
  it("déclare l'entrée `me-categories`, juste après `me-permissions`, au même préfixe", () => {
    const permissionsIndex = ROUTE_TABLE.findIndex((e) => e.name === 'me-permissions');
    const categoriesIndex = ROUTE_TABLE.findIndex((e) => e.name === 'me-categories');

    expect(permissionsIndex).toBeGreaterThanOrEqual(0);
    expect(categoriesIndex).toBe(permissionsIndex + 1);

    const permissionsEntry = ROUTE_TABLE[permissionsIndex];
    const categoriesEntry = ROUTE_TABLE[categoriesIndex];
    expect(categoriesEntry.prefix).toBe(permissionsEntry.prefix);
    expect(categoriesEntry.module).toBe(meCategoriesRoutes);
  });

  it('ROUTE_TABLE compte désormais 60 entrées (59 + `conversation-receipts`, #4349)', () => {
    // Ce compte est SIGNALÉ à l'intégrateur, jamais régénéré ici :
    // `route-manifest.json` / `packages/shared/api/endpoints.ts` sont des
    // artefacts DÉRIVÉS, hors territoire de #4359 comme de #4349.
    expect(ROUTE_TABLE.length).toBe(60);
  });
});
