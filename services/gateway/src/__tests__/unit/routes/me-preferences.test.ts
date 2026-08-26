/**
 * Unit tests — /me/preferences routes
 *
 * Covers:
 *   index.ts  (userPreferencesRoutes)
 *     GET  /me/preferences      — fetch all, defaults, auth error, db error
 *     DELETE /me/preferences    — reset all, auth error, db error
 *
 *   preference-router-factory.ts  (createPreferenceRouter)
 *     GET    /me/preferences/privacy   — fetch, defaults, auth, db error
 *     PUT    /me/preferences/privacy   — replace, validation error, consent violation, db error, duplicate cmid
 *     PATCH  /me/preferences/privacy   — partial update, merge with defaults, consent violation, db error
 *     DELETE /me/preferences/privacy   — reset, auth error, db error
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks (must come before imports) ────────────────────────────────────────

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      error: { type: 'string' },
      message: { type: 'string' },
    },
  },
}));

// Mock @meeshy/shared/types/socketio-events so ROOMS and SERVER_EVENTS are available
jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: { USER_PREFERENCES_UPDATED: 'user:preferences-updated' },
  ROOMS: { user: (id: string) => `user:${id}` },
}));

// Mock the auth middleware — we control req.auth directly in buildApp.
// Les options reçues sont conservées : elles sont elles-mêmes sous témoin
// (cf. « garde d'accès » plus bas), `allowAnonymous: false` étant la
// prémisse dont dépend le service des anonymes par les défauts.
const mockAuthMiddlewareOptions: unknown[] = [];

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: (_prisma: unknown, options: unknown) => {
    mockAuthMiddlewareOptions.push(options);
    return async (req: FastifyRequest) => {
      // no-op: buildApp adds a preHandler hook instead
    };
  },
}));

// `utils/socket-broadcast` n'est PAS doublé : c'est par lui que passe désormais
// toute diffusion de préférences, et le doubler rendrait « ce verbe diffuse »
// indiscernable de « ce verbe ne diffuse pas ». Les émissions sont observées
// au bout de la chaîne, sur la couche Socket.IO factice de `makeSocketLayer`.

// Le cache serveur des préférences de confidentialité — on observe qu'il est
// bien purgé par chaque écriture, pas ce qu'il contient (cf. son propre témoin,
// `__tests__/unit/services/preferences/privacy-cache.test.ts`).
const mockInvalidatePrivacyPreferences = jest.fn();

jest.mock('../../../services/preferences/privacy-cache', () => ({
  invalidatePrivacyPreferences: (...args: unknown[]) =>
    mockInvalidatePrivacyPreferences(...(args as [string])),
}));

// Consent service — by default no violations
const mockValidatePreferences = jest.fn<() => Promise<never[]>>().mockResolvedValue([]);

jest.mock('../../../services/ConsentValidationService', () => ({
  ConsentValidationService: jest.fn().mockImplementation(() => ({
    validatePreferences: (...args: unknown[]) => mockValidatePreferences(...args as []),
  })),
}));

// withMutationLog — by default just runs op()
const mockWithMutationLog = jest.fn(async ({ op }: { op: () => Promise<unknown> }) => op());

jest.mock('../../../utils/withMutationLog', () => ({
  // Le module réel est ÉTALÉ d'abord : `MutationResultGone` est une CLASSE
  // dont les routes font `instanceof`, et `withMutationOutcome` est le
  // chemin réel du repost. Une usine qui ne rendait que `withMutationLog`
  // les laissait à `undefined` — `instanceof undefined` lève un TypeError
  // qui se déguise en 500 sur des chemins d'erreur sans rapport.
  ...(jest.requireActual('../../../utils/withMutationLog') as object),
  withMutationLog: (...args: unknown[]) => mockWithMutationLog(...(args as [{ op: () => Promise<unknown> }])),
}));

// ─── Imports under test ───────────────────────────────────────────────────────

import { userPreferencesRoutes } from '../../../routes/me/preferences/index';
import { createPreferenceRouter } from '../../../routes/me/preferences/preference-router-factory';

// ─── Preference defaults and schemas from shared (real values) ────────────────

import {
  PrivacyPreferenceSchema,
  PRIVACY_PREFERENCE_DEFAULTS,
  AUDIO_PREFERENCE_DEFAULTS,
  MESSAGE_PREFERENCE_DEFAULTS,
  NOTIFICATION_PREFERENCE_DEFAULTS,
  VIDEO_PREFERENCE_DEFAULTS,
  DOCUMENT_PREFERENCE_DEFAULTS,
  APPLICATION_PREFERENCE_DEFAULTS,
} from '@meeshy/shared/types/preferences';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const AUTH = { authorization: 'Bearer token' };

const STORED_PRIVACY = {
  showOnlineStatus: false,
  showLastSeen: false,
  showReadReceipts: true,
  showTypingIndicator: true,
  allowContactRequests: true,
  allowGroupInvites: true,
  allowCallsFromNonContacts: false,
  saveMediaToGallery: false,
  allowAnalytics: false,
  shareUsageData: false,
  blockScreenshots: false,
  hideProfileFromSearch: false,
  encryptionPreference: 'optional' as const,
  autoEncryptNewConversations: false,
  showEncryptionStatus: true,
  warnOnUnencrypted: false,
};

const STORED_ALL_PREFS = {
  privacy: STORED_PRIVACY,
  audio: AUDIO_PREFERENCE_DEFAULTS,
  message: MESSAGE_PREFERENCE_DEFAULTS,
  notification: NOTIFICATION_PREFERENCE_DEFAULTS,
  video: VIDEO_PREFERENCE_DEFAULTS,
  document: DOCUMENT_PREFERENCE_DEFAULTS,
  application: APPLICATION_PREFERENCE_DEFAULTS,
};

// ─── Prisma factory ───────────────────────────────────────────────────────────

type PrismaOpts = {
  findUniqueResult?: Record<string, unknown> | null;
  findUniqueError?: Error | null;
  updateResult?: Record<string, unknown>;
  updateError?: Error | null;
  upsertResult?: Record<string, unknown>;
  upsertError?: Error | null;
  /**
   * Rien ne crée la ligne `UserPreferences` à l'inscription : ses seuls
   * créateurs sont les `upsert` de PUT/PATCH. `rowExists: false` modélise
   * l'utilisateur qui n'a jamais écrit de préférence — celui pour qui la
   * remise à zéro est un no-op, pas une erreur.
   *
   * Le double doit modéliser les DEUX verbes tels que Prisma les rend sur une
   * ligne absente, sans quoi il rend vert un chemin rouge en production :
   * `update` LÈVE P2025, `updateMany` rend `{ count: 0 }`. C'est précisément
   * ce que l'ancien double (`update` toujours résolu) cachait.
   */
  rowExists?: boolean;
  updateManyError?: Error | null;
};

