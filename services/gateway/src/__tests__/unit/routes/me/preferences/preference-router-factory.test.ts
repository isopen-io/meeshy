/**
 * Unit tests for createPreferenceRouter factory
 *
 * Exercises all four routes (GET / PUT / PATCH / DELETE) including:
 *  - 401 when no userId on each verb
 *  - 403 on consent violations (PUT / PATCH)
 *  - 200 success paths with defaults, stored data, onDuplicate refetch
 *  - 400 on ZodError (PUT / PATCH)
 *  - 500 on non-Zod errors
 *  - Socket.IO emit when io is available
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// ─── Mocks (hoisted) ─────────────────────────────────────────────────────────

jest.mock('../../../../../services/ConsentValidationService', () => ({
  ConsentValidationService: jest.fn().mockImplementation(() => ({
    validatePreferences: jest.fn<any>().mockResolvedValue([]),
  })),
}));

jest.mock('../../../../../utils/withMutationLog', () => ({
  withMutationLog: jest.fn<any>(({ op }: { op: () => Promise<any> }) => op()),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      error: { type: 'string' },
      code: { type: 'string' },
    },
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { createPreferenceRouter } from '../../../../../routes/me/preferences/preference-router-factory';
import { ConsentValidationService } from '../../../../../services/ConsentValidationService';
import { withMutationLog } from '../../../../../utils/withMutationLog';

// ─── Test schema & defaults ───────────────────────────────────────────────────

const NotifSchema = z.object({
  pushEnabled: z.boolean(),
  soundEnabled: z.boolean(),
});

type NotifPrefs = z.infer<typeof NotifSchema>;

const DEFAULTS: NotifPrefs = { pushEnabled: true, soundEnabled: true };

const STORED_PREFS: NotifPrefs = { pushEnabled: false, soundEnabled: false };

const USER_ID = 'usr-00000000000001';

// ─── Prisma factory ───────────────────────────────────────────────────────────

function makePrisma(opts: {
  findUniqueResult?: Record<string, unknown> | null;
  upsertResult?: Record<string, unknown>;
  updateError?: Error | null;
  findUniqueError?: Error | null;
  upsertError?: Error | null;
} = {}) {
  const {
    findUniqueResult = { notification: STORED_PREFS, id: 'pref-1' },
    upsertResult = { notification: STORED_PREFS, id: 'pref-1' },
    updateError = null,
    findUniqueError = null,
    upsertError = null,
  } = opts;

  return {
    userPreferences: {
      findUnique: findUniqueError
        ? jest.fn<any>().mockRejectedValue(findUniqueError)
        : jest.fn<any>().mockResolvedValue(findUniqueResult),
      upsert: upsertError
        ? jest.fn<any>().mockRejectedValue(upsertError)
        : jest.fn<any>().mockResolvedValue(upsertResult),
      update: updateError
        ? jest.fn<any>().mockRejectedValue(updateError)
        : jest.fn<any>().mockResolvedValue(undefined),
    },
  };
}

// ─── App builder ──────────────────────────────────────────────────────────────

type AuthMode = 'authenticated' | 'no-user-id';

interface BuildOpts {
  prismaOpts?: Parameters<typeof makePrisma>[0];
  auth?: AuthMode;
  withSocketIO?: boolean;
}

async function buildApp({
  prismaOpts = {},
  auth = 'authenticated',
  withSocketIO = false,
}: BuildOpts = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('prisma', makePrisma(prismaOpts) as any);

  if (withSocketIO) {
    const mockIO = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };
    app.decorate('socketIOHandler', {
      getManager: () => ({ getIO: () => mockIO }),
    } as any);
  }

  // Inject request.auth via addHook
  app.addHook('preHandler', async (req: FastifyRequest) => {
    if (auth === 'authenticated') {
      (req as any).auth = { userId: USER_ID, isAuthenticated: true, isAnonymous: false };
    } else {
      (req as any).auth = { isAuthenticated: false, isAnonymous: false };
    }
  });

  await app.register(createPreferenceRouter('notification', NotifSchema, DEFAULTS));
  await app.ready();
  return app;
}

// ─── GET / ────────────────────────────────────────────────────────────────────

describe('GET / — preference-router-factory', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns stored preferences when a row exists', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.pushEnabled).toBe(false);
  });

  it('returns defaults when no preferences are stored (empty object)', async () => {
    const emptyApp = await buildApp({
      prismaOpts: { findUniqueResult: { notification: {}, id: 'pref-1' } },
    });
    const res = await emptyApp.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.pushEnabled).toBe(true);
    await emptyApp.close();
  });

  it('returns defaults when no row exists in DB (null result)', async () => {
    const nullApp = await buildApp({ prismaOpts: { findUniqueResult: null } });
    const res = await nullApp.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.pushEnabled).toBe(true);
    await nullApp.close();
  });

  it('returns 401 when no userId on request (line 84)', async () => {
    const anonApp = await buildApp({ auth: 'no-user-id' });
    const res = await anonApp.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(401);
    await anonApp.close();
  });

  it('returns 500 on DB error', async () => {
    const errApp = await buildApp({
      prismaOpts: { findUniqueError: new Error('db crash') },
    });
    const res = await errApp.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(500);
    await errApp.close();
  });
});

// ─── PUT / ────────────────────────────────────────────────────────────────────

describe('PUT / — preference-router-factory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (withMutationLog as jest.Mock<any>).mockImplementation(({ op }: { op: () => Promise<any> }) => op());
    (ConsentValidationService as jest.MockedClass<any>).mockImplementation(() => ({
      validatePreferences: jest.fn<any>().mockResolvedValue([]),
    }));
  });

  it('returns 401 when no userId (line 142)', async () => {
    const app = await buildApp({ auth: 'no-user-id' });
    const res = await app.inject({
      method: 'PUT', url: '/',
      headers: { 'content-type': 'application/json' },
      payload: { pushEnabled: false, soundEnabled: false },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns 200 and persists the valid payload', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT', url: '/',
      headers: { 'content-type': 'application/json' },
      payload: { pushEnabled: false, soundEnabled: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });

  it('returns 403 when consent violations are present (line 157)', async () => {
    (ConsentValidationService as jest.MockedClass<any>).mockImplementation(() => ({
      validatePreferences: jest.fn<any>().mockResolvedValue([
        { field: 'pushEnabled', message: 'Consent required', requiredConsents: ['dataProcessingConsentAt'] },
      ]),
    }));
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT', url: '/',
      headers: { 'content-type': 'application/json' },
      payload: { pushEnabled: false, soundEnabled: false },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 400 on ZodError (invalid body)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT', url: '/',
      headers: { 'content-type': 'application/json' },
      payload: { pushEnabled: 'not-a-boolean', soundEnabled: false },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 500 on non-Zod DB error (lines 200-201)', async () => {
    (withMutationLog as jest.Mock<any>).mockImplementation(() => {
      throw new Error('DB timeout');
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT', url: '/',
      headers: { 'content-type': 'application/json' },
      payload: { pushEnabled: false, soundEnabled: false },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });

  it('invokes onDuplicate callback and returns its result (lines 184-188)', async () => {
    (withMutationLog as jest.Mock<any>).mockImplementation(
      ({ onDuplicate }: { onDuplicate: (id: string) => Promise<any> }) => onDuplicate('pref-1')
    );
    const app = await buildApp({
      prismaOpts: { findUniqueResult: { notification: { pushEnabled: true, soundEnabled: true }, id: 'pref-1' } },
    });
    const res = await app.inject({
      method: 'PUT', url: '/',
      headers: { 'content-type': 'application/json' },
      payload: { pushEnabled: false, soundEnabled: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.pushEnabled).toBe(true);
    await app.close();
  });

  it('emits preferences:updated event when Socket.IO is available (line 49)', async () => {
    const app = await buildApp({ withSocketIO: true });
    await app.inject({
      method: 'PUT', url: '/',
      headers: { 'content-type': 'application/json' },
      payload: { pushEnabled: false, soundEnabled: false },
    });
    const manager = (app as any).socketIOHandler.getManager();
    const io = manager.getIO();
    expect(io.to).toHaveBeenCalled();
    expect(io.emit).toHaveBeenCalled();
    await app.close();
  });
});

// ─── PATCH / ─────────────────────────────────────────────────────────────────

describe('PATCH / — preference-router-factory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (withMutationLog as jest.Mock<any>).mockImplementation(({ op }: { op: () => Promise<any> }) => op());
    (ConsentValidationService as jest.MockedClass<any>).mockImplementation(() => ({
      validatePreferences: jest.fn<any>().mockResolvedValue([]),
    }));
  });

  it('returns 401 when no userId (line 244)', async () => {
    const app = await buildApp({ auth: 'no-user-id' });
    const res = await app.inject({
      method: 'PATCH', url: '/',
      headers: { 'content-type': 'application/json' },
      payload: { pushEnabled: false },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns 200 with merged partial update', async () => {
    const app = await buildApp({
      prismaOpts: {
        findUniqueResult: { notification: STORED_PREFS, id: 'pref-1' },
        upsertResult: { notification: { pushEnabled: false, soundEnabled: true }, id: 'pref-1' },
      },
    });
    const res = await app.inject({
      method: 'PATCH', url: '/',
      headers: { 'content-type': 'application/json' },
      payload: { soundEnabled: true },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('merges with defaults when no existing preferences', async () => {
    const app = await buildApp({
      prismaOpts: {
        findUniqueResult: null,
        upsertResult: { notification: { pushEnabled: false, soundEnabled: true }, id: 'pref-1' },
      },
    });
    const res = await app.inject({
      method: 'PATCH', url: '/',
      headers: { 'content-type': 'application/json' },
      payload: { pushEnabled: false },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 403 when consent violations are present (line 269)', async () => {
    (ConsentValidationService as jest.MockedClass<any>).mockImplementation(() => ({
      validatePreferences: jest.fn<any>().mockResolvedValue([
        { field: 'pushEnabled', message: 'Consent required', requiredConsents: [] },
      ]),
    }));
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH', url: '/',
      headers: { 'content-type': 'application/json' },
      payload: { pushEnabled: false },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 400 on ZodError (invalid field type)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH', url: '/',
      headers: { 'content-type': 'application/json' },
      payload: { pushEnabled: 'yes' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 500 on non-Zod DB error (lines 305-310)', async () => {
    (withMutationLog as jest.Mock<any>).mockImplementation(() => {
      throw new Error('unexpected DB error');
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH', url: '/',
      headers: { 'content-type': 'application/json' },
      payload: { pushEnabled: false },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });

  it('invokes onDuplicate callback and returns its result (lines 293-297)', async () => {
    (withMutationLog as jest.Mock<any>).mockImplementation(
      ({ onDuplicate }: { onDuplicate: (id: string) => Promise<any> }) => onDuplicate('pref-1')
    );
    const app = await buildApp({
      prismaOpts: {
        findUniqueResult: { notification: { pushEnabled: true, soundEnabled: false }, id: 'pref-1' },
      },
    });
    const res = await app.inject({
      method: 'PATCH', url: '/',
      headers: { 'content-type': 'application/json' },
      payload: { pushEnabled: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.pushEnabled).toBe(true);
    await app.close();
  });
});

// ─── DELETE / ────────────────────────────────────────────────────────────────

describe('DELETE / — preference-router-factory', () => {
  it('returns 401 when no userId (line 341)', async () => {
    const app = await buildApp({ auth: 'no-user-id' });
    const res = await app.inject({ method: 'DELETE', url: '/' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns 200 and resets preferences to defaults', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });

  it('returns 500 on DB error (lines 353-354)', async () => {
    const app = await buildApp({ prismaOpts: { updateError: new Error('update failed') } });
    const res = await app.inject({ method: 'DELETE', url: '/' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});
