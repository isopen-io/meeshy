/**
 * Pre-key bundle WIRE FORMAT — what a client actually receives.
 *
 * Why this file exists alongside `signal-protocol-routes.test.ts`.
 *
 * That file mocks `@meeshy/shared/types/api-schemas` and replaces
 * `getPreKeyBundleResponseSchema` with `{ type: 'object', additionalProperties: true }`.
 * Fastify serializes a 200 response THROUGH its declared response schema
 * (fast-json-stringify), so replacing the schema with an untyped one removes the
 * exact step under test here: a field declared `type: 'string'` coerces whatever
 * it receives with `String(value)`. The neighbouring file therefore cannot
 * observe the shape of the key material it fetches — it asserts `statusCode` and
 * `success`, and both stay green while the bytes on the wire are unusable.
 *
 * These tests deliberately DO NOT mock the schemas: the real
 * `signalPreKeyBundleSchema` drives the real serializer, and the assertions are
 * on the parsed body — what iOS `BackendPreKeyBundle` decodes and feeds to
 * `Data(base64Encoded:)`.
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

const mockGetSignalService = jest.fn<any>().mockReturnValue({ /* non-null */ });

jest.mock('../../../services/EncryptionService', () => ({
  getEncryptionService: jest.fn().mockResolvedValue({
    getOrCreateConversationKey: jest.fn().mockResolvedValue('key-id'),
    getSignalService: (...a: unknown[]) => mockGetSignalService(...a),
  }),
}));

jest.mock('@fastify/rate-limit', () => async function noOpRateLimit() {});

jest.mock('../../../middleware/rate-limiter', () => ({
  createSignalProtocolRateLimitConfig: jest.fn(() => ({})),
}));

const USER_ID = '507f1f77bcf86cd799439011';
const TARGET_ID = '507f1f77bcf86cd799439012';
const CONV_ID = '507f1f77bcf86cd799439013';
const AUTH = { authorization: 'Bearer valid-token' };

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

import signalProtocolRoutes from '../../../routes/signal-protocol';

/**
 * Distinct values per field: a single shared constant would let a route that
 * swaps two fields pass every assertion.
 */
const IDENTITY_KEY = Buffer.from('identity-key-32-bytes-of-payload').toString('base64');
const PRE_KEY_PUBLIC = Buffer.from('one-time-pre-key-public-payload!').toString('base64');
const SIGNED_PRE_KEY_PUBLIC = Buffer.from('signed-pre-key-public-payload!!!').toString('base64');
const SIGNED_PRE_KEY_SIGNATURE = Buffer.from('signed-pre-key-signature-payload').toString('base64');
const KYBER_PRE_KEY_PUBLIC = Buffer.from('kyber-pre-key-public-payload!!!!').toString('base64');
const KYBER_PRE_KEY_SIGNATURE = Buffer.from('kyber-pre-key-signature-payload!').toString('base64');

const BUNDLE_RECORD = {
  identityKey: IDENTITY_KEY,
  registrationId: 42,
  deviceId: 1,
  preKeyId: 7,
  preKeyPublic: PRE_KEY_PUBLIC,
  signedPreKeyId: 10,
  signedPreKeyPublic: SIGNED_PRE_KEY_PUBLIC,
  signedPreKeySignature: SIGNED_PRE_KEY_SIGNATURE,
  kyberPreKeyId: 20,
  kyberPreKeyPublic: KYBER_PRE_KEY_PUBLIC,
  kyberPreKeySignature: KYBER_PRE_KEY_SIGNATURE,
};

function makePrisma(bundle: Partial<typeof BUNDLE_RECORD> | null = BUNDLE_RECORD) {
  return {
    signalPreKeyBundle: {
      upsert: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(bundle),
      update: jest.fn().mockResolvedValue({}),
    },
    participant: {
      findMany: jest.fn().mockResolvedValue([{ conversationId: CONV_ID }]),
      findFirst: jest.fn().mockResolvedValue({ userId: TARGET_ID }),
    },
    friendRequest: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
}

async function buildApp(prisma: ReturnType<typeof makePrisma>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as unknown);
  await app.register(signalProtocolRoutes);
  await app.ready();
  return app;
}

/** What iOS does with every key field: `Data(base64Encoded:)`, strict alphabet. */
function isDecodableBase64(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  return Buffer.from(value, 'base64').toString('base64') === value;
}