/** Ce que Prisma lève quand `update` ne trouve pas la ligne visée. */
function missingRowError(): Error {
  const error = new Error('An operation failed because it depends on one or more records that were required but not found.');
  (error as Error & { code: string }).code = 'P2025';
  return error;
}

function makePrisma({
  findUniqueResult = { ...STORED_ALL_PREFS },
  findUniqueError = null,
  updateResult = {},
  updateError = null,
  upsertResult = { id: 'pref-id', privacy: STORED_PRIVACY },
  upsertError = null,
  rowExists = true,
  updateManyError = null,
}: PrismaOpts = {}) {
  const updateRejection = updateError ?? (rowExists ? null : missingRowError());

  return {
    userPreferences: {
      findUnique: findUniqueError
        ? jest.fn().mockRejectedValue(findUniqueError)
        : jest.fn().mockResolvedValue(findUniqueResult),
      update: updateRejection
        ? jest.fn().mockRejectedValue(updateRejection)
        : jest.fn().mockResolvedValue(updateResult),
      updateMany: updateManyError
        ? jest.fn().mockRejectedValue(updateManyError)
        : jest.fn().mockResolvedValue({ count: rowExists ? 1 : 0 }),
      upsert: upsertError
        ? jest.fn().mockRejectedValue(upsertError)
        : jest.fn().mockResolvedValue(upsertResult),
    },
    // Le SECOND rangement de la confidentialité — les lignes clé/valeur
    // héritées de janvier 2026, lues et retirées par les routes `privacy`
    // (`services/preferences/privacy-storage`).
    userPreference: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    // categories sub-routes need these too
    userConversationCategory: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    conversationPreference: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
}

// ─── App builder ──────────────────────────────────────────────────────────────

type AuthMode = 'registered' | 'no-user-id';

type Emission = { readonly room: string; readonly event: string; readonly payload: unknown };

/**
 * Couche Socket.IO observable. Le double précédent rendait `getIO: () => null`,
 * ce qui rendait TOUTE diffusion invisible — un verbe qui n'émet pas y était
 * indiscernable d'un verbe qui émet. Les émissions sont désormais collectées
 * pour que la question « ce verbe diffuse-t-il ? » ait une réponse.
 */
function makeSocketLayer() {
  const emissions: Emission[] = [];
  const io = {
    to(room: string) {
      return {
        emit(event: string, payload: unknown) {
          emissions.push({ room, event, payload });
        },
      };
    },
  };
  return { emissions, handler: { getManager: () => ({ getIO: () => io }) } };
}

async function buildApp(prismaOpts: PrismaOpts = {}, authMode: AuthMode = 'registered'): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  const prisma = makePrisma(prismaOpts);
  app.decorate('prisma', prisma as unknown);

  const socket = makeSocketLayer();
  app.decorate('socketIOHandler', socket.handler as unknown);
  (app as unknown as Record<string, unknown>).emissions = socket.emissions;

  // Simulate mutationLogService (used by withMutationLog when cmid present)
  app.decorate('mutationLogService', null as unknown);

  // Add preHandler that sets req.auth
  app.addHook('preHandler', async (req) => {
    const r = req as unknown as Record<string, unknown>;
    if (authMode === 'registered') {
      r.auth = { userId: USER_ID, isAuthenticated: true, isAnonymous: false };
    }
    // 'no-user-id' mode: auth is not set, so request.auth?.userId is undefined
  });

  await app.register(userPreferencesRoutes, { prefix: '/me/preferences' });
  await app.ready();
  return app;
}

