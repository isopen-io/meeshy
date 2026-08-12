/**
 * `POST /signal/session/establish` — l'établissement de session E2EE face à un
 * membre qui a quitté la conversation.
 *
 * Le fichier `routes/signal-protocol.ts` annonce en en-tête qu'il protège contre
 * le « key scraping » et l'« épuisement des pré-clés », et `GET /signal/keys/:userId`
 * tient cette promesse : il exige une conversation partagée où **les deux
 * côtés** sont `isActive: true` (ou une amitié acceptée).
 *
 * Cent lignes plus bas, dans le MÊME fichier, les deux gardes d'appartenance de
 * `POST /signal/session/establish` ne filtraient ni l'une ni l'autre sur
 * `isActive`. Deux conséquences, et la seconde n'est pas une abstraction :
 *
 *  1. Un ancien membre — dont la ligne `Participant` reste en base après un
 *     départ, à `isActive: false` — établissait encore une session dans une
 *     conversation qu'il a quittée.
 *  2. Cette route **consomme la pré-clé à usage unique du destinataire**
 *     (`preKeyId: null, preKeyPublic: null`). Un ancien membre qui a gardé
 *     l'identifiant de conversation en cache local pouvait donc détruire à
 *     volonté la pré-clé de n'importe quel membre resté — c'est-à-dire
 *     exactement l'épuisement de pré-clés que l'en-tête dit prévenir, par la
 *     porte qui ne vérifie pas ce que la porte voisine vérifie.
 *
 * Le double Prisma de ce fichier DISCRIMINE sur `isActive` — celui de
 * `signal-protocol-routes.test.ts` rend ses deux lignes dans l'ordre d'appel,
 * quel que soit le `where`, et ne pouvait donc pas voir ce défaut.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../services/EncryptionService', () => ({
  getEncryptionService: jest.fn().mockResolvedValue({
    getSignalService: () => ({}),
  }),
}));

jest.mock('@fastify/rate-limit', () => async function noOpRateLimit() {});

jest.mock('../../../middleware/rate-limiter', () => ({
  createSignalProtocolRateLimitConfig: jest.fn(() => ({})),
}));

const CALLER_ID = '507f1f77bcf86cd799439011';
const RECIPIENT_ID = '507f1f77bcf86cd799439012';
const CONV_ID = '507f1f77bcf86cd799439013';

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() =>
    async (request: any) => {
      request.authContext = {
        isAuthenticated: true,
        isAnonymous: false,
        userId: '507f1f77bcf86cd799439011',
      };
    }
  ),
  UnifiedAuthRequest: {},
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object', additionalProperties: true },
  signalPreKeyBundleSchema: { type: 'object', additionalProperties: true },
  generatePreKeyBundleRequestSchema: { type: 'object', additionalProperties: true },
  generatePreKeyBundleResponseSchema: { type: 'object', additionalProperties: true },
  getPreKeyBundleResponseSchema: { type: 'object', additionalProperties: true },
  establishSessionRequestSchema: { type: 'object', additionalProperties: true },
  establishSessionResponseSchema: { type: 'object', additionalProperties: true },
}));

import signalProtocolRoutes from '../../../routes/signal-protocol';

// ─── Données ──────────────────────────────────────────────────────────────────

const BASE64_KEY = Buffer.from('test-key-data-32-bytes-padding!!!').toString('base64');

const BUNDLE_RECORD = {
  identityKey: BASE64_KEY,
  registrationId: 42,
  deviceId: 1,
  preKeyId: 1,
  preKeyPublic: BASE64_KEY,
  signedPreKeyId: 10,
  signedPreKeyPublic: BASE64_KEY,
  signedPreKeySignature: BASE64_KEY,
  kyberPreKeyId: 20,
  kyberPreKeyPublic: BASE64_KEY,
  kyberPreKeySignature: BASE64_KEY,
};

const AUTH = { authorization: 'Bearer valid-token' };
const BODY = { recipientUserId: RECIPIENT_ID, conversationId: CONV_ID };

/**
 * Le double honore le `where` : une ligne `isActive: false` ne sort pas d'un
 * `where` qui exige `isActive: true`. C'est cette discrimination qui rend le
 * test capable de voir le défaut.
 */
