/**
 * GET /me/preferences/encryption — Signal key status ON THE WIRE.
 *
 * Why this file exists alongside `me-preferences.test.ts`.
 *
 * That file mocks `@meeshy/shared/types/api-schemas`, which is exactly the step
 * this route's contract lives in: Fastify serializes a 200 THROUGH its declared
 * response schema (fast-json-stringify), and a property the schema does not
 * declare is DROPPED from the body — silently, with no error anywhere. Cycle 41
 * found the same mechanism in its coercion direction (`String(Uint8Array)`);
 * this is its stripping direction, and it is precisely how
 * `apps/web/components/settings/encryption-settings.tsx` came to read
 * `user.signalRegistrationId` off `GET /auth/me` forever undefined: `userSchema`
 * never declared the field.
 *
 * So these tests deliberately DO NOT mock the schemas. The real serializer runs
 * and every assertion is on the parsed body — what the browser actually sees.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: { USER_PREFERENCES_UPDATED: 'user:preferences-updated' },
  ROOMS: { user: (id: string) => `user:${id}` },
}));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => async () => {},
}));

jest.mock('../../../utils/socket-broadcast', () => ({ broadcastToUser: jest.fn() }));

jest.mock('../../../services/ConsentValidationService', () => ({
  ConsentValidationService: jest.fn().mockImplementation(() => ({
    validatePreferences: jest.fn<() => Promise<never[]>>().mockResolvedValue([]),
  })),
}));

jest.mock('../../../utils/withMutationLog', () => ({
  // Le module réel est ÉTALÉ d'abord : `MutationResultGone` est une CLASSE
  // dont les routes font `instanceof`, et `withMutationOutcome` est le
  // chemin réel du repost. Une usine qui ne rendait que `withMutationLog`
  // les laissait à `undefined` — `instanceof undefined` lève un TypeError
  // qui se déguise en 500 sur des chemins d'erreur sans rapport.
  ...(jest.requireActual('../../../utils/withMutationLog') as object),
  withMutationLog: (args: { op: () => Promise<unknown> }) => args.op(),
}));

import { userPreferencesRoutes } from '../../../routes/me/preferences/index';

const USER_ID = '507f1f77bcf86cd799439011';
const AUTH = { authorization: 'Bearer token' };

/** The moment the client uploaded its bundle — distinct from any default. */
const ROTATED_AT = new Date('2026-03-04T05:06:07.000Z');

const ACTIVE_BUNDLE = {
  registrationId: 4242,
  deviceId: 1,
  isActive: true,
  lastRotatedAt: ROTATED_AT,
};

type PrismaOpts = {
  privacy?: Record<string, unknown> | null;
  bundle?: Record<string, unknown> | null;
  prefsError?: Error | null;
};

function makePrisma({ privacy = null, bundle = null, prefsError = null }: PrismaOpts = {}) {
  return {
    userPreferences: {
      findUnique: prefsError
        ? jest.fn<(...args: unknown[]) => Promise<unknown>>().mockRejectedValue(prefsError)
        : jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(privacy === null ? null : { privacy }),
      update: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({}),
      upsert: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({}),
    },
    signalPreKeyBundle: {
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(bundle),
    },
    userConversationCategory: {
      findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue([]),
      count: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(0),
      findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(null),
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({}),
      update: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({}),
      delete: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({}),
      updateMany: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({ count: 0 }),
    },
    conversationPreference: {
      updateMany: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue([]),
  };
}

async function buildApp(
  prismaOpts: PrismaOpts = {},
  authenticated = true,
): Promise<{ app: FastifyInstance; prisma: ReturnType<typeof makePrisma> }> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const prisma = makePrisma(prismaOpts);

  app.decorate('prisma', prisma as unknown);
  app.decorate('socketIOHandler', { getManager: () => ({ getIO: () => null }) } as unknown);
  app.decorate('mutationLogService', null as unknown);

  app.addHook('preHandler', async (req) => {
    if (authenticated) {
      (req as unknown as Record<string, unknown>).auth = {
        userId: USER_ID,
        isAuthenticated: true,
        isAnonymous: false,
      };
    }
  });

  await app.register(userPreferencesRoutes, { prefix: '/me/preferences' });
  await app.ready();
  return { app, prisma };
}

