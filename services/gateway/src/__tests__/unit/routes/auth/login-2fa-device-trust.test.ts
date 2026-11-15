/**
 * `rememberDevice` sur la branche à DEUX FACTEURS — #4471.
 *
 * La préférence « se souvenir de cet appareil » est exprimée à l'ÉTAPE 1
 * (`POST /login`) et consommée à l'ÉTAPE 2 (`POST /login/2fa`), où elle a un
 * effet mesurable : `markSessionTrusted` (qui pose `UserSession.isTrusted` et
 * repousse `expiresAt`), `expiresIn` à 365 jours, `session.isTrusted` servi.
 *
 * La passerelle la RENVOYAIT à l'étape 1 (« echo … to be replayed on POST
 * /login/2fa ») puis la RELISAIT dans le CORPS de l'étape 2. Deux défauts en
 * un, et ils tirent en sens contraires :
 *
 * 1. **Elle est perdue.** Aucun client ne rejoue l'écho — mesuré des deux
 *    côtés en livrant #4419 et #4458 : `two-factor.service.ts.verify()` prend
 *    deux paramètres et poste `{ twoFactorToken, code }`, et les trois clés de
 *    session posées par les chemins de connexion ne portent pas ce champ. La
 *    personne qui coche la case ne l'obtient jamais.
 * 2. **Elle est usurpable.** L'étape 2 accordait 365 jours de confiance sur la
 *    seule foi du corps de la requête, sans AUCUN lien avec ce que la personne
 *    avait coché à l'étape 1 : présenter `rememberDevice: true` suffisait.
 *
 * La loi que ces témoins gardent est celle que le dépôt applique déjà au lien
 * magique (`routes/magic-link.ts` : « Use rememberDevice from SERVER-SIDE
 * storage (not from client request) ») : **la préférence est retenue par le
 * SERVEUR entre les deux étapes, et le corps de l'étape 2 ne la décide pas.**
 * Aucun client n'a alors rien à transporter — les deux chemins d'étape 1
 * (formulaire et lien magique) sont servis par la même mémoire.
 *
 * NOTE — l'effet gardé ici est `expiresIn` et l'appel à `markSessionTrusted`
 * (qui pose `UserSession.isTrusted` et repousse `expiresAt`), JAMAIS
 * `data.session.isTrusted`. Cette note disait jusqu'à #4535 que le champ était
 * supprimé du corps servi, faute d'être déclaré par `sessionMinimalSchema` ;
 * c'était vrai, ça ne l'est plus — il est déclaré depuis
 * `packages/shared/types/api-schemas/session.ts`, et le corps SÉRIALISÉ le
 * porte. La séparation reste voulue : ce fichier garde l'EFFET de session,
 * `session-minimal-is-trusted.test.ts` garde le champ SERVI. Deux gardes, deux
 * questions — les fondre ferait passer l'une pour l'autre.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

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

const mockMarkSessionTrusted = jest.fn<any>().mockResolvedValue(true);
jest.mock('../../../../services/SessionService', () => ({
  markSessionTrusted: (...args: any[]) => mockMarkSessionTrusted(...args),
  invalidateAllSessions: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mock-revoke-token'),
  verify: jest.fn(),
}));

jest.mock('@meeshy/shared/utils/validation', () => ({
  AuthSchemas: { login: {} },
  validateSchema: (_s: any, data: any) => ({
    username: (data as any)?.username,
    password: (data as any)?.password,
    rememberDevice: (data as any)?.rememberDevice ?? false,
  }),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerLoginRoutes } from '../../../../routes/auth/login';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const TWO_FACTOR_TOKEN = '2fa-token-xyz';
const DAY = 24 * 60 * 60;
const YEAR = 365 * DAY;

const mockUser = {
  id: USER_ID, username: 'alice', email: 'alice@test.com',
  firstName: 'Alice', lastName: 'Smith', displayName: 'Alice Smith',
  bio: null, avatar: null, banner: null, phoneNumber: null,
  role: 'USER', isActive: true, deactivatedAt: null,
  systemLanguage: 'en', regionalLanguage: 'en', customDestinationLanguage: null,
  autoTranslateEnabled: true, isOnline: true, lastActiveAt: new Date(),
  emailVerifiedAt: new Date(), phoneVerifiedAt: null, twoFactorEnabledAt: new Date(),
  pendingEmail: null, pendingPhoneNumber: null, lastPasswordChange: null,
  lastLoginIp: null, lastLoginLocation: null, lastLoginDevice: null,
  profileCompletionRate: 80, createdAt: new Date(), updatedAt: new Date(),
};

const mockSession = {
  id: 'session-1', deviceType: 'desktop', browserName: 'Chrome', osName: 'Linux',
  location: null, isMobile: false, isTrusted: false, createdAt: new Date(),
};

/**
 * Une mémoire de service RÉELLE (pas un espion) : ce qu'on garde est le
 * COMPORTEMENT observable de bout en bout — ce que l'étape 2 sert après ce que
 * l'étape 1 a retenu — jamais la forme des appels au cache.
 */