describe('GET /signal/keys/:userId — key material on the wire', () => {
  it('returns every key field as the base64 string that was stored', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'GET',
      url: `/signal/keys/${TARGET_ID}`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    const { data } = JSON.parse(res.body);

    expect(data.identityKey).toBe(IDENTITY_KEY);
    expect(data.preKeyPublic).toBe(PRE_KEY_PUBLIC);
    expect(data.signedPreKeyPublic).toBe(SIGNED_PRE_KEY_PUBLIC);
    expect(data.signedPreKeySignature).toBe(SIGNED_PRE_KEY_SIGNATURE);
    expect(data.kyberPreKeyPublic).toBe(KYBER_PRE_KEY_PUBLIC);
    expect(data.kyberPreKeySignature).toBe(KYBER_PRE_KEY_SIGNATURE);

    await app.close();
  });

  it('returns key material that base64-decodes back to the original bytes', async () => {
    const app = await buildApp(makePrisma());

    const res = await app.inject({
      method: 'GET',
      url: `/signal/keys/${TARGET_ID}`,
      headers: AUTH,
    });

    const { data } = JSON.parse(res.body);

    // The property iOS depends on: `Data(base64Encoded:)` must not return nil.
    for (const field of [
      'identityKey',
      'preKeyPublic',
      'signedPreKeyPublic',
      'signedPreKeySignature',
      'kyberPreKeyPublic',
      'kyberPreKeySignature',
    ]) {
      expect({ field, decodable: isDecodableBase64(data[field]) })
        .toEqual({ field, decodable: true });
    }

    expect(Buffer.from(data.signedPreKeyPublic, 'base64').toString('utf8'))
      .toBe('signed-pre-key-public-payload!!!');

    await app.close();
  });

  it('preserves the numeric identifiers as numbers', async () => {
    const app = await buildApp(makePrisma());

    const res = await app.inject({
      method: 'GET',
      url: `/signal/keys/${TARGET_ID}`,
      headers: AUTH,
    });

    const { data } = JSON.parse(res.body);
    expect(data.registrationId).toBe(42);
    expect(data.deviceId).toBe(1);
    expect(data.preKeyId).toBe(7);
    expect(data.signedPreKeyId).toBe(10);
    expect(data.kyberPreKeyId).toBe(20);

    await app.close();
  });

  it('keeps absent optional key material null rather than inventing an empty string', async () => {
    const app = await buildApp(
      makePrisma({
        ...BUNDLE_RECORD,
        preKeyId: null,
        preKeyPublic: null,
        kyberPreKeyId: null,
        kyberPreKeyPublic: null,
        kyberPreKeySignature: null,
      })
    );

    const res = await app.inject({
      method: 'GET',
      url: `/signal/keys/${TARGET_ID}`,
      headers: AUTH,
    });

    const { data } = JSON.parse(res.body);
    expect(data.preKeyId).toBeNull();
    expect(data.preKeyPublic).toBeNull();
    expect(data.kyberPreKeyPublic).toBeNull();
    expect(data.kyberPreKeySignature).toBeNull();

    // The mandatory half is unaffected by the optional half being absent.
    expect(data.signedPreKeyPublic).toBe(SIGNED_PRE_KEY_PUBLIC);

    await app.close();
  });
});

describe('POST /signal/session/establish — the recipient’s one-time pre-key', () => {
  it('does not destroy a pre-key it hands to nobody', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/signal/session/establish',
      headers: AUTH,
      payload: { recipientUserId: TARGET_ID, conversationId: CONV_ID },
    });

    expect(res.statusCode).toBe(200);

    // The route returns no key material (its response carries a message only),
    // so nulling `preKeyId`/`preKeyPublic` here is destruction without
    // distribution: the caller never receives what is consumed, and the
    // recipient's bundle is degraded for every later peer. iOS uploads a bundle
    // only on the `isAuthenticated` false→true edge, so nothing replenishes it.
    expect(prisma.signalPreKeyBundle.update).not.toHaveBeenCalled();

    await app.close();
  });

  it('leaves the pre-key readable by a subsequent bundle fetch', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    await app.inject({
      method: 'POST',
      url: '/signal/session/establish',
      headers: AUTH,
      payload: { recipientUserId: TARGET_ID, conversationId: CONV_ID },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/signal/keys/${TARGET_ID}`,
      headers: AUTH,
    });

    const { data } = JSON.parse(res.body);
    expect(data.preKeyId).toBe(7);
    expect(data.preKeyPublic).toBe(PRE_KEY_PUBLIC);

    await app.close();
  });
});