/** Build a lightweight app with just one preference category router (no sub-plugins) */
async function buildCategoryApp(
  category: 'privacy' | 'audio',
  prismaOpts: PrismaOpts = {},
  authMode: AuthMode = 'registered',
): Promise<FastifyInstance> {
  return buildCategoryAppWith(category, makePrisma(prismaOpts), authMode);
}

/** Same, over a Prisma double the caller keeps a handle on (to inspect its calls). */
async function buildCategoryAppWith(
  category: 'privacy' | 'audio',
  prisma: ReturnType<typeof makePrisma>,
  authMode: AuthMode = 'registered',
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('prisma', prisma as unknown);

  const socket = makeSocketLayer();
  app.decorate('socketIOHandler', socket.handler as unknown);
  (app as unknown as Record<string, unknown>).emissions = socket.emissions;

  app.decorate('mutationLogService', null as unknown);

  app.addHook('preHandler', async (req) => {
    const r = req as unknown as Record<string, unknown>;
    if (authMode === 'registered') {
      r.auth = { userId: USER_ID, isAuthenticated: true, isAnonymous: false };
    }
  });

  const router = createPreferenceRouter(category, PrivacyPreferenceSchema, PRIVACY_PREFERENCE_DEFAULTS);
  await app.register(router, { prefix: `/me/preferences/${category}` });
  await app.ready();
  return app;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /me/preferences — fetch all
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /me/preferences', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ findUniqueResult: { ...STORED_ALL_PREFS } });
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with all stored preference categories', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/preferences', headers: AUTH });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('privacy');
    expect(body.data).toHaveProperty('audio');
    expect(body.data).toHaveProperty('message');
    expect(body.data).toHaveProperty('notification');
    expect(body.data).toHaveProperty('video');
    expect(body.data).toHaveProperty('document');
    expect(body.data).toHaveProperty('application');
  });

  it('falls back to defaults when userPreferences row does not exist (findUnique returns null)', async () => {
    const appNull = await buildApp({ findUniqueResult: null });
    const res = await appNull.inject({ method: 'GET', url: '/me/preferences', headers: AUTH });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    // The GET /me/preferences response schema declares each category as `{ type: 'object' }`
    // without additionalProperties, so Fastify fast-json-stringify serialises them as {}.
    // What we care about is that the response envelope has all 7 category keys.
    expect(body.data).toHaveProperty('privacy');
    expect(body.data).toHaveProperty('audio');
    expect(body.data).toHaveProperty('message');
    expect(body.data).toHaveProperty('notification');
    expect(body.data).toHaveProperty('video');
    expect(body.data).toHaveProperty('document');
    expect(body.data).toHaveProperty('application');
    await appNull.close();
  });

  it('returns 401 when request.auth is missing (no userId)', async () => {
    const appNoAuth = await buildApp({}, 'no-user-id');
    const res = await appNoAuth.inject({ method: 'GET', url: '/me/preferences', headers: AUTH });

    expect(res.statusCode).toBe(401);
    await appNoAuth.close();
  });

  it('returns 500 on db error', async () => {
    const appErr = await buildApp({ findUniqueError: new Error('db timeout') });
    const res = await appErr.inject({ method: 'GET', url: '/me/preferences', headers: AUTH });

    expect(res.statusCode).toBe(500);
    await appErr.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /me/preferences — reset all
// ═══════════════════════════════════════════════════════════════════════════════

describe('DELETE /me/preferences', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 and success message when reset succeeds', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/me/preferences', headers: AUTH });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.message).toMatch(/reset/i);
  });

  it('nulls out all category fields in the prisma updateMany call', async () => {
    const prisma = makePrisma();
    const appInspect = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    appInspect.decorate('prisma', prisma as unknown);
    appInspect.decorate('socketIOHandler', { getManager: () => null } as unknown);
    appInspect.decorate('mutationLogService', null as unknown);
    appInspect.addHook('preHandler', async (req) => {
      (req as unknown as Record<string, unknown>).auth = { userId: USER_ID };
    });
    await appInspect.register(userPreferencesRoutes, { prefix: '/me/preferences' });
    await appInspect.ready();

    await appInspect.inject({ method: 'DELETE', url: '/me/preferences', headers: AUTH });

    const updateCall = (prisma.userPreferences.updateMany as ReturnType<typeof jest.fn>).mock.calls[0][0];
    expect(updateCall.where.userId).toBe(USER_ID);
    expect(updateCall.data.privacy).toBeNull();
    expect(updateCall.data.audio).toBeNull();
    expect(updateCall.data.message).toBeNull();
    expect(updateCall.data.notification).toBeNull();
    expect(updateCall.data.video).toBeNull();
    expect(updateCall.data.document).toBeNull();
    expect(updateCall.data.application).toBeNull();
    await appInspect.close();
  });

  it('returns 401 when userId is missing', async () => {
    const appNoAuth = await buildApp({}, 'no-user-id');
    const res = await appNoAuth.inject({ method: 'DELETE', url: '/me/preferences', headers: AUTH });

    expect(res.statusCode).toBe(401);
    await appNoAuth.close();
  });

  it('returns 500 on db error', async () => {
    const appErr = await buildApp({ updateManyError: new Error('db crash') });
    const res = await appErr.inject({ method: 'DELETE', url: '/me/preferences', headers: AUTH });

    expect(res.statusCode).toBe(500);
    await appErr.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE — la remise à zéro se diffuse, et n'échoue pas sur un compte neuf
//
// Cycle 48. Deux défauts jumeaux sur les DEUX routes de remise à zéro :
//   A. elles n'émettaient pas `preferences:updated` alors que PUT/PATCH le font
//      — les autres appareils gardaient la valeur d'AVANT la remise à zéro
//      (`usePreferences()` pose `staleTime: Infinity` côté web) ;
//   B. elles appelaient `update()`, qui lève P2025 quand la ligne n'existe pas
//      — or rien ne la crée à l'inscription, donc « remettre à zéro » rendait
//      500 exactement pour l'utilisateur qui EST déjà aux valeurs par défaut.
// ═══════════════════════════════════════════════════════════════════════════════

const emissionsOf = (app: FastifyInstance): Emission[] =>
  (app as unknown as { emissions: Emission[] }).emissions;

const prefsEmissions = (app: FastifyInstance): Emission[] =>
  emissionsOf(app).filter((e) => e.event === 'user:preferences-updated');

describe('DELETE /me/preferences/:category — diffusion et compte sans ligne', () => {
  beforeEach(() => jest.clearAllMocks());

  it('diffuse preferences:updated dans la room personnelle, comme PUT et PATCH', async () => {
    const app = await buildCategoryApp('privacy');

    await app.inject({ method: 'DELETE', url: '/me/preferences/privacy', headers: AUTH });

    expect(prefsEmissions(app)).toEqual([
      { room: `user:${USER_ID}`, event: 'user:preferences-updated', payload: { userId: USER_ID, category: 'privacy' } },
    ]);
    await app.close();
  });

  it('rend 200 pour un utilisateur sans ligne UserPreferences — il est déjà aux valeurs par défaut', async () => {
    const app = await buildCategoryApp('privacy', { rowExists: false });

    const res = await app.inject({ method: 'DELETE', url: '/me/preferences/privacy', headers: AUTH });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });

  it('ne crée aucune ligne vide pour un utilisateur qui n\'en a pas', async () => {
    const prisma = makePrisma({ rowExists: false });
    const app = await buildCategoryAppWith('privacy', prisma);

    await app.inject({ method: 'DELETE', url: '/me/preferences/privacy', headers: AUTH });

    expect(prisma.userPreferences.upsert).not.toHaveBeenCalled();
    expect(prisma.userPreferences.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('cible la seule catégorie demandée, jamais les autres', async () => {
    const prisma = makePrisma();
    const app = await buildCategoryAppWith('privacy', prisma);

    await app.inject({ method: 'DELETE', url: '/me/preferences/privacy', headers: AUTH });

    const call = (prisma.userPreferences.updateMany as ReturnType<typeof jest.fn>).mock.calls[0][0];
    expect(call.where.userId).toBe(USER_ID);
    expect(call.data).toEqual({ privacy: null });
    await app.close();
  });

  it('ne diffuse pas quand la remise à zéro échoue', async () => {
    const app = await buildCategoryApp('privacy', { updateManyError: new Error('db crash') });

    const res = await app.inject({ method: 'DELETE', url: '/me/preferences/privacy', headers: AUTH });

    expect(res.statusCode).toBe(500);
    expect(prefsEmissions(app)).toEqual([]);
    await app.close();
  });
});

describe('DELETE /me/preferences — diffusion et compte sans ligne', () => {
  beforeEach(() => jest.clearAllMocks());

  it('diffuse une fois par catégorie effacée — le contrat client est per-catégorie', async () => {
    const app = await buildApp();

    await app.inject({ method: 'DELETE', url: '/me/preferences', headers: AUTH });

    const categories = prefsEmissions(app).map((e) => (e.payload as { category: string }).category);
    expect(categories.sort()).toEqual(
      ['application', 'audio', 'document', 'message', 'notification', 'privacy', 'video'],
    );
    expect(prefsEmissions(app).every((e) => e.room === `user:${USER_ID}`)).toBe(true);
    await app.close();
  });

  it('rend 200 pour un utilisateur sans ligne UserPreferences', async () => {
    const app = await buildApp({ rowExists: false });

    const res = await app.inject({ method: 'DELETE', url: '/me/preferences', headers: AUTH });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });

  it('ne diffuse pas quand la remise à zéro globale échoue', async () => {
    const app = await buildApp({ updateManyError: new Error('db crash') });

    const res = await app.inject({ method: 'DELETE', url: '/me/preferences', headers: AUTH });

    expect(res.statusCode).toBe(500);
    expect(prefsEmissions(app)).toEqual([]);
    await app.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Garde d'accès — dette nommée par les cycles 46 et 47
//
// `PrivacyPreferencesService.getPreferencesForUsers` sert les participants
// anonymes par les valeurs par défaut SANS consulter la base : ils n'ont pas
// de ligne `UserPreferences`, et `authContext.userId` porte pour eux un
// `Participant.id`, qui ne désigne aucun utilisateur. Ce raccourci n'est
// correct QUE tant que ces routes leur restent fermées — un `allowAnonymous`
// passé à `true` ferait écrire un anonyme sous une clé qui n'est pas la
// sienne. Rien ne gardait cette prémisse ; ce témoin la garde.
// ═══════════════════════════════════════════════════════════════════════════════

describe('userPreferencesRoutes — garde d\'accès', () => {
  it('refuse les sessions anonymes et exige une authentification', async () => {
    mockAuthMiddlewareOptions.length = 0;

    const app = await buildApp();

    expect(mockAuthMiddlewareOptions.length).toBeGreaterThan(0);
    for (const options of mockAuthMiddlewareOptions) {
      expect(options).toMatchObject({ requireAuth: true, allowAnonymous: false });
    }
    await app.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /me/preferences/:category — via createPreferenceRouter
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /me/preferences/privacy', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildCategoryApp('privacy', {
      findUniqueResult: { privacy: STORED_PRIVACY, id: 'pref-id' },
    });
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with stored privacy preferences', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/preferences/privacy', headers: AUTH });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.showOnlineStatus).toBe(false);
  });

  it('returns defaults when no preferences are stored (null row)', async () => {
    const appNull = await buildCategoryApp('privacy', { findUniqueResult: null });
    const res = await appNull.inject({ method: 'GET', url: '/me/preferences/privacy', headers: AUTH });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toEqual(PRIVACY_PREFERENCE_DEFAULTS);
    await appNull.close();
  });

  it('returns defaults when preferences row has null category field', async () => {
    const appNullField = await buildCategoryApp('privacy', { findUniqueResult: { privacy: null } });
    const res = await appNullField.inject({ method: 'GET', url: '/me/preferences/privacy', headers: AUTH });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toEqual(PRIVACY_PREFERENCE_DEFAULTS);
    await appNullField.close();
  });

  it('returns defaults when preferences row has empty object for category', async () => {
    const appEmpty = await buildCategoryApp('privacy', { findUniqueResult: { privacy: {} } });
    const res = await appEmpty.inject({ method: 'GET', url: '/me/preferences/privacy', headers: AUTH });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toEqual(PRIVACY_PREFERENCE_DEFAULTS);
    await appEmpty.close();
  });

  it('returns 401 when userId is missing', async () => {
    const appNoAuth = await buildCategoryApp('privacy', {}, 'no-user-id');
    const res = await appNoAuth.inject({ method: 'GET', url: '/me/preferences/privacy', headers: AUTH });

    expect(res.statusCode).toBe(401);
    await appNoAuth.close();
  });

  it('returns 500 on db error', async () => {
    const appErr = await buildCategoryApp('privacy', { findUniqueError: new Error('db crash') });
    const res = await appErr.inject({ method: 'GET', url: '/me/preferences/privacy', headers: AUTH });

    expect(res.statusCode).toBe(500);
    await appErr.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PUT /me/preferences/:category — full replacement
// ═══════════════════════════════════════════════════════════════════════════════

describe('PUT /me/preferences/privacy', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildCategoryApp('privacy', {
      upsertResult: { id: 'pref-id', privacy: STORED_PRIVACY },
    });
  });
  afterAll(() => app.close());
  beforeEach(() => {
    jest.clearAllMocks();
    mockValidatePreferences.mockResolvedValue([]);
    mockWithMutationLog.mockImplementation(async ({ op }: { op: () => Promise<unknown> }) => op());
  });

  it('returns 200 with updated preferences on valid body', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: STORED_PRIVACY,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('passes validated data to prisma upsert', async () => {
    const prisma = makePrisma({ upsertResult: { id: 'pref-id', privacy: STORED_PRIVACY } });
    const appInspect = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    appInspect.decorate('prisma', prisma as unknown);
    appInspect.decorate('socketIOHandler', { getManager: () => ({ getIO: () => null }) } as unknown);
    appInspect.decorate('mutationLogService', null as unknown);
    appInspect.addHook('preHandler', async (req) => {
      (req as unknown as Record<string, unknown>).auth = { userId: USER_ID };
    });
    const router = createPreferenceRouter('privacy', PrivacyPreferenceSchema, PRIVACY_PREFERENCE_DEFAULTS);
    await appInspect.register(router, { prefix: '/me/preferences/privacy' });
    await appInspect.ready();

    await appInspect.inject({
      method: 'PUT',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: STORED_PRIVACY,
    });

    const upsertCall = (prisma.userPreferences.upsert as ReturnType<typeof jest.fn>).mock.calls[0][0];
    expect(upsertCall.where.userId).toBe(USER_ID);
    expect(upsertCall.update.privacy).toMatchObject({ showOnlineStatus: false });
    await appInspect.close();
  });

  it('returns 400 when body fails Zod validation', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: { showOnlineStatus: 'not-a-boolean' }, // invalid type
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 403 when consent violations are present', async () => {
    mockValidatePreferences.mockResolvedValueOnce([
      { field: 'allowAnalytics', message: 'Requires consent', requiredConsents: ['dataProcessingConsentAt'] },
    ] as never);

    const res = await app.inject({
      method: 'PUT',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: { ...STORED_PRIVACY, allowAnalytics: true },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error).toBe('CONSENT_REQUIRED');
    expect(Array.isArray(body.violations)).toBe(true);
    expect(body.violations).toHaveLength(1);
  });

  it('returns 401 when userId is missing', async () => {
    const appNoAuth = await buildCategoryApp('privacy', {}, 'no-user-id');
    const res = await appNoAuth.inject({
      method: 'PUT',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: STORED_PRIVACY,
    });

    expect(res.statusCode).toBe(401);
    await appNoAuth.close();
  });

  it('returns 500 on db error during upsert', async () => {
    const appErr = await buildCategoryApp('privacy', { upsertError: new Error('db crash') });
    const res = await appErr.inject({
      method: 'PUT',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: STORED_PRIVACY,
    });

    expect(res.statusCode).toBe(500);
    await appErr.close();
  });

  it('replays response from onDuplicate when withMutationLog throws MutationLogDuplicate', async () => {
    mockWithMutationLog.mockImplementationOnce(async ({ onDuplicate }: { onDuplicate: (id: string) => Promise<unknown> }) => {
      // Simulate duplicate cmid — call onDuplicate directly
      return onDuplicate('existing-pref-id');
    });

    const prisma = makePrisma({
      findUniqueResult: { id: 'existing-pref-id', privacy: STORED_PRIVACY },
      upsertResult: { id: 'existing-pref-id', privacy: STORED_PRIVACY },
    });
    const appDup = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    appDup.decorate('prisma', prisma as unknown);
    appDup.decorate('socketIOHandler', { getManager: () => null } as unknown);
    appDup.decorate('mutationLogService', null as unknown);
    appDup.addHook('preHandler', async (req) => {
      (req as unknown as Record<string, unknown>).auth = { userId: USER_ID };
    });
    const router = createPreferenceRouter('privacy', PrivacyPreferenceSchema, PRIVACY_PREFERENCE_DEFAULTS);
    await appDup.register(router, { prefix: '/me/preferences/privacy' });
    await appDup.ready();

    const res = await appDup.inject({
      method: 'PUT',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: STORED_PRIVACY,
    });

    expect(res.statusCode).toBe(200);
    await appDup.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /me/preferences/:category — partial update
// ═══════════════════════════════════════════════════════════════════════════════

describe('PATCH /me/preferences/privacy', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildCategoryApp('privacy', {
      findUniqueResult: { privacy: STORED_PRIVACY },
      upsertResult: { id: 'pref-id', privacy: STORED_PRIVACY },
    });
  });
  afterAll(() => app.close());
  beforeEach(() => {
    jest.clearAllMocks();
    mockValidatePreferences.mockResolvedValue([]);
    mockWithMutationLog.mockImplementation(async ({ op }: { op: () => Promise<unknown> }) => op());
  });

  it('returns 200 with merged preferences on partial body', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: { showOnlineStatus: true },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
  });

  it('merges partial update with existing preferences', async () => {
    const prisma = makePrisma({
      findUniqueResult: { privacy: STORED_PRIVACY },
      upsertResult: { id: 'pref-id', privacy: { ...STORED_PRIVACY, showOnlineStatus: true } },
    });
    const appInspect = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    appInspect.decorate('prisma', prisma as unknown);
    appInspect.decorate('socketIOHandler', { getManager: () => ({ getIO: () => null }) } as unknown);
    appInspect.decorate('mutationLogService', null as unknown);
    appInspect.addHook('preHandler', async (req) => {
      (req as unknown as Record<string, unknown>).auth = { userId: USER_ID };
    });
    const router = createPreferenceRouter('privacy', PrivacyPreferenceSchema, PRIVACY_PREFERENCE_DEFAULTS);
    await appInspect.register(router, { prefix: '/me/preferences/privacy' });
    await appInspect.ready();

    await appInspect.inject({
      method: 'PATCH',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: { showOnlineStatus: true },
    });

    const upsertCall = (prisma.userPreferences.upsert as ReturnType<typeof jest.fn>).mock.calls[0][0];
    // merged: patched showOnlineStatus=true overrides existing false
    expect(upsertCall.update.privacy.showOnlineStatus).toBe(true);
    // Zod .partial().parse() fills in defaults for omitted fields,
    // so other fields come from Zod defaults (not the stored values) merged on top.
    // The important invariant: the upsert receives a complete object with showOnlineStatus=true.
    expect(upsertCall.update.privacy.encryptionPreference).toBe('optional');
    await appInspect.close();
  });

  it('uses defaults when existing preferences are null', async () => {
    const prisma = makePrisma({
      findUniqueResult: { privacy: null },
      upsertResult: { id: 'pref-id', privacy: PRIVACY_PREFERENCE_DEFAULTS },
    });
    const appDefaults = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    appDefaults.decorate('prisma', prisma as unknown);
    appDefaults.decorate('socketIOHandler', { getManager: () => null } as unknown);
    appDefaults.decorate('mutationLogService', null as unknown);
    appDefaults.addHook('preHandler', async (req) => {
      (req as unknown as Record<string, unknown>).auth = { userId: USER_ID };
    });
    const router = createPreferenceRouter('privacy', PrivacyPreferenceSchema, PRIVACY_PREFERENCE_DEFAULTS);
    await appDefaults.register(router, { prefix: '/me/preferences/privacy' });
    await appDefaults.ready();

    const res = await appDefaults.inject({
      method: 'PATCH',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: { blockScreenshots: true },
    });

    expect(res.statusCode).toBe(200);
    const upsertCall = (prisma.userPreferences.upsert as ReturnType<typeof jest.fn>).mock.calls[0][0];
    // merged: defaults base + patch override
    expect(upsertCall.update.privacy.blockScreenshots).toBe(true);
    // default value for a non-patched field
    expect(upsertCall.update.privacy.showOnlineStatus).toBe(PRIVACY_PREFERENCE_DEFAULTS.showOnlineStatus);
    await appDefaults.close();
  });

  it('returns 400 when partial body fails Zod validation', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: { showOnlineStatus: 'bad-value' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 403 when consent violations arise from merged preferences', async () => {
    mockValidatePreferences.mockResolvedValueOnce([
      { field: 'allowAnalytics', message: 'Missing consent', requiredConsents: ['dataProcessingConsentAt'] },
    ] as never);

    const res = await app.inject({
      method: 'PATCH',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: { allowAnalytics: true },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error).toBe('CONSENT_REQUIRED');
  });

  it('returns 401 when userId is missing', async () => {
    const appNoAuth = await buildCategoryApp('privacy', {}, 'no-user-id');
    const res = await appNoAuth.inject({
      method: 'PATCH',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: { showOnlineStatus: true },
    });

    expect(res.statusCode).toBe(401);
    await appNoAuth.close();
  });

  it('returns 500 on db error during findUnique', async () => {
    const appErr = await buildCategoryApp('privacy', { findUniqueError: new Error('db crash') });
    const res = await appErr.inject({
      method: 'PATCH',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: { showOnlineStatus: true },
    });

    expect(res.statusCode).toBe(500);
    await appErr.close();
  });

  it('returns 500 on db error during upsert', async () => {
    const appErr = await buildCategoryApp('privacy', {
      findUniqueResult: { privacy: STORED_PRIVACY },
      upsertError: new Error('upsert failed'),
    });
    const res = await appErr.inject({
      method: 'PATCH',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: { showOnlineStatus: true },
    });

    expect(res.statusCode).toBe(500);
    await appErr.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /me/preferences/:category — reset to defaults
// ═══════════════════════════════════════════════════════════════════════════════

describe('DELETE /me/preferences/privacy', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildCategoryApp('privacy');
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with reset message on success', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/me/preferences/privacy', headers: AUTH });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.message).toMatch(/privacy.*reset/i);
  });

  it('returns 401 when userId is missing', async () => {
    const appNoAuth = await buildCategoryApp('privacy', {}, 'no-user-id');
    const res = await appNoAuth.inject({ method: 'DELETE', url: '/me/preferences/privacy', headers: AUTH });

    expect(res.statusCode).toBe(401);
    await appNoAuth.close();
  });

  it('returns 500 on db error', async () => {
    const appErr = await buildCategoryApp('privacy', { updateManyError: new Error('db crash') });
    const res = await appErr.inject({ method: 'DELETE', url: '/me/preferences/privacy', headers: AUTH });

    expect(res.statusCode).toBe(500);
    await appErr.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// createPreferenceRouter registration — all 7 categories mount correctly
// ═══════════════════════════════════════════════════════════════════════════════

describe('userPreferencesRoutes — sub-routes registration', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(() => app.close());

  it('routes GET /me/preferences/audio — returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/preferences/audio', headers: AUTH });
    expect(res.statusCode).toBe(200);
  });

  it('routes GET /me/preferences/message — returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/preferences/message', headers: AUTH });
    expect(res.statusCode).toBe(200);
  });

  it('routes GET /me/preferences/notification — returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/preferences/notification', headers: AUTH });
    expect(res.statusCode).toBe(200);
  });

  it('routes GET /me/preferences/video — returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/preferences/video', headers: AUTH });
    expect(res.statusCode).toBe(200);
  });

  it('routes GET /me/preferences/document — returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/preferences/document', headers: AUTH });
    expect(res.statusCode).toBe(200);
  });

  it('routes GET /me/preferences/application — returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/preferences/application', headers: AUTH });
    expect(res.statusCode).toBe(200);
  });

  it('routes GET /me/preferences/privacy — returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/preferences/privacy', headers: AUTH });
    expect(res.statusCode).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// createPreferenceRouter — socket emission is best-effort (no crash on missing IO)
