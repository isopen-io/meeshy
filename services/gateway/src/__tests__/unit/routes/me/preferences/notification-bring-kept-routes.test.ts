/**
 * #13936 / contre-audit #14441 (N3) — « Recevoir des Bring » coupé ne se rouvre ni par
 * un REMPLACEMENT qui ne le nomme pas (`PUT` d'alias, `PATCH ?mode=replace`), ni par une
 * RÉINITIALISATION (`DELETE` d'alias, réinitialisation unifiée). Un corps qui le NOMME gagne.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(),
}));

jest.mock('../../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    USER_PREFERENCES_UPDATED: 'user:preferences-updated',
    CATEGORY_CREATED: 'category:created',
    CATEGORY_UPDATED: 'category:updated',
    CATEGORY_DELETED: 'category:deleted',
    CATEGORIES_REORDERED: 'categories:reordered',
  },
  ROOMS: { user: (id: string) => `user:${id}` },
}));

// Le cache serveur de confidentialité : on observe qu'il est PURGÉ, pas ce
// qu'il contient (cf. son propre témoin, `services/preferences/privacy-cache`).
const mockInvalidatePrivacyPreferences = jest.fn();
jest.mock('../../../../../services/preferences/privacy-cache', () => ({
  invalidatePrivacyPreferences: (...args: unknown[]) =>
    mockInvalidatePrivacyPreferences(...(args as [string])),
}));

const mockValidatePreferences = jest.fn<any>().mockResolvedValue([]);
jest.mock('../../../../../services/ConsentValidationService', () => ({
  ConsentValidationService: jest.fn().mockImplementation(() => ({
    validatePreferences: (...args: unknown[]) => mockValidatePreferences(...(args as [])),
  })),
}));

const mockWithMutationLog = jest.fn<any>(({ op }: { op: () => Promise<unknown> }) => op());
jest.mock('../../../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../../../utils/withMutationLog') as object),
  withMutationLog: (...args: unknown[]) => mockWithMutationLog(...(args as [never])),
}));

// ─── Imports après les mocks ──────────────────────────────────────────────────

import { createUnifiedAuthMiddleware } from '../../../../../middleware/auth';
import { userPreferencesRoutes } from '../../../../../routes/me/preferences/index';
import {
  PRIVACY_PREFERENCE_DEFAULTS,
  AUDIO_PREFERENCE_DEFAULTS,
  MESSAGE_PREFERENCE_DEFAULTS,
  NOTIFICATION_PREFERENCE_DEFAULTS,
  VIDEO_PREFERENCE_DEFAULTS,
  DOCUMENT_PREFERENCE_DEFAULTS,
  APPLICATION_PREFERENCE_DEFAULTS,
} from '@meeshy/shared/types/preferences';

const mockCreateAuth = createUnifiedAuthMiddleware as jest.MockedFunction<any>;

/** Les défauts PARTAGÉS, lus — jamais recopiés (cf. l'en-tête). */
const SHARED_DEFAULTS: Record<string, Record<string, unknown>> = {
  privacy: PRIVACY_PREFERENCE_DEFAULTS,
  audio: AUDIO_PREFERENCE_DEFAULTS,
  message: MESSAGE_PREFERENCE_DEFAULTS,
  notification: NOTIFICATION_PREFERENCE_DEFAULTS,
  video: VIDEO_PREFERENCE_DEFAULTS,
  document: DOCUMENT_PREFERENCE_DEFAULTS,
  application: APPLICATION_PREFERENCE_DEFAULTS,
};

const USER_ID = '507f1f77bcf86cd799439011';

// ─── Doubles ──────────────────────────────────────────────────────────────────

type Emission = { readonly room: string; readonly event: string; readonly payload: unknown };

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