function buildPrisma(opts: { callerActive: boolean; recipientActive: boolean }) {
  const rows = [
    { userId: CALLER_ID, conversationId: CONV_ID, isActive: opts.callerActive },
    { userId: RECIPIENT_ID, conversationId: CONV_ID, isActive: opts.recipientActive },
  ];

  return {
    signalPreKeyBundle: {
      findUnique: jest.fn().mockResolvedValue(BUNDLE_RECORD),
      update: jest.fn().mockResolvedValue({}),
      upsert: jest.fn().mockResolvedValue({}),
    },
    participant: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(async (args: any) => {
        const where = args?.where ?? {};
        return (
          rows.find(
            (row) =>
              (where.userId === undefined || where.userId === row.userId) &&
              (where.conversationId === undefined || where.conversationId === row.conversationId) &&
              (where.isActive === undefined || where.isActive === row.isActive)
          ) ?? null
        );
      }),
    },
    friendRequest: { findFirst: jest.fn().mockResolvedValue(null) },
  };
}

async function buildApp(prisma: unknown): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  await app.register(signalProtocolRoutes);
  await app.ready();
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /signal/session/establish — appartenance active', () => {
  beforeEach(() => jest.clearAllMocks());

  it('refuse l\'appelant qui a quitté la conversation', async () => {
    const prisma = buildPrisma({ callerActive: false, recipientActive: true });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'POST', url: '/signal/session/establish', headers: AUTH, payload: BODY });

    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('ne consomme PAS la pré-clé du destinataire quand l\'appelant a quitté — sinon un ancien membre l\'épuise à volonté', async () => {
    const prisma = buildPrisma({ callerActive: false, recipientActive: true });
    const app = await buildApp(prisma);

    await app.inject({ method: 'POST', url: '/signal/session/establish', headers: AUTH, payload: BODY });

    expect(prisma.signalPreKeyBundle.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('ne lit même pas le trousseau du destinataire quand l\'appelant a quitté', async () => {
    const prisma = buildPrisma({ callerActive: false, recipientActive: true });
    const app = await buildApp(prisma);

    await app.inject({ method: 'POST', url: '/signal/session/establish', headers: AUTH, payload: BODY });

    expect(prisma.signalPreKeyBundle.findUnique).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse un destinataire qui a quitté la conversation', async () => {
    const prisma = buildPrisma({ callerActive: true, recipientActive: false });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'POST', url: '/signal/session/establish', headers: AUTH, payload: BODY });

    expect(res.statusCode).toBe(400);
    expect(prisma.signalPreKeyBundle.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('laisse passer deux membres actifs, sans consommer la pré-clé à usage unique', async () => {
    const prisma = buildPrisma({ callerActive: true, recipientActive: true });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'POST', url: '/signal/session/establish', headers: AUTH, payload: BODY });

    expect(res.statusCode).toBe(200);

    // La lecture du trousseau prouve que le handler est allé au bout des deux
    // gardes — c'est ce que ce test mesure.
    expect(prisma.signalPreKeyBundle.findUnique).toHaveBeenCalledWith({
      where: { userId: RECIPIENT_ID },
    });

    // Cette route ne rend AUCUN matériel de clé : elle ne peut donc pas
    // « consommer » la pré-clé à usage unique du destinataire, seulement la
    // détruire pour tout le monde. La consommation appartient à la route qui
    // distribue — `GET /signal/keys/:userId`. Voir
    // `signal-prekey-bundle-wire-format.test.ts`.
    expect(prisma.signalPreKeyBundle.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('interroge les deux appartenances avec `isActive: true` — la garde vit dans le `where`, pas dans une lecture ultérieure', async () => {
    const prisma = buildPrisma({ callerActive: true, recipientActive: true });
    const app = await buildApp(prisma);

    await app.inject({ method: 'POST', url: '/signal/session/establish', headers: AUTH, payload: BODY });

    const wheres = prisma.participant.findFirst.mock.calls.map((call: any) => call[0].where);
    expect(wheres).toEqual([
      { userId: CALLER_ID, conversationId: CONV_ID, isActive: true },
      { userId: RECIPIENT_ID, conversationId: CONV_ID, isActive: true },
    ]);
    await app.close();
  });
});
