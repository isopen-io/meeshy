/**
 * Témoin de RETRAIT — les jumelles appauvries de l'identité et de « moi » (#4186)
 *
 * Trois adresses vivaient à côté d'une route qui fait la même chose EN MIEUX,
 * ou ne servaient personne du tout. Ce que le doublon COÛTAIT, route par route :
 *
 *   • `GET /api/v1/auth/magic-link/validate` — jumelle GET de la POST. Les deux
 *     ouvrent une session, mais la GET n'applique NI `rememberDevice` NI
 *     `markSessionTrusted`, et fige `expiresIn` à 86 400. Deux verbes, un seul
 *     nom, deux durées de session : celui qui a coché « se souvenir de moi » et
 *     dont le lien passait par la GET était déconnecté au bout de 24 h sans
 *     jamais comprendre pourquoi. Et elle faisait voyager le jeton de connexion
 *     en QUERY STRING — journalisé par tout proxy, gardé dans l'historique.
 *
 *   • `DELETE /api/v1/me/preferences` — la remise à zéro globale, sans aucun
 *     appelant sur les trois clients. Rien n'est perdu : le DELETE par
 *     CATÉGORIE (`preference-router-factory.ts:383`) fait exactement les trois
 *     mêmes gestes — retrait des lignes héritées (`afterWrite`), purge du cache
 *     de confidentialité, diffusion `preferences:updated`. L'agrégat revient au
 *     lot L3 sous un AUTRE contrat (`?categories=`, absent = tout) : le retirer
 *     ici n'est donc pas un aller-retour, c'est faire de la place.
 *
 *   • `GET /api/v1/me/me` — déjà morte (#4141 a ramené la route à la racine du
 *     module). Le témoin la garde sous surveillance : rien n'empêchait de la
 *     réintroduire par un copier-coller, et le segment doublé ne se voit dans
 *     AUCUN fichier pris isolément.
 *
 * ─── Pourquoi ce fichier existe, et pourquoi il est bâti ainsi ───────────────
 *
 * Une garde NÉGATIVE meurt en silence : le jour où le harnais cesse de monter
 * le module, toutes ses adresses rendent 404 et le témoin passe au vert en ne
 * mesurant plus rien. C'est pourquoi CHAQUE assertion d'absence est adossée à
 * l'assertion de PRÉSENCE de sa voisine survivante — la POST du lien magique,
 * le DELETE d'une catégorie, la lecture de soi à la racine. Si le montage
 * casse, ce sont ces témoins-là qui rougissent les premiers.
 *
 * La moitié négative a été prouvée à l'envers, comme l'exige la loi du dépôt :
 * ce fichier a d'abord été écrit ROUGE contre les routes encore montées, puis
 * les routes ont été retirées et il est passé au VERT.
 *
 * Le QUATRIÈME couple — `POST /api/v1/auth/validate-session`, un oracle pur
 * (« ce jeton est-il valide »), sans appelant — a été retiré lui aussi. Son
 * témoin d'absence n'est PAS ici : la route vivait dans `routes/auth/magic-link.ts`,
 * que ce fichier ne monte pas, et une assertion d'absence posée contre un module
 * jamais monté serait verte sans rien mesurer — exactement la mort silencieuse
 * que ce fichier s'interdit. Elle est portée par
 * `__tests__/security/route-auth-coverage.test.ts` (tableau `RETIREES` du test
 * « ne monte plus aucune route "to be implemented" »), qui lit le serveur
 * ASSEMBLÉ : plus simple, et plus fort.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks — dépendances lourdes du lien magique ─────────────────────────────

const mockValidateMagicLink = jest.fn() as jest.Mock<any>;

jest.mock('../../../services/MagicLinkService', () => ({
  MagicLinkService: jest.fn().mockImplementation(() => ({
    requestMagicLink: jest.fn(),
    validateMagicLink: (...args: unknown[]) => mockValidateMagicLink(...args),
  })),
}));

jest.mock('../../../services/CacheStore', () => ({ getCacheStore: () => ({}) }));
jest.mock('../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../services/GeoIPService', () => ({
  GeoIPService: jest.fn().mockImplementation(() => ({})),
  getRequestContext: jest.fn<any>().mockResolvedValue({
    ip: '127.0.0.1',
    userAgent: 'TestAgent/1.0',
    geoData: null,
    deviceInfo: null,
  }),
}));
jest.mock('../../../services/SessionService', () => ({
  initSessionService: jest.fn(),
  markSessionTrusted: jest.fn<any>().mockResolvedValue(true),
}));

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

// ─── Mocks — dépendances lourdes de « moi » ──────────────────────────────────

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../utils/socket-broadcast', () => ({ broadcastToUser: jest.fn() }));
jest.mock('../../../routes/me/delete-account', () => ({
  deleteAccountRoutes: jest.fn(async () => {}),
}));
jest.mock('../../../routes/me/export', () => ({
  dataExportRoutes: jest.fn(async () => {}),
}));
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(),
}));
jest.mock('../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn<any>(({ op }: { op: () => Promise<any> }) => op()),
}));
jest.mock('../../../services/ConsentValidationService', () => ({
  ConsentValidationService: jest.fn().mockImplementation(() => ({
    validatePreferences: jest.fn<any>().mockResolvedValue([]),
  })),
}));

// ─── Imports après les mocks ─────────────────────────────────────────────────

import { magicLinkRoutes } from '../../../routes/magic-link';
import meRoutes from '../../../routes/me/index';
import { createUnifiedAuthMiddleware } from '../../../middleware/auth';

const mockCreateAuth = createUnifiedAuthMiddleware as jest.MockedFunction<any>;

// Les PRÉFIXES DE PRODUCTION, jamais des préfixes de confort : la moitié des
// défauts de cette famille sont des défauts de COMPOSITION (`route-registration`
// monte `/api/v1/me`, la route déclarait `/me`, l'adresse réelle était
// `/api/v1/me/me`). Un test qui monte sans préfixe ne peut pas les voir.
const PREFIXE_AUTH = '/api/v1/auth';
const PREFIXE_ME = '/api/v1/me';

const USER_ID = 'usr-jumelles-0001';

async function construireAppAuth(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    ajv: { customOptions: { strict: false, keywords: ['example'] } },
  });
  app.decorate('prisma', {} as unknown);
  await app.register(magicLinkRoutes, { prefix: PREFIXE_AUTH });
  await app.ready();
  return app;
}

function construirePrisma() {
  return {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({
        id: USER_ID,
        username: 'alice',
        email: 'alice@example.com',
        displayName: 'Alice',
        avatar: null,
        role: 'USER',
      }),
    },
    userPreferences: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      upsert: jest.fn<any>().mockResolvedValue({ id: 'pref-1' }),
      update: jest.fn<any>().mockResolvedValue({}),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
    userPreference: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    userConversationCategory: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    signalPreKeyBundle: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
    $transaction: jest.fn<any>().mockResolvedValue([]),
  } as any;
}

async function construireAppMe(): Promise<FastifyInstance> {
  mockCreateAuth.mockImplementation(() => async (req: FastifyRequest) => {
    (req as any).auth = { userId: USER_ID, isAuthenticated: true };
  });

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', construirePrisma());
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID },
    };
  });
  await app.register(meRoutes, { prefix: PREFIXE_ME });
  await app.ready();
  return app;
}

// ═════════════════════════════════════════════════════════════════════════════
// Le lien magique n'a plus qu'UNE porte
// ═════════════════════════════════════════════════════════════════════════════

describe('Lien magique — la jumelle GET a été retirée (#4186)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await construireAppAuth(); });
  afterAll(async () => { await app.close(); });

  it("n'a plus de route GET /api/v1/auth/magic-link/validate dans sa table", () => {
    expect(app.hasRoute({ method: 'GET', url: `${PREFIXE_AUTH}/magic-link/validate` })).toBe(false);
  });

  it('rend 404 sur un lien qui porterait encore le jeton en query string', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `${PREFIXE_AUTH}/magic-link/validate?token=jeton-quelconque`,
    });
    expect(res.statusCode).toBe(404);
  });

  // ── Les deux témoins de VIE qui empêchent les deux témoins ci-dessus de
  //    mourir en silence : si le module cessait d'être monté, ceux-ci
  //    rougiraient AVANT que l'absence ne devienne triviale.
  it('garde la porte POST — la seule des deux qui appliquait la politique complète', () => {
    expect(app.hasRoute({ method: 'POST', url: `${PREFIXE_AUTH}/magic-link/validate` })).toBe(true);
  });

  it('garde la demande de lien magique', () => {
    expect(app.hasRoute({ method: 'POST', url: `${PREFIXE_AUTH}/magic-link/request` })).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// « Moi » : la remise à zéro globale et le segment doublé
// ═════════════════════════════════════════════════════════════════════════════

describe('Préférences et compte — les jumelles sans appelant ont été retirées (#4186)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await construireAppMe(); });
  afterAll(async () => { await app.close(); });

  it("n'a plus de DELETE /api/v1/me/preferences (remise à zéro globale sans appelant)", () => {
    expect(app.hasRoute({ method: 'DELETE', url: `${PREFIXE_ME}/preferences` })).toBe(false);
  });

  it('rend 404 sur la remise à zéro globale', async () => {
    const res = await app.inject({ method: 'DELETE', url: `${PREFIXE_ME}/preferences` });
    expect(res.statusCode).toBe(404);
  });

  it("n'a plus de GET /api/v1/me/me — le segment doublé de #4141 ne revient pas", () => {
    expect(app.hasRoute({ method: 'GET', url: `${PREFIXE_ME}/me` })).toBe(false);
  });

  it('rend 404 sur le segment doublé', async () => {
    const res = await app.inject({ method: 'GET', url: `${PREFIXE_ME}/me` });
    expect(res.statusCode).toBe(404);
  });

  // ── Témoins de VIE : la capacité produit est intacte (critère 5). Le
  //    « tout réinitialiser » reste atteignable catégorie par catégorie, et la
  //    lecture de soi reste à la racine du module.
  it('garde la remise à zéro par CATÉGORIE — la capacité ne disparaît pas', () => {
    expect(app.hasRoute({ method: 'DELETE', url: `${PREFIXE_ME}/preferences/privacy` })).toBe(true);
    expect(app.hasRoute({ method: 'DELETE', url: `${PREFIXE_ME}/preferences/audio` })).toBe(true);
  });

  it('garde la lecture agrégée des préférences', () => {
    expect(app.hasRoute({ method: 'GET', url: `${PREFIXE_ME}/preferences` })).toBe(true);
  });

  it('garde la lecture de soi à la racine du module', async () => {
    expect(app.hasRoute({ method: 'GET', url: PREFIXE_ME })).toBe(true);
    const res = await app.inject({ method: 'GET', url: PREFIXE_ME });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(USER_ID);
  });
});