function makePrisma(stored: Record<string, unknown> | null = null) {
  const upsert = jest.fn<any>(async ({ update }: { update: Record<string, unknown> }) => ({
    id: 'pref-1',
    ...update,
  }));
  return {
    userPreferences: {
      findUnique: jest.fn<any>().mockResolvedValue(stored),
      upsert,
      update: jest.fn<any>().mockResolvedValue({}),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
    userPreference: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    signalPreKeyBundle: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    userConversationCategory: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>().mockResolvedValue({}),
      update: jest.fn<any>().mockResolvedValue({}),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      delete: jest.fn<any>().mockResolvedValue({}),
    },
    conversationPreference: { updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
    $transaction: jest.fn<any>().mockResolvedValue([]),
  };
}

type RouteRecord = { method: string; url: string; rateLimit: any };

async function buildApp(opts: {
  prisma?: ReturnType<typeof makePrisma>;
  authenticated?: boolean;
} = {}) {
  const { prisma = makePrisma(), authenticated = true } = opts;

  mockCreateAuth.mockImplementation(() => async (req: FastifyRequest) => {
    if (authenticated) (req as any).auth = { userId: USER_ID, isAuthenticated: true };
  });

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const socket = makeSocketLayer();
  app.decorate('prisma', prisma as unknown);
  app.decorate('socketIOHandler', socket.handler as unknown);
  app.decorate('mutationLogService', null as unknown);

  const routes: RouteRecord[] = [];
  app.addHook('onRoute', (routeOptions) => {
    const methods = Array.isArray(routeOptions.method)
      ? routeOptions.method
      : [routeOptions.method];
    for (const method of methods) {
      routes.push({
        method,
        url: routeOptions.url,
        rateLimit: (routeOptions.config as { rateLimit?: unknown } | undefined)?.rateLimit,
      });
    }
  });

  await app.register(userPreferencesRoutes, { prefix: '/me/preferences' });
  await app.ready();
  return { app, prisma, emissions: socket.emissions, routes };
}


const COUPE = { notification: { bringEnabled: false, dndEnabled: false } };
const ecrit = (prisma: ReturnType<typeof makePrisma>) =>
  (prisma.userPreferences.upsert.mock.calls[0]?.[0] as { update: Record<string, Record<string, unknown>> } | undefined)?.update;
const reinitialise = (prisma: ReturnType<typeof makePrisma>) =>
  (prisma.userPreferences.updateMany.mock.calls[0]?.[0] as { data: Record<string, unknown> } | undefined)?.data;

beforeEach(() => { jest.clearAllMocks(); });

describe('« Recevoir des Bring » coupé survit aux remplacements et aux réinitialisations', () => {
  it('PUT /me/preferences/notification sans bringEnabled : il reste coupé', async () => {
    const { app, prisma } = await buildApp({ prisma: makePrisma(COUPE) });
    const res = await app.inject({ method: 'PUT', url: '/me/preferences/notification', payload: { dndEnabled: true } });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(ecrit(prisma)?.notification).toMatchObject({ dndEnabled: true, bringEnabled: false });
  });

  it('PATCH /me/preferences?mode=replace sans bringEnabled : il reste coupé', async () => {
    const { app, prisma } = await buildApp({ prisma: makePrisma(COUPE) });
    const res = await app.inject({ method: 'PATCH', url: '/me/preferences?mode=replace', payload: { notification: { dndEnabled: true } } });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(ecrit(prisma)?.notification).toMatchObject({ dndEnabled: true, bringEnabled: false });
  });

  it('un corps qui NOMME bringEnabled gagne', async () => {
    const { app, prisma } = await buildApp({ prisma: makePrisma(COUPE) });
    await app.inject({ method: 'PUT', url: '/me/preferences/notification', payload: { bringEnabled: true } });
    await app.close();

    expect(ecrit(prisma)?.notification).toMatchObject({ bringEnabled: true });
  });

  it('DELETE /me/preferences/notification : les autres réglages reviennent aux défauts, le Bring reste coupé', async () => {
    const { app, prisma } = await buildApp({ prisma: makePrisma(COUPE) });
    const res = await app.inject({ method: 'DELETE', url: '/me/preferences/notification' });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(reinitialise(prisma)).toEqual({ notification: { bringEnabled: false } });
  });

  it('la réinitialisation unifiée garde aussi la coupure', async () => {
    const { app, prisma } = await buildApp({ prisma: makePrisma(COUPE) });
    const res = await app.inject({ method: 'DELETE', url: '/me/preferences?categories=notification' });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(reinitialise(prisma)).toMatchObject({ notification: { bringEnabled: false } });
  });

  it('rien de coupé : la réinitialisation écrit null, comme avant', async () => {
    const { app, prisma } = await buildApp({ prisma: makePrisma(null) });
    await app.inject({ method: 'DELETE', url: '/me/preferences/notification' });
    await app.close();

    expect(reinitialise(prisma)).toEqual({ notification: null });
  });
});