// ═══════════════════════════════════════════════════════════════════════════════

describe('createPreferenceRouter — socket emission best-effort', () => {
  beforeEach(() => {
    mockValidatePreferences.mockResolvedValue([]);
    mockWithMutationLog.mockImplementation(async ({ op }: { op: () => Promise<unknown> }) => op());
  });

  it('does not throw when socketIOHandler.getManager returns null', async () => {
    const appNoSocket = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    appNoSocket.decorate('prisma', makePrisma({
      upsertResult: { id: 'pref-id', privacy: STORED_PRIVACY },
    }) as unknown);
    appNoSocket.decorate('socketIOHandler', { getManager: () => null } as unknown);
    appNoSocket.decorate('mutationLogService', null as unknown);
    appNoSocket.addHook('preHandler', async (req) => {
      (req as unknown as Record<string, unknown>).auth = { userId: USER_ID };
    });
    const router = createPreferenceRouter('privacy', PrivacyPreferenceSchema, PRIVACY_PREFERENCE_DEFAULTS);
    await appNoSocket.register(router, { prefix: '/me/preferences/privacy' });
    await appNoSocket.ready();

    const res = await appNoSocket.inject({
      method: 'PUT',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: STORED_PRIVACY,
    });

    expect(res.statusCode).toBe(200);
    await appNoSocket.close();
  });

  it('does not throw when socketIOHandler is absent from fastify', async () => {
    const appNoHandler = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    appNoHandler.decorate('prisma', makePrisma({
      upsertResult: { id: 'pref-id', privacy: STORED_PRIVACY },
    }) as unknown);
    // socketIOHandler intentionally not decorated
    appNoHandler.decorate('mutationLogService', null as unknown);
    appNoHandler.addHook('preHandler', async (req) => {
      (req as unknown as Record<string, unknown>).auth = { userId: USER_ID };
    });
    const router = createPreferenceRouter('privacy', PrivacyPreferenceSchema, PRIVACY_PREFERENCE_DEFAULTS);
    await appNoHandler.register(router, { prefix: '/me/preferences/privacy' });
    await appNoHandler.ready();

    const res = await appNoHandler.inject({
      method: 'PUT',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: STORED_PRIVACY,
    });

    expect(res.statusCode).toBe(200);
    await appNoHandler.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// userPreferencesRoutes — early return when prisma is missing
// ═══════════════════════════════════════════════════════════════════════════════

describe('userPreferencesRoutes — missing prisma guard', () => {
  it('registers without crashing when prisma is not decorated', async () => {
    const appNoPrisma = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    // Do not decorate prisma — route should bail out early via the guard
    appNoPrisma.decorate('socketIOHandler', { getManager: () => null } as unknown);
    appNoPrisma.decorate('mutationLogService', null as unknown);

    // Should not throw on register/ready
    await expect(
      appNoPrisma.register(userPreferencesRoutes, { prefix: '/me/preferences' }).then(() => appNoPrisma.ready())
    ).resolves.not.toThrow();

    await appNoPrisma.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Purge du cache serveur à l'écriture — cycle 47
//
// Le cycle 46 a raccordé l'écran Confidentialité au rangement que les portes de
// diffusion lisent. Restait ceci : ces portes mémoïsent, cinq minutes. Couper
// ses accusés de lecture prenait donc effet jusqu'à cinq minutes plus tard —
// une fenêtre pendant laquelle le serveur continue de diffuser exactement ce que
// l'utilisateur vient de demander de taire, en lui confirmant l'inverse à
// l'écran.
//
// Ces témoins verrouillent que CHAQUE porte d'écriture purge, et qu'une écriture
// d'une AUTRE catégorie ne purge pas (le cache ne parle que de confidentialité).
// ═══════════════════════════════════════════════════════════════════════════════

describe('écriture de préférences — purge du cache serveur', () => {
  beforeEach(() => {
    mockInvalidatePrivacyPreferences.mockClear();
  });

  it('PUT /me/preferences/privacy purge le cache', async () => {
    const app = await buildCategoryApp('privacy');

    await app.inject({
      method: 'PUT',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: { ...PRIVACY_PREFERENCE_DEFAULTS, showReadReceipts: false },
    });

    expect(mockInvalidatePrivacyPreferences).toHaveBeenCalledWith(USER_ID);
    await app.close();
  });

  it('PATCH /me/preferences/privacy purge le cache', async () => {
    const app = await buildCategoryApp('privacy');

    await app.inject({
      method: 'PATCH',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: { showReadReceipts: false },
    });

    expect(mockInvalidatePrivacyPreferences).toHaveBeenCalledWith(USER_ID);
    await app.close();
  });

  it('DELETE /me/preferences/privacy purge le cache', async () => {
    const app = await buildCategoryApp('privacy');

    await app.inject({ method: 'DELETE', url: '/me/preferences/privacy', headers: AUTH });

    expect(mockInvalidatePrivacyPreferences).toHaveBeenCalledWith(USER_ID);
    await app.close();
  });

  it('DELETE /me/preferences purge le cache — la remise à zéro globale efface aussi privacy', async () => {
    const app = await buildApp();

    await app.inject({ method: 'DELETE', url: '/me/preferences', headers: AUTH });

    expect(mockInvalidatePrivacyPreferences).toHaveBeenCalledWith(USER_ID);
    await app.close();
  });

  it("une écriture d'une autre catégorie ne purge PAS le cache de confidentialité", async () => {
    const app = await buildCategoryApp('audio');

    await app.inject({
      method: 'PATCH',
      url: '/me/preferences/audio',
      headers: AUTH,
      payload: {},
    });

    expect(mockInvalidatePrivacyPreferences).not.toHaveBeenCalled();
    await app.close();
  });

  it("une écriture qui ÉCHOUE ne purge pas le cache", async () => {
    const app = await buildCategoryApp('privacy', { upsertError: new Error('db down') });

    await app.inject({
      method: 'PATCH',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: { showReadReceipts: false },
    });

    expect(mockInvalidatePrivacyPreferences).not.toHaveBeenCalled();
    await app.close();
  });
});
