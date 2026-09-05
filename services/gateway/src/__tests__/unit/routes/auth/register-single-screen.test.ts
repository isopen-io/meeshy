/**
 * `POST /auth/register` depuis UN écran à trois champs, de bout en bout (#5216).
 *
 * Ce fichier monte la route avec les schémas RÉELS et un service RÉEL au-dessus
 * d'un double de Prisma : ce qui s'y mesure est ce que la base recevrait et ce
 * que le client lirait — pas ce qu'un mock veut bien rendre.
 *
 * Trois familles :
 *
 * 1. **l'identité DÉRIVÉE** — pseudo généré, prénom/nom découpés, CGU gravées ;
 * 2. **le remboursement de tentative** — un 400 la rend, un 409 la garde ;
 * 3. **ce qui n'attend PAS la réponse** — e-mail de vérification, annonce
 *    d'arrivée, reprise de la géolocalisation.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

const mockSendEmailVerification = jest.fn(async () => ({ success: true, provider: 'test', messageId: 'm' }));
jest.mock('../../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendEmailVerification: mockSendEmailVerification,
  })),
}));

jest.mock('../../../../services/SessionService', () => ({
  generateSessionToken: jest.fn(() => 'session-token-5216'),
  createSession: jest.fn(async () => ({ id: 'session-5216' })),
  initSessionService: jest.fn(),
  validateSession: jest.fn(),
  getUserSessions: jest.fn(),
  invalidateSession: jest.fn(),
  invalidateAllSessions: jest.fn(),
  logout: jest.fn(),
}));

// Le hachage est réel mais lent (coût 12) : trois centaines de millisecondes par
// témoin, pour une propriété que `password-hash` garde chez lui.
jest.mock('../../../../utils/password-hash', () => ({
  ...(jest.requireActual('../../../../utils/password-hash') as Record<string, unknown>),
  hashPassword: jest.fn(async () => '$2b$12$hash-de-test'),
}));

// `getRequestContext` appelle `lookupGeoIp` EN INTERNE : doubler la seule
// fonction exportée laisserait le contexte de requête taper le vrai tiers.
// Les deux sont donc doublées ENSEMBLE, en préservant leur relation — le
// contexte prend la borne courte, la reprise n'en prend aucune — et le reste du
// module (extraction d'IP, `isPrivateIp`) reste RÉEL : c'est lui qui décide s'il
// y a quelque chose à reprendre.
const mockLookupGeoIp = jest.fn() as jest.Mock<any>;
jest.mock('../../../../services/GeoIPService', () => {
  const reel = jest.requireActual('../../../../services/GeoIPService') as Record<string, any>;
  return {
    ...reel,
    lookupGeoIp: (ip: string, options?: unknown) => mockLookupGeoIp(ip, options),
    getRequestContext: async (request: any, options?: { geoTimeoutMs?: number }) => {
      const ip = reel.extractIpFromRequest(request);
      return {
        ip,
        userAgent: reel.extractUserAgent(request),
        geoData: await mockLookupGeoIp(ip, { timeoutMs: options?.geoTimeoutMs }),
        deviceInfo: null,
      };
    },
  };
});

import { AuthService } from '../../../../services/AuthService';
import { registerRegistrationRoutes } from '../../../../routes/auth/register';
import { CURRENT_TERMS_VERSION } from '@meeshy/shared/types/terms';
import { executeurImmediat } from '../../../helpers/after-response';

type LigneCreee = Record<string, unknown>;

const passerelle = (options: { readonly prisPseudos?: readonly string[] } = {}) => {
  const pris = new Set((options.prisPseudos ?? []).map((p) => p.toLowerCase()));
  const create = jest.fn(async (args: unknown) => ({
    id: 'user-5216',
    ...((args as { data: LigneCreee }).data),
  }));
  const update = jest.fn(async (_args: unknown) => ({ id: 'user-5216' }));

  return {
    create,
    update,
    prisma: {
      user: {
        findFirst: jest.fn(async (args: any) => {
          const demande = args?.where?.username?.equals ?? args?.where?.OR?.[0]?.username?.equals;
          return demande && pris.has(String(demande).toLowerCase()) ? { username: demande, email: 'autre@example.com' } : null;
        }),
        findMany: jest.fn(async (args: any) =>
          (args?.where?.username?.in ?? [])
            .filter((u: string) => pris.has(u.toLowerCase()))
            .map((username: string) => ({ username })),
        ),
        create,
        update,
      },
      conversation: { findFirst: jest.fn(async () => null) },
      participant: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => ({ id: 'part-5216' })),
        update: jest.fn(async () => ({ id: 'part-5216' })),
      },
    },
  };
};

const monter = async (options: Parameters<typeof passerelle>[0] = {}) => {
  const { prisma, create, update } = passerelle(options);
  const differe = executeurImmediat();
  const app = Fastify({
    logger: false,
    ajv: { customOptions: { strict: 'log' as const, keywords: ['example'] } },
  });
  app.decorate('prisma', prisma as never);

  const registerRateLimiter = { middleware: jest.fn(() => async () => {}), refund: jest.fn(async () => {}), keyFor: jest.fn(() => 'ip:test') };
  const authGlobalRateLimiter = { middleware: jest.fn(() => async () => {}), refund: jest.fn(async () => {}), keyFor: jest.fn(() => 'ip:test') };
  jest.doMock('../../../../utils/rate-limiter.js', () => ({
    createRegisterRateLimiter: () => registerRateLimiter,
    createAuthGlobalRateLimiter: () => authGlobalRateLimiter,
  }));

  registerRegistrationRoutes({
    fastify: app,
    authService: new AuthService(prisma as never, 'secret-de-test'),
    phoneTransferService: { getTransferDataByToken: jest.fn(), executeRegistrationTransfer: jest.fn() },
    smsService: {},
    cacheStore: {},
    redis: null,
    prisma,
    afterResponse: differe.afterResponse,
  } as never);

  await app.ready();
  return { app, prisma, create, update, differe };
};

const CORPS = {
  displayName: 'Lena Vogel',
  email: 'lena@example.com',
  password: 'motdepasse',
};

const inscrire = (app: FastifyInstance, corps: Record<string, unknown> = CORPS, headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: '/register', payload: corps, headers });

const ligne = (create: jest.Mock): LigneCreee =>
  (create.mock.calls[0] as [{ data: LigneCreee }])[0].data;

describe('POST /register — trois champs suffisent, le serveur DÉRIVE le reste', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLookupGeoIp.mockResolvedValue(null);
  });

  it('crée le compte et sert son pseudo GÉNÉRÉ', async () => {
    const { app, create } = await monter();

    const res = await inscrire(app);

    expect(res.statusCode).toBe(200);
    expect(res.json().data.user.username).toBe('lena-vogel');
    expect(ligne(create).username).toBe('lena-vogel');
    await app.close();
  });

  it('découpe le nom affiché en prénom / nom, et PERSISTE la saisie telle quelle', async () => {
    const { app, create } = await monter();

    await inscrire(app);

    expect(ligne(create)).toMatchObject({
      firstName: 'Lena',
      lastName: 'Vogel',
      displayName: 'Lena Vogel',
    });
    await app.close();
  });

  it('laisse le NOM vide pour un mononyme — la colonne est non nullable, on n’invente pas', async () => {
    const { app, create } = await monter();

    const res = await inscrire(app, { ...CORPS, displayName: 'Prince' });

    expect(res.statusCode).toBe(200);
    expect(ligne(create)).toMatchObject({ firstName: 'Prince', lastName: '' });
    await app.close();
  });

  it('contourne un pseudo déjà pris SANS refuser — personne ne l’avait demandé', async () => {
    const { app, create } = await monter({ prisPseudos: ['lena-vogel'] });

    const res = await inscrire(app);

    expect(res.statusCode).toBe(200);
    expect(ligne(create).username).toBe('lena-vogel1');
    await app.close();
  });

  it('grave les CGU : l’acte de création VAUT acceptation', async () => {
    const { app, create } = await monter();

    await inscrire(app);

    expect(ligne(create).termsVersion).toBe(CURRENT_TERMS_VERSION);
    expect(ligne(create).termsAcceptedAt).toBeInstanceOf(Date);
    await app.close();
  });

  it('indexe le compte à la création — un compte sans jetons est introuvable', async () => {
    const { app, create } = await monter();

    await inscrire(app);

    expect(ligne(create).searchTokens).toEqual(expect.arrayContaining(['le', 'len', 'lena', 'vo', 'vog']));
    await app.close();
  });

  it('accepte encore la charge HÉRITÉE, et garde le pseudo DEMANDÉ', async () => {
    const { app, create } = await monter();

    const res = await inscrire(app, {
      username: 'lena',
      firstName: 'Lena',
      lastName: 'Vogel',
      email: 'lena@example.com',
      password: 'motdepasse',
    });

    expect(res.statusCode).toBe(200);
    expect(ligne(create).username).toBe('lena');
    await app.close();
  });

  it('REFUSE un pseudo DEMANDÉ déjà pris — on ne renomme personne dans son dos', async () => {
    const { app } = await monter({ prisPseudos: ['lena'] });

    const res = await inscrire(app, {
      username: 'lena',
      firstName: 'Lena',
      lastName: 'Vogel',
      email: 'lena@example.com',
      password: 'motdepasse',
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'USERNAME_TAKEN', field: 'username' });
    expect(res.json().suggestions.length).toBeGreaterThan(0);
    await app.close();
  });
});

describe('POST /register — un numéro illisible NOMME son champ', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLookupGeoIp.mockResolvedValue(null);
  });

  it('rend 400 PHONE_INVALID sur le champ phoneNumber', async () => {
    const { app, create } = await monter();

    const res = await inscrire(app, { ...CORPS, phoneNumber: 'pas-un-numero', phoneCountryCode: 'FR' });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'PHONE_INVALID', field: 'phoneNumber' });
    expect(create).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('POST /register — ce qui n’attend PAS la réponse (#5216)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLookupGeoIp.mockResolvedValue(null);
  });

  it("diffère l'e-mail de vérification — il ne conditionne aucun champ de la réponse", async () => {
    const { app, differe } = await monter();

    const res = await inscrire(app);

    expect(res.statusCode).toBe(200);
    expect(differe.labels).toContain('registration-verification-email');
    await differe.settle();
    expect(mockSendEmailVerification).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("reprend la géolocalisation APRÈS avoir répondu, et complète la ligne", async () => {
    const { app, differe, update } = await monter();
    // La borne courte de la réponse abandonne ; la reprise, elle, trouve.
    mockLookupGeoIp
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ location: 'Berlin, Germany', country: 'DE', timezone: 'Europe/Berlin' });

    const res = await inscrire(app, CORPS, { 'x-forwarded-for': '203.0.113.7' });
    await differe.settle();

    expect(res.statusCode).toBe(200);
    expect(differe.labels).toContain('registration-geoip-backfill');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-5216' },
      data: {
        registrationLocation: 'Berlin, Germany',
        registrationCountry: 'DE',
        timezone: 'Europe/Berlin',
        lastLoginLocation: 'Berlin, Germany',
      },
    });
    await app.close();
  });

  it("ne borne la PREMIÈRE recherche qu'à 400 ms — la reprise n'a pas de borne", async () => {
    const { app, differe } = await monter();
    mockLookupGeoIp.mockResolvedValue(null);

    await inscrire(app, CORPS, { 'x-forwarded-for': '203.0.113.7' });
    await differe.settle();

    expect(mockLookupGeoIp.mock.calls[0][1]).toEqual({ timeoutMs: 400 });
    expect(mockLookupGeoIp.mock.calls[1]?.[1]).toBeUndefined();
    await app.close();
  });

  it("ne reprend RIEN quand la géolocalisation a déjà répondu", async () => {
    const { app, differe, update } = await monter();
    mockLookupGeoIp.mockResolvedValue({ location: 'Paris, France', country: 'FR', timezone: 'Europe/Paris' });

    await inscrire(app, CORPS, { 'x-forwarded-for': '203.0.113.7' });
    await differe.settle();

    expect(differe.labels).not.toContain('registration-geoip-backfill');
    expect(update).not.toHaveBeenCalled();
    await app.close();
  });

  it("ne reprend RIEN pour une adresse PRIVÉE — elle a déjà rendu tout ce qu'elle rendra", async () => {
    const { app, differe } = await monter();
    mockLookupGeoIp.mockResolvedValue(null);

    await inscrire(app, CORPS, { 'x-forwarded-for': '192.168.1.4' });
    await differe.settle();

    expect(differe.labels).not.toContain('registration-geoip-backfill');
    await app.close();
  });
});
