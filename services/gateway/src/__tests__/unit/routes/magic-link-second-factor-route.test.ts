/**
 * POST /magic-link/validate — la réponse PARTIELLE atteint vraiment le client (#4534)
 *
 * Deux disciplines se rejoignent ici :
 *
 * 1. **Qui AFFICHE ce que le résolveur élit ?** Le schéma fastify de cette
 *    route ne déclarait que la branche « session complète ».
 *    `fast-json-stringify` RETIRE tout champ non déclaré : une garde qui rend
 *    `requires2FA` sans l'inscrire au schéma serait invisible du client, et le
 *    compte protégé resterait sans porte de sortie (même défaut que
 *    `POST /login` avant #4138 — voir `routes/auth/login.ts:66-77`).
 * 2. **Qu'est-ce qui part À CÔTÉ ?** Une réponse « partielle » qui poserait
 *    quand même un cookie, un `sessionToken` ou un `expiresIn` n'aurait rien
 *    gardé. On relit la charge REMISE, ligne à ligne.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

const mockRequestMagicLink = jest.fn() as jest.Mock<any>;
const mockValidateMagicLink = jest.fn() as jest.Mock<any>;

jest.mock('../../../services/MagicLinkService', () => ({
  MagicLinkService: jest.fn().mockImplementation(() => ({
    requestMagicLink: (...args: unknown[]) => mockRequestMagicLink(...args),
    validateMagicLink: (...args: unknown[]) => mockValidateMagicLink(...args),
  })),
}));

const mockCacheStore = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => mockCacheStore,
}));

jest.mock('../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({})),
}));

const mockGetRequestContext = jest.fn() as jest.Mock<any>;
jest.mock('../../../services/GeoIPService', () => ({
  GeoIPService: jest.fn().mockImplementation(() => ({})),
  getRequestContext: (...args: unknown[]) => mockGetRequestContext(...args),
}));

const mockMarkSessionTrusted = jest.fn() as jest.Mock<any>;
jest.mock('../../../services/SessionService', () => ({
  initSessionService: jest.fn(),
  markSessionTrusted: (...args: unknown[]) => mockMarkSessionTrusted(...args),
}));

const mockRememberPendingDeviceTrust = jest.fn() as jest.Mock<any>;
jest.mock('../../../routes/auth/pending-device-trust', () => ({
  rememberPendingDeviceTrust: (...args: unknown[]) => mockRememberPendingDeviceTrust(...args),
}));

// Ce que la route REMET à la réponse, avant toute sérialisation (#10518) :
// un champ que seul le schéma retirerait y est encore visible.
const remis: unknown[] = [];
jest.mock('../../../utils/response.js', () => {
  const reel = jest.requireActual('../../../utils/response') as Record<string, unknown> & {
    sendSuccess: (...args: unknown[]) => unknown;
  };
  return {
    ...reel,
    sendSuccess: (...args: unknown[]) => {
      remis.push(args[1]);
      return reel.sendSuccess(...args);
    },
  };
});

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

import { magicLinkRoutes } from '../../../routes/magic-link';

const makePendingResult = (overrides: Record<string, unknown> = {}) => ({
  success: true,
  requires2FA: true,
  twoFactorToken: 'pending-2fa-token',
  user: { id: 'user-abc', username: 'alice' },
  rememberDevice: false,
  ...overrides,
});

const makeFullResult = (overrides: Record<string, unknown> = {}) => ({
  success: true,
  user: { id: 'user-abc', username: 'alice' },
  token: 'jwt-token-abc',
  sessionToken: 'session-token-xyz',
  session: { id: 'session-1', deviceType: 'desktop', isMobile: false, isTrusted: false, createdAt: new Date() },
  rememberDevice: false,
  ...overrides,
});

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    ajv: { customOptions: { strict: false, keywords: ['example'] } },
  });
  (app as any).decorate('prisma', {});
  await app.register(magicLinkRoutes, { prefix: '' });
  await app.ready();
  return app;
}

const validate = (app: FastifyInstance) =>
  app.inject({ method: 'POST', url: '/magic-link/validate', payload: { token: 'raw-token' } });

describe('POST /magic-link/validate — second facteur (#4534)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRequestContext.mockResolvedValue({ ip: '203.0.113.7', userAgent: 'TestAgent/1.0', geoData: null, deviceInfo: null });
    mockMarkSessionTrusted.mockResolvedValue(true);
    mockRememberPendingDeviceTrust.mockResolvedValue(undefined);
  });

  describe('compte AVEC second facteur', () => {
    beforeEach(() => {
      mockValidateMagicLink.mockResolvedValue(makePendingResult());
    });

    it('sert requires2FA et twoFactorToken — le schéma les laisse passer', async () => {
      const response = await validate(app);

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.requires2FA).toBe(true);
      expect(body.data.twoFactorToken).toBe('pending-2fa-token');
      expect(body.data.user.id).toBe('user-abc');
    });

    it('ne sert NI token NI sessionToken NI session NI expiresIn', async () => {
      const response = await validate(app);
      const body = response.json();

      expect(body.data.token).toBeUndefined();
      expect(body.data.sessionToken).toBeUndefined();
      expect(body.data.session).toBeUndefined();
      expect(body.data.expiresIn).toBeUndefined();
    });

    it("ne pose AUCUN cookie — une réponse partielle qui en poserait n'aurait rien gardé", async () => {
      const response = await validate(app);

      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it("ne marque aucune session de confiance : il n'y a pas de session", async () => {
      mockValidateMagicLink.mockResolvedValue(makePendingResult({ rememberDevice: true }));

      await validate(app);

      expect(mockMarkSessionTrusted).not.toHaveBeenCalled();
    });

    it('confie au SERVEUR la préférence « se souvenir », indexée par le jeton d\'étape 2', async () => {
      // #4471 : `POST /login/2fa` ne lit plus rien du corps du client. Le lien
      // magique devient un producteur d'étape 1 de plus, servi par la MÊME
      // mémoire — sans rien transporter, donc sans qu'aucune asymétrie ne
      // puisse se rouvrir entre les deux portes.
      mockValidateMagicLink.mockResolvedValue(makePendingResult({ rememberDevice: true }));

      await validate(app);

      expect(mockRememberPendingDeviceTrust).toHaveBeenCalledWith({
        store: mockCacheStore,
        twoFactorToken: 'pending-2fa-token',
        rememberDevice: true,
      });
    });

    it('ne sert pas la préférence au client — elle ne le regarde pas', async () => {
      mockValidateMagicLink.mockResolvedValue(makePendingResult({ rememberDevice: true }));

      const response = await validate(app);

      expect(response.json().data.rememberDevice).toBeUndefined();
    });
  });

  describe('le délai d’adoption servi avec la preuve (#10518)', () => {
    it('second facteur : le délai du DÉFI, et toujours aucune session à côté', async () => {
      mockValidateMagicLink.mockResolvedValue(makePendingResult());

      const data = (await validate(app)).json().data;

      expect(data.adoptWithinSeconds).toBe(300);
      expect(data.token).toBeUndefined();
      expect(data.sessionToken).toBeUndefined();
    });

    it('session prouvée : ce qui reste avant l’échéance de la SESSION, à travers le schéma réel', async () => {
      const adoptBy = new Date(Date.now() + 10 * 60 * 1000);
      mockValidateMagicLink.mockResolvedValue(makeFullResult({ session: { ...makeFullResult().session, adoptBy } }));

      const data = (await validate(app)).json().data;

      expect(data.adoptWithinSeconds).toBeGreaterThanOrEqual(595);
      expect(data.adoptWithinSeconds).toBeLessThanOrEqual(600);
      expect(data.session.adoptBy).toBeUndefined();
    });

    it('l’échéance d’adoption ne quitte pas la route : absente de ce qu’elle REMET, pas seulement de ce que le schéma laisse passer', async () => {
      const adoptBy = new Date(Date.now() + 10 * 60 * 1000);
      mockValidateMagicLink.mockResolvedValue(
        makeFullResult({ rememberDevice: true, session: { ...makeFullResult().session, adoptBy } })
      );
      remis.length = 0;

      await validate(app);

      expect(remis).toHaveLength(1);
      expect(JSON.stringify(remis[0])).not.toContain('adoptBy');
      expect(remis[0]).toMatchObject({ session: { id: 'session-1', isTrusted: true }, adoptWithinSeconds: expect.any(Number) });
    });

    it('« se souvenir de cet appareil » n’allonge pas le délai servi : 365 jours d’`expiresIn`, dix minutes pour adopter', async () => {
      const adoptBy = new Date(Date.now() + 10 * 60 * 1000);
      mockValidateMagicLink.mockResolvedValue(
        makeFullResult({ rememberDevice: true, session: { ...makeFullResult().session, adoptBy } })
      );

      const data = (await validate(app)).json().data;

      expect(data.expiresIn).toBe(365 * 24 * 60 * 60);
      expect(data.adoptWithinSeconds).toBeLessThanOrEqual(600);
    });

    it('le corps du client ne décide de rien', async () => {
      const adoptBy = new Date(Date.now() + 10 * 60 * 1000);
      mockValidateMagicLink.mockResolvedValue(makeFullResult({ session: { ...makeFullResult().session, adoptBy } }));

      const response = await app.inject({
        method: 'POST',
        url: '/magic-link/validate',
        payload: { token: 'raw-token', adoptWithinSeconds: 31536000 },
      });

      expect(response.json().data.adoptWithinSeconds).toBeLessThanOrEqual(600);
      expect(JSON.stringify(mockValidateMagicLink.mock.calls)).not.toContain('31536000');
    });

    it('une session que rien n’attend ne sert aucun délai', async () => {
      mockValidateMagicLink.mockResolvedValue(makeFullResult());

      const data = (await validate(app)).json().data;

      expect(data.token).toBe('jwt-token-abc');
      expect(data.adoptWithinSeconds).toBeUndefined();
    });
  });

  describe('compte SANS second facteur', () => {
    it('sert bien token et sessionToken', async () => {
      mockValidateMagicLink.mockResolvedValue(makeFullResult());

      const response = await validate(app);
      const body = response.json();

      expect(response.statusCode).toBe(200);
      expect(body.data.token).toBe('jwt-token-abc');
      expect(body.data.sessionToken).toBe('session-token-xyz');
      expect(body.data.requires2FA).toBeUndefined();
      expect(mockRememberPendingDeviceTrust).not.toHaveBeenCalled();
    });
  });
});