function makeMemoryStore() {
  const entries = new Map<string, string>();
  return {
    entries,
    get: jest.fn<any>(async (key: string) => entries.get(key) ?? null),
    set: jest.fn<any>(async (key: string, value: string) => { entries.set(key, value); }),
    del: jest.fn<any>(async (key: string) => { entries.delete(key); }),
  };
}

function makeAuthService() {
  return {
    authenticate: jest.fn<any>().mockResolvedValue({
      user: mockUser,
      sessionToken: '',
      session: { ...mockSession, id: '' },
      requires2FA: true,
      twoFactorToken: TWO_FACTOR_TOKEN,
    }),
    generateToken: jest.fn<any>().mockReturnValue('jwt-access-token'),
    getUserPermissions: jest.fn<any>().mockReturnValue([]),
    completeAuthWith2FA: jest.fn<any>().mockResolvedValue({
      user: mockUser, sessionToken: 'session-token', session: mockSession,
    }),
    updateOnlineStatus: jest.fn<any>().mockResolvedValue(undefined),
    logout: jest.fn<any>().mockResolvedValue(true),
  } as any;
}

async function buildApp(cacheStore: unknown): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).user = { userId: USER_ID };
  });
  registerLoginRoutes({
    fastify: app,
    authService: makeAuthService(),
    redis: null,
    prisma: null,
    phoneTransferService: {} as any,
    smsService: {} as any,
    cacheStore,
  } as any);
  await app.ready();
  return app;
}

const step1 = (app: FastifyInstance, rememberDevice: boolean) =>
  app.inject({
    method: 'POST', url: '/login',
    payload: { username: 'alice', password: 'secret123', rememberDevice },
  });

const step2 = (app: FastifyInstance, body: Record<string, unknown> = {}) =>
  app.inject({
    method: 'POST', url: '/login/2fa',
    payload: { twoFactorToken: TWO_FACTOR_TOKEN, code: '123456', ...body },
  });

// ─── Ce que l'étape 1 retient, l'étape 2 le sert ─────────────────────────────

describe('#4471 — la préférence cochée à l\'étape 1 survit au second facteur', () => {
  beforeEach(() => { mockMarkSessionTrusted.mockReset(); mockMarkSessionTrusted.mockResolvedValue(true); });

  it('sert une session de confiance de 365 jours SANS que le client rejoue quoi que ce soit', async () => {
    const app = await buildApp(makeMemoryStore());

    await step1(app, true);
    // Le corps que TOUS les clients mesurés envoient : `{ twoFactorToken, code }`.
    const res = await step2(app);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.expiresIn).toBe(YEAR);
    await Promise.resolve();
    expect(mockMarkSessionTrusted).toHaveBeenCalled();
    await app.close();
  });

  it('sans la case cochée : 24 heures, aucune session de confiance', async () => {
    const app = await buildApp(makeMemoryStore());

    await step1(app, false);
    const res = await step2(app);

    expect(res.json().data.expiresIn).toBe(DAY);
    await Promise.resolve();
    expect(mockMarkSessionTrusted).not.toHaveBeenCalled();
    await app.close();
  });
});

