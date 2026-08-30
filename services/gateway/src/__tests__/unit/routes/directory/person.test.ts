/**
 * `GET /directory/people/:handle` — l'adresse canonique d'un profil (#4161).
 *
 * Quatre propriétés y sont gardées, et chacune correspond à un défaut MESURÉ en
 * intégration avant ce lot :
 *
 * 1. la charge ANONYME ne porte aucun des six champs privés ;
 * 2. la PRÉSENCE ne part que sur `?expand=presence` ;
 * 3. `?expand=stats` ne sert les quatre compteurs intimes qu'à soi et à
 *    l'administration — le témoin est posé sur un viewer AUTHENTIFIÉ et NON
 *    propriétaire, le seul cas qui distingue les deux versions ;
 * 4. un `If-None-Match` valide rend 304.
 *
 * Tous traversent `app.inject`, donc le VRAI sérialiseur : un témoin qui
 * appellerait le handler ne verrait pas ce que fast-json-stringify supprime, et
 * c'est précisément la couche où vivait le défaut.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

jest.mock('../../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));

// PROLONGER, jamais remplacer (règle du cycle 93). Seul `getOptionalAuth` est
// substitué — il construit un vrai middleware d'authentification qui, sans
// en-tête `Authorization`, ÉCRASE l'identité que le témoin vient de poser et
// rend tous ses viewers anonymes. `gateProfilePresence` et les helpers
// d'ordonnancement du même module restent les VRAIS : c'est la loi de présence
// du 2026-08-25 que ces témoins mesurent, et un double ne pourrait qu'attester
// l'absence d'un repli permissif là où le vrai code la prouve.
jest.mock('../../../../routes/users/presence-gate', () => ({
  ...(jest.requireActual('../../../../routes/users/presence-gate') as object),
  getOptionalAuth: () => async () => undefined,
}));

import { directoryPersonRoutes } from '../../../../routes/directory/person';

const PREFIXE = '/api/v1';
const CIBLE = '507f1f77bcf86cd799439011';
const TIERS = '507f1f77bcf86cd799439022';

/** Les six que le lot retire de la surface publique. */
const PRIVES_DE_PROFIL = [
  'systemLanguage',
  'regionalLanguage',
  'customDestinationLanguage',
  'isActive',
  'deactivatedAt',
  'updatedAt',
] as const;

/** Les quatre compteurs d'usage INTIME. */
const PRIVES_DE_STATS = [
  'totalMessages',
  'totalConversations',
  'totalTranslations',
  'friendRequestsReceived',
] as const;

function prismaDouble() {
  return {
    user: {
      // La ligne rend PLUS que la projection publique — c'est le point : si le
      // `select` venait à recharger les six champs, ils seraient là, et seule
      // la déclaration du schéma déciderait. Le témoin mesure donc la sortie.
      findFirst: jest.fn<any>(async () => ({
        id: CIBLE,
        username: 'cible',
        firstName: 'Ada',
        lastName: 'Lovelace',
        displayName: 'Ada',
        avatar: null,
        banner: null,
        bio: null,
        role: 'USER',
        isOnline: true,
        lastActiveAt: new Date('2026-08-01T10:00:00Z'),
        deactivatedAt: null,
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2026-08-28T00:00:00Z'),
        isActive: true,
        systemLanguage: 'fr',
        regionalLanguage: 'en',
        customDestinationLanguage: 'es',
        voiceModel: null,
      })),
      findUnique: jest.fn<any>(async () => ({ createdAt: new Date('2025-01-01T00:00:00Z') })),
    },
    message: { count: jest.fn<any>(async () => 69), groupBy: jest.fn<any>(async () => []) },
    participant: { count: jest.fn<any>(async () => 12) },
    friendRequest: {
      count: jest.fn<any>(async () => 3),
      findFirst: jest.fn<any>(async () => null),
    },
    post: { count: jest.fn<any>(async () => 7) },
  };
}

async function monter(viewerId: string | null, role = 'USER'): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prismaDouble() as never);
  (app as unknown as { redis?: unknown }).redis = undefined;
  // `getOptionalAuth` construit son middleware depuis `fastify.prisma` ; on lui
  // substitue une identité posée directement, comme le font les autres témoins
  // de route de ce répertoire.
  app.addHook('onRequest', async (req: any) => {
    // Le contexte ANONYME est celui de la PRODUCTION, sentinelle comprise :
    // `createUnauthenticatedContext` pose `userId: 'anonymous'`, une chaîne non
    // vide. Un double qui laissait ce champ absent rendait le témoin plus
    // FAVORABLE que la réalité — et c'est exactement ce qui a laissé passer un
    // `Cache-Control: private` servi à un anonyme, mesuré en intégration.
    req.authContext = viewerId
      ? { isAuthenticated: true, userId: viewerId, registeredUser: { id: viewerId, role } }
      : { isAuthenticated: false, isAnonymous: true, type: 'anonymous', userId: 'anonymous' };
  });
  await app.register(directoryPersonRoutes, { prefix: `${PREFIXE}/directory` });
  await app.ready();
  return app;
}

const lire = (app: FastifyInstance, qs = '', headers: Record<string, string> = {}) =>
  app.inject({ method: 'GET', url: `${PREFIXE}/directory/people/${CIBLE}${qs}`, headers });

