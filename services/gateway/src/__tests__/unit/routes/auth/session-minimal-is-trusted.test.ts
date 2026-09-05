/**
 * `session.isTrusted` survit à la SÉRIALISATION des deux portes de connexion — #4535.
 *
 * ## Le défaut
 *
 * `formatSessionResponse` (`routes/auth/types.ts`) calcule `isTrusted` — c'est
 * son UNIQUE champ non-passthrough, tout le reste étant recopié depuis la ligne
 * `UserSession`. Le type qu'elle rend, `SessionResponseData`, le déclare.
 *
 * `sessionMinimalSchema` (`packages/shared/types/api-schemas/session.ts`), le
 * schéma de réponse que `POST /login` et `POST /login/2fa` posent sur ce même
 * objet, ne le déclarait PAS. `fast-json-stringify` compile un sérialiseur à
 * partir des `properties` déclarées et **supprime en silence** tout ce qui n'y
 * figure pas : la seule valeur que ces deux routes CALCULENT était la seule
 * qu'elles ne servaient pas. Sa sœur `sessionSchema`, dans le même fichier, le
 * déclare — le lien magique et la liste des sessions le servaient donc
 * correctement, ce qui rendait le défaut invisible à la lecture d'un client.
 *
 * ## Pourquoi ces témoins injectent au lieu d'appeler le handler
 *
 * **Un témoin qui appelle `formatSessionResponse` — ou qui lit l'objet rendu par
 * le handler — passe DÉJÀ, défaut présent.** La valeur a toujours été calculée ;
 * ce qui la perdait est la couche de sérialisation, en aval de tout ce qu'un
 * test unitaire de fonction pure peut observer. `auth-login.test.ts` illustre la
 * seconde manière de rater ce défaut : il MOCKE `sessionMinimalSchema` par
 * `{ id: { type: 'string' } }`, donc son sérialiseur n'est pas celui de la
 * production.
 *
 * D'où la forme retenue ici, et elle est le fond du lot :
 *
 * 1. **Aucun mock de `@meeshy/shared/types`** — le sérialiseur compilé par
 *    Fastify est celui que la production compile, au caractère près.
 * 2. **`app.inject()`**, jamais un appel direct : la réponse traverse
 *    `fast-json-stringify`.
 * 3. **L'assertion porte sur le CORPS SÉRIALISÉ** — `response.payload`, la
 *    chaîne JSON réellement mise sur le fil, et `response.json()` qui n'en est
 *    que la relecture. Jamais sur la valeur rendue par le handler.
 *
 * Le témoin de la chaîne brute (`payload`) n'est pas un doublon de celui de
 * l'objet : il est le seul qui ne puisse pas être satisfait par un objet
 * fabriqué en mémoire, et c'est lui qui DIT ce que le lot garde.
 *
 * ## Ce que ces témoins ne gardent pas
 *
 * L'EFFET de `rememberDevice` (appel à `markSessionTrusted`, `expiresIn` à 365
 * jours, mémoire serveur entre les deux étapes) est gardé par
 * `login-2fa-device-trust.test.ts` (#4471) — dont la note de tête nommait
 * précisément ce défaut-ci comme « voisin, hors de ce lot ». Ici on ne garde
 * qu'une chose : que la valeur servie ARRIVE.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────
// NOTE — `@meeshy/shared/types` n'est PAS mocké, et c'est la condition de
// validité de toute cette suite : c'est le VRAI `sessionMinimalSchema` que
// Fastify compile ici.

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
  },
}));

jest.mock('../../../../utils/rate-limiter.js', () => ({
  createLoginRateLimiter: jest.fn(() => ({ middleware: jest.fn(() => async () => {}) })),
  createAuthGlobalRateLimiter: jest.fn(() => ({ middleware: jest.fn(() => async () => {}) })),
  createTwoFactorLoginRateLimiter: jest.fn(() => ({ middleware: jest.fn(() => async () => {}) })),
}));

jest.mock('../../../../services/GeoIPService', () => ({
  getRequestContext: jest.fn<any>().mockResolvedValue({
    ip: '127.0.0.1',
    userAgent: 'test-agent',
    deviceInfo: { type: 'desktop' },
    geoData: null,
  }),
}));

jest.mock('../../../../services/SessionService', () => ({
  markSessionTrusted: jest.fn<any>().mockResolvedValue(true),
  invalidateAllSessions: jest.fn<any>().mockResolvedValue(undefined),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mock-revoke-token'),
  verify: jest.fn(),
}));

// ─── Import après les mocks ───────────────────────────────────────────────────

import { registerLoginRoutes } from '../../../../routes/auth/login';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const SESSION_ID = '507f1f77bcf86cd799439022';
const TWO_FACTOR_TOKEN = '2fa-token-xyz';

const mockUser = {
  id: USER_ID, username: 'alice', email: 'alice@test.com',
  firstName: 'Alice', lastName: 'Smith', displayName: 'Alice Smith',
  bio: null, avatar: null, banner: null, phoneNumber: null,
  role: 'USER', isActive: true, deactivatedAt: null,
  systemLanguage: 'en', regionalLanguage: 'en', customDestinationLanguage: null,
  autoTranslateEnabled: true, isOnline: true, lastActiveAt: new Date(),
  emailVerifiedAt: new Date(), phoneVerifiedAt: null, twoFactorEnabledAt: null,
  pendingEmail: null, pendingPhoneNumber: null, lastPasswordChange: null,
  lastLoginIp: null, lastLoginLocation: null, lastLoginDevice: null,
  profileCompletionRate: 80, createdAt: new Date(), updatedAt: new Date(),
};

/**
 * La ligne `UserSession` telle que la base la rend. `isTrusted` y vaut `false`
 * VOLONTAIREMENT : ce que les routes servent ne vient pas de cette colonne mais
 * du `rememberDevice` de la requête, et confondre les deux ferait passer le
 * témoin « true » pour de mauvaises raisons.
 */