function get(app: FastifyInstance) {
  return app.inject({ method: 'GET', url: '/me/preferences/encryption', headers: AUTH });
}

describe('GET /me/preferences/encryption', () => {
  it('reports the key status of a user whose client uploaded a bundle', async () => {
    const { app } = await buildApp({ bundle: ACTIVE_BUNDLE });

    const res = await get(app);
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.hasSignalKeys).toBe(true);
    expect(body.data.signalRegistrationId).toBe(4242);
    expect(body.data.lastKeyRotation).toBe(ROTATED_AT.toISOString());

    await app.close();
  });

  it('sources key status from the pre-key bundle, not from the User mirror columns', async () => {
    // `User.signalIdentityKeyPublic` / `signalRegistrationId` / `lastKeyRotation`
    // exist in the Prisma schema and NO code path writes them — they are null for
    // every user. A handler reading them would report "no keys" for the very user
    // whose bundle sits one row away. This asserts the handler never asks.
    const { app, prisma } = await buildApp({ bundle: ACTIVE_BUNDLE });

    await get(app);

    expect(prisma.signalPreKeyBundle.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID } }),
    );
    expect((prisma as unknown as { user?: unknown }).user).toBeUndefined();

    await app.close();
  });

  it('reports no keys — with null identifiers — when no bundle was ever uploaded', async () => {
    const { app } = await buildApp({ bundle: null });

    const body = JSON.parse((await get(app)).body);

    expect(body.data.hasSignalKeys).toBe(false);
    expect(body.data.signalRegistrationId).toBeNull();
    expect(body.data.lastKeyRotation).toBeNull();

    await app.close();
  });

  it('treats a deactivated bundle as no keys', async () => {
    const { app } = await buildApp({ bundle: { ...ACTIVE_BUNDLE, isActive: false } });

    const body = JSON.parse((await get(app)).body);

    expect(body.data.hasSignalKeys).toBe(false);
    expect(body.data.signalRegistrationId).toBeNull();
    expect(body.data.lastKeyRotation).toBeNull();

    await app.close();
  });

  it('reads encryptionPreference from the privacy blob, where the update path writes it', async () => {
    // `PATCH /me/preferences/privacy` is the only writer of `encryptionPreference`
    // (PrivacyPreferenceSchema declares it). A reader looking in `application`
    // would report "optional" for a user who chose "always".
    const { app } = await buildApp({
      privacy: { encryptionPreference: 'always' },
      bundle: ACTIVE_BUNDLE,
    });

    const body = JSON.parse((await get(app)).body);

    expect(body.data.encryptionPreference).toBe('always');

    await app.close();
  });

  it('falls back to optional when the stored preference is absent or not a known value', async () => {
    const absent = await buildApp({ privacy: null });
    expect(JSON.parse((await get(absent.app)).body).data.encryptionPreference).toBe('optional');
    await absent.app.close();

    const garbage = await buildApp({ privacy: { encryptionPreference: 'sometimes' } });
    expect(JSON.parse((await get(garbage.app)).body).data.encryptionPreference).toBe('optional');
    await garbage.app.close();
  });

  it('never leaks key material — only the status of it', async () => {
    const { app } = await buildApp({ bundle: { ...ACTIVE_BUNDLE, identityKey: 'aWRlbnRpdHk=' } });

    const res = await get(app);

    expect(res.body).not.toContain('aWRlbnRpdHk=');
    expect(Object.keys(JSON.parse(res.body).data).sort()).toEqual([
      'encryptionPreference',
      'hasSignalKeys',
      'lastKeyRotation',
      'signalRegistrationId',
    ]);

    await app.close();
  });

  it('rejects an unauthenticated caller', async () => {
    const { app } = await buildApp({ bundle: ACTIVE_BUNDLE }, false);

    expect((await get(app)).statusCode).toBe(401);

    await app.close();
  });

  it('surfaces a database failure as a 500 rather than a false "no keys"', async () => {
    const { app } = await buildApp({ prefsError: new Error('mongo down') });

    const res = await get(app);

    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).success).toBe(false);

    await app.close();
  });
});