describe('La charge publique ne porte pas les six champs privés', () => {
  it('un appelant ANONYME ne reçoit aucun des six', async () => {
    const app = await monter(null);

    const res = await lire(app);

    expect(res.statusCode).toBe(200);
    const data = res.json().data as Record<string, unknown>;
    expect(PRIVES_DE_PROFIL.filter((c) => c in data)).toEqual([]);
    // Et la charge n'est pas vide pour autant — resserrer ne doit pas vider.
    expect(data.id).toBe(CIBLE);
    expect(data.username).toBe('cible');
    await app.close();
  });

  it('ne porte pas non plus `autoTranslateEnabled`, ni `email`, ni `phoneNumber`', async () => {
    const app = await monter(null);

    const data = (await lire(app)).json().data as Record<string, unknown>;

    // Les trois étaient FABRIQUÉS par la composition : `autoTranslateEnabled`
    // écrit en dur à `true`, `email: ''`, `phoneNumber: undefined`.
    expect('autoTranslateEnabled' in data).toBe(false);
    expect('email' in data).toBe(false);
    expect('phoneNumber' in data).toBe(false);
    await app.close();
  });
});

describe('La présence ne part que sur demande', () => {
  it('sans `expand`, ni `isOnline` ni `lastActiveAt`', async () => {
    const app = await monter(TIERS);

    const data = (await lire(app)).json().data as Record<string, unknown>;

    expect('isOnline' in data).toBe(false);
    expect('lastActiveAt' in data).toBe(false);
    await app.close();
  });

  it('avec `expand=presence`, les champs sont là — MASQUÉS pour un non-ami', async () => {
    const app = await monter(TIERS);

    const data = (await lire(app, '?expand=presence')).json().data as Record<string, unknown>;

    // La loi du 2026-08-25 est INCHANGÉE : un tiers qui n'est pas ami accepté
    // ne lit pas la présence. `expand` décide si l'on POSE la question, jamais
    // de la réponse — un paramètre d'appelant ne lève pas une garde.
    expect('isOnline' in data).toBe(true);
    expect(data.isOnline).not.toBe(true);
    await app.close();
  });
});

describe('Les compteurs intimes de `?expand=stats`', () => {
  it('un TIERS authentifié ne reçoit aucun des quatre', async () => {
    const app = await monter(TIERS);

    const res = await lire(app, '?expand=stats');

    expect(res.statusCode).toBe(200);
    const stats = (res.json().data as { stats: Record<string, unknown> }).stats;
    expect(PRIVES_DE_STATS.filter((c) => c in stats)).toEqual([]);
    // Les compteurs d'AUDIENCE restent servis.
    expect(stats.postsCount).toBe(7);
    expect(stats.memberDays).toBeGreaterThan(0);
    await app.close();
  });

  it('le PROPRIÉTAIRE les reçoit', async () => {
    const app = await monter(CIBLE);

    const stats = ((await lire(app, '?expand=stats')).json().data as { stats: Record<string, unknown> }).stats;

    for (const compteur of PRIVES_DE_STATS) expect(compteur in stats).toBe(true);
    expect(stats.totalMessages).toBe(69);
    await app.close();
  });

  it("l'administration les reçoit", async () => {
    const app = await monter(TIERS, 'ADMIN');

    const stats = ((await lire(app, '?expand=stats')).json().data as { stats: Record<string, unknown> }).stats;

    for (const compteur of PRIVES_DE_STATS) expect(compteur in stats).toBe(true);
    await app.close();
  });
});

describe('Le cache conditionnel', () => {
  it('un `If-None-Match` valide rend 304 sans corps', async () => {
    const app = await monter(null);

    const premier = await lire(app);
    const etag = premier.headers.etag as string;
    expect(etag).toBeTruthy();

    const second = await lire(app, '', { 'if-none-match': etag });

    expect(second.statusCode).toBe(304);
    expect(second.body).toBe('');
    await app.close();
  });

  it("le vecteur d'expansion CHANGE le validateur", async () => {
    // Un ETag adossé au seul `updatedAt` rendrait le même validateur pour deux
    // charges différentes, et un 304 servirait alors une réponse sans ses
    // statistiques. C'est la raison pour laquelle il hache la charge SERVIE.
    const app = await monter(CIBLE);

    const nu = (await lire(app)).headers.etag;
    const avecStats = (await lire(app, '?expand=stats')).headers.etag;

    expect(nu).not.toBe(avecStats);
    await app.close();
  });

  it('un appelant ANONYME reçoit un cache PARTAGEABLE, un connecté non', async () => {
    const anonyme = await monter(null);
    const connecte = await monter(TIERS);

    const cA = (await lire(anonyme)).headers['cache-control'] as string;
    const cC = (await lire(connecte)).headers['cache-control'] as string;

    expect(cA).toContain('public');
    // La charge d'un lecteur connecté dépend de LUI : un cache partagé la
    // servirait à quelqu'un d'autre.
    expect(cC).toContain('private');
    expect(cC).not.toContain('public');
    await anonyme.close();
    await connecte.close();
  });
});

describe('`fields` ne peut que RESTREINDRE', () => {
  it('un champ hors projection ne fabrique rien', async () => {
    const app = await monter(null);

    const data = (await lire(app, '?fields=username,email,systemLanguage')).json().data as Record<string, unknown>;

    expect('email' in data).toBe(false);
    expect('systemLanguage' in data).toBe(false);
    expect(data.username).toBe('cible');
    // `id` survit toujours : sans lui la réponse ne dit plus de qui elle parle.
    expect(data.id).toBe(CIBLE);
    await app.close();
  });
});