const mockSession = {
  id: SESSION_ID, deviceType: 'desktop', browserName: 'Chrome', osName: 'Linux',
  location: 'Paris, France', isMobile: false, isTrusted: false, createdAt: new Date(),
};

/**
 * Une mémoire de préférence RÉELLE : `POST /login` y retient ce que la personne
 * a coché, `POST /login/2fa` l'y relit. C'est le seul chemin par lequel l'étape
 * 2 peut servir `isTrusted: true` (#4471), donc le seul qui permette de garder
 * la sérialisation des DEUX valeurs sur cette route.
 */
function makeMemoryStore() {
  const entries = new Map<string, string>();
  return {
    get: jest.fn<any>(async (key: string) => entries.get(key) ?? null),
    set: jest.fn<any>(async (key: string, value: string) => { entries.set(key, value); }),
    del: jest.fn<any>(async (key: string) => { entries.delete(key); }),
  };
}

type AuthServiceOptions = { readonly requires2FA: boolean };

function makeAuthService({ requires2FA }: AuthServiceOptions) {
  return {
    authenticate: jest.fn<any>().mockResolvedValue(
      requires2FA
        ? {
            user: mockUser,
            sessionToken: '',
            session: { ...mockSession, id: '' },
            requires2FA: true,
            twoFactorToken: TWO_FACTOR_TOKEN,
          }
        : {
            user: mockUser,
            sessionToken: 'session-token',
            session: mockSession,
            requires2FA: false,
          }
    ),
    generateToken: jest.fn<any>().mockReturnValue('jwt-access-token'),
    getUserPermissions: jest.fn<any>().mockReturnValue([]),
    completeAuthWith2FA: jest.fn<any>().mockResolvedValue({
      user: mockUser, sessionToken: 'session-token', session: mockSession,
    }),
    updateOnlineStatus: jest.fn<any>().mockResolvedValue(undefined),
    logout: jest.fn<any>().mockResolvedValue(true),
  } as any;
}

async function buildApp(options: AuthServiceOptions): Promise<{
  readonly app: FastifyInstance;
  readonly store: ReturnType<typeof makeMemoryStore>;
}> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).user = { userId: USER_ID };
  });
  const store = makeMemoryStore();
  registerLoginRoutes({
    fastify: app,
    authService: makeAuthService(options),
    redis: null,
    prisma: null,
    phoneTransferService: {} as any,
    smsService: {} as any,
    cacheStore: store,
  } as any);
  await app.ready();
  return { app, store };
}

const postLogin = (app: FastifyInstance, rememberDevice: boolean) =>
  app.inject({
    method: 'POST', url: '/login',
    payload: { username: 'alice', password: 'secret123', rememberDevice },
  });