// ─── Ce que le CORPS de l'étape 2 prétend ne décide rien ─────────────────────

describe('#4471 — le corps du second facteur ne s\'accorde pas la confiance', () => {
  beforeEach(() => { mockMarkSessionTrusted.mockReset(); mockMarkSessionTrusted.mockResolvedValue(true); });

  it('ignore `rememberDevice: true` dans le corps quand l\'étape 1 ne l\'a pas demandé', async () => {
    const app = await buildApp(makeMemoryStore());

    await step1(app, false);
    const res = await step2(app, { rememberDevice: true });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.expiresIn).toBe(DAY);
    await Promise.resolve();
    expect(mockMarkSessionTrusted).not.toHaveBeenCalled();
    await app.close();
  });

  it('ignore `rememberDevice: true` quand AUCUNE étape 1 n\'a eu lieu (jeton expiré, mémoire vide)', async () => {
    const app = await buildApp(makeMemoryStore());

    const res = await step2(app, { rememberDevice: true });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.expiresIn).toBe(DAY);
    await Promise.resolve();
    expect(mockMarkSessionTrusted).not.toHaveBeenCalled();
    await app.close();
  });
});

// ─── La préférence ne sert QU'UNE fois, et son absence ne casse rien ─────────

describe('#4471 — la mémoire de la préférence est à usage unique et faillible sans dommage', () => {
  beforeEach(() => { mockMarkSessionTrusted.mockReset(); mockMarkSessionTrusted.mockResolvedValue(true); });

  it('ne rejoue pas la confiance sur une seconde présentation du même jeton', async () => {
    const app = await buildApp(makeMemoryStore());

    await step1(app, true);
    expect((await step2(app)).json().data.expiresIn).toBe(YEAR);

    mockMarkSessionTrusted.mockReset();
    const replay = await step2(app);

    expect(replay.json().data.expiresIn).toBe(DAY);
    await Promise.resolve();
    expect(mockMarkSessionTrusted).not.toHaveBeenCalled();
    await app.close();
  });

  it('sert 200 sans confiance quand la mémoire est indisponible (fail-closed)', async () => {
    const brokenStore = {
      get: jest.fn<any>(async () => { throw new Error('redis down'); }),
      set: jest.fn<any>(async () => { throw new Error('redis down'); }),
      del: jest.fn<any>(async () => { throw new Error('redis down'); }),
    };
    const app = await buildApp(brokenStore);

    expect((await step1(app, true)).statusCode).toBe(200);
    const res = await step2(app);

    expect(res.statusCode).toBe(200);
    expect(res.json().data.expiresIn).toBe(DAY);
    await Promise.resolve();
    expect(mockMarkSessionTrusted).not.toHaveBeenCalled();
    await app.close();
  });

  it('sert 200 sans confiance quand aucune mémoire n\'est câblée du tout', async () => {
    const app = await buildApp(undefined);

    expect((await step1(app, true)).statusCode).toBe(200);
    const res = await step2(app);

    expect(res.statusCode).toBe(200);
    expect(res.json().data.expiresIn).toBe(DAY);
    await Promise.resolve();
    expect(mockMarkSessionTrusted).not.toHaveBeenCalled();
    await app.close();
  });
});

// ─── L'écho disparaît : plus rien ne DEMANDE au client de rejouer ────────────

describe('#4471 — la réponse du premier facteur n\'écho plus une préférence à rejouer', () => {
  it('ne sert pas `rememberDevice` sur la branche `requires2FA`', async () => {
    const app = await buildApp(makeMemoryStore());

    const res = await step1(app, true);

    const body = res.json();
    expect(body.data.requires2FA).toBe(true);
    expect(body.data.twoFactorToken).toBe(TWO_FACTOR_TOKEN);
    expect(body.data).not.toHaveProperty('rememberDevice');
    await app.close();
  });
});