const post2FA = (app: FastifyInstance) =>
  app.inject({
    method: 'POST', url: '/login/2fa',
    payload: { twoFactorToken: TWO_FACTOR_TOKEN, code: '123456' },
  });

/**
 * La session telle qu'elle sort du sérialiseur — relue depuis la CHAÎNE mise
 * sur le fil, jamais depuis un objet du handler.
 */
function servedSession(payload: string): Record<string, unknown> {
  return (JSON.parse(payload) as { data: { session: Record<string, unknown> } }).data.session;
}

// ─── POST /login — la porte du mot de passe ──────────────────────────────────

describe('#4535 — `POST /login` sert `session.isTrusted` sur le corps sérialisé', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('sert `isTrusted: true` quand la personne a coché « se souvenir de cet appareil »', async () => {
    const { app } = await buildApp({ requires2FA: false });

    const res = await postLogin(app, true);

    expect(res.statusCode).toBe(200);
    expect(servedSession(res.payload).isTrusted).toBe(true);
    await app.close();
  });

  it('sert `isTrusted: false` — PRÉSENT et faux — quand elle ne l\'a pas cochée', async () => {
    const { app } = await buildApp({ requires2FA: false });

    const res = await postLogin(app, false);

    expect(res.statusCode).toBe(200);
    const session = servedSession(res.payload);
    expect(session.isTrusted).toBe(false);
    expect(Object.keys(session)).toContain('isTrusted');
    await app.close();
  });

  it('met la clé `isTrusted` dans la CHAÎNE JSON, pas seulement dans un objet en mémoire', async () => {
    const { app } = await buildApp({ requires2FA: false });

    const res = await postLogin(app, true);

    expect(res.payload).toContain('"isTrusted":true');
    await app.close();
  });
});

// ─── POST /login/2fa — la porte du second facteur ────────────────────────────

describe('#4535 — `POST /login/2fa` sert `session.isTrusted` sur le corps sérialisé', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('sert `isTrusted: true` quand l\'étape 1 avait retenu la préférence', async () => {
    const { app } = await buildApp({ requires2FA: true });

    await postLogin(app, true);
    const res = await post2FA(app);

    expect(res.statusCode).toBe(200);
    expect(servedSession(res.payload).isTrusted).toBe(true);
    await app.close();
  });

  it('sert `isTrusted: false` — PRÉSENT et faux — quand l\'étape 1 ne l\'avait pas retenue', async () => {
    const { app } = await buildApp({ requires2FA: true });

    await postLogin(app, false);
    const res = await post2FA(app);

    expect(res.statusCode).toBe(200);
    const session = servedSession(res.payload);
    expect(session.isTrusted).toBe(false);
    expect(Object.keys(session)).toContain('isTrusted');
    await app.close();
  });

  it('met la clé `isTrusted` dans la CHAÎNE JSON, pas seulement dans un objet en mémoire', async () => {
    const { app } = await buildApp({ requires2FA: true });

    await postLogin(app, true);
    const res = await post2FA(app);

    expect(res.payload).toContain('"isTrusted":true');
    await app.close();
  });
});

// ─── Le lot n'a rien retiré au passage ───────────────────────────────────────

describe('#4535 — les autres champs de la session minimale continuent d\'être servis', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('sert les sept champs préexistants À CÔTÉ de `isTrusted`, sur les deux portes', async () => {
    const expected = {
      id: SESSION_ID,
      deviceType: 'desktop',
      browserName: 'Chrome',
      osName: 'Linux',
      location: 'Paris, France',
      isMobile: false,
    };

    const passwordDoor = await buildApp({ requires2FA: false });
    const fromLogin = servedSession((await postLogin(passwordDoor.app, true)).payload);
    await passwordDoor.app.close();

    const secondFactorDoor = await buildApp({ requires2FA: true });
    await postLogin(secondFactorDoor.app, true);
    const from2FA = servedSession((await post2FA(secondFactorDoor.app)).payload);
    await secondFactorDoor.app.close();

    expect(fromLogin).toMatchObject(expected);
    expect(from2FA).toMatchObject(expected);
    expect(typeof fromLogin.createdAt).toBe('string');
    expect(typeof from2FA.createdAt).toBe('string');
  });
});
