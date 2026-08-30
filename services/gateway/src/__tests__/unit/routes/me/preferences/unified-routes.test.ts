/**
 * Les TROIS routes unifiées de préférences (#4181).
 *
 * Ce fichier passe par la ROUTE, jamais par les fonctions seules, et c'est une
 * exigence du critère 3 : le défaut qu'il doit attraper — une clé absente d'un
 * `mode=replace` qu'on aurait remise à son défaut Zod — se lit dans la charge
 * SÉRIALISÉE. Un témoin qui appellerait le validateur en direct ne verrait ni
 * le sérialiseur `fast-json-stringify` (qui rend `{}` pour un `type: 'object'`
 * sans `additionalProperties`), ni la composition query → sélection → lecture.
 *
 * Les défauts attendus sont LUS depuis `@meeshy/shared/types/preferences`, pas
 * recopiés : c'est ce qui fait de ce fichier le témoin du critère 2. Une clé
 * ajoutée à une catégorie partagée doit apparaître dans la réponse de l'agrégat
 * sans qu'aucune ligne d'`index.ts` — ni d'ici — ne soit touchée. Recopier les
 * clés attendues aurait rendu ce témoin vert sur un agrégat qui réimplémente sa
 * propre complétion, c'est-à-dire sur le défaut même.
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
import { PREFERENCE_CATEGORIES } from '../../../../../services/preferences/preferences-broadcast';
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

const preferenceEmissions = (emissions: readonly Emission[]) =>
  emissions.filter((e) => e.event === 'user:preferences-updated');

beforeEach(() => {
  jest.clearAllMocks();
  mockValidatePreferences.mockResolvedValue([]);
  mockWithMutationLog.mockImplementation(({ op }: { op: () => Promise<unknown> }) => op());
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /me/preferences — huit routes en une
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /me/preferences — la lecture unifiée', () => {
  it('sert les SEPT catégories, chacune portant EXACTEMENT les clés de ses défauts partagés', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/me/preferences' });

    expect(res.statusCode).toBe(200);
    const data = res.json().data as Record<string, Record<string, unknown>>;
    expect(Object.keys(data).sort()).toEqual([...PREFERENCE_CATEGORIES].sort());

    // Le CŒUR du critère 2 : les clés attendues viennent des constantes
    // partagées. Un agrégat qui réimplémente sa complétion diverge dès qu'une
    // clé est ajoutée là-bas — ce témoin le dit, aucun autre ne le peut.
    for (const category of PREFERENCE_CATEGORIES) {
      expect(Object.keys(data[category]).sort()).toEqual(
        Object.keys(SHARED_DEFAULTS[category]).sort()
      );
    }
    await app.close();
  });

  it('sert le document stocké par-dessus les défauts', async () => {
    const { app } = await buildApp({
      prisma: makePrisma({ application: { theme: 'dark' }, privacy: { showOnlineStatus: false } }),
    });
    const res = await app.inject({ method: 'GET', url: '/me/preferences' });
    const data = res.json().data;

    expect(data.application.theme).toBe('dark');
    expect(data.application.fontSize).toBe(APPLICATION_PREFERENCE_DEFAULTS.fontSize);
    expect(data.privacy.showOnlineStatus).toBe(false);
    await app.close();
  });

  it('`?categories=` ne sert QUE les catégories nommées, et ne lit que leurs colonnes', async () => {
    const { app, prisma } = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/me/preferences?categories=application,notification',
    });

    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.json().data).sort()).toEqual(['application', 'notification']);

    // Le poids : la ligne n'est plus repatriée en entier pour en lire deux
    // colonnes. C'est ce que `?categories=` achète, et rien d'autre ne le dit.
    const select = prisma.userPreferences.findUnique.mock.calls[0][0].select;
    expect(Object.keys(select).sort()).toEqual(['application', 'notification']);
    await app.close();
  });

  it('`?fields=catégorie.clé` réduit jusqu\'à la CLÉ', async () => {
    const { app } = await buildApp({ prisma: makePrisma({ application: { theme: 'dark' } }) });
    const res = await app.inject({
      method: 'GET',
      url: '/me/preferences?fields=application.theme,notification',
    });

    const data = res.json().data;
    expect(Object.keys(data).sort()).toEqual(['application', 'notification']);
    expect(data.application).toEqual({ theme: 'dark' });
    expect(Object.keys(data.notification).sort()).toEqual(
      Object.keys(NOTIFICATION_PREFERENCE_DEFAULTS).sort()
    );
    await app.close();
  });

  it('refuse une catégorie inconnue plutôt que de servir un vide qui a l\'air vrai', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/me/preferences?categories=notifications' });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('UNKNOWN_CATEGORY');
    await app.close();
  });

  it('refuse une clé inconnue, et une clé hors des catégories demandées', async () => {
    const { app } = await buildApp();

    const champ = await app.inject({
      method: 'GET',
      url: '/me/preferences?fields=application.theme2',
    });
    expect(champ.statusCode).toBe(400);
    expect(champ.json().error).toBe('UNKNOWN_FIELD');

    const hors = await app.inject({
      method: 'GET',
      url: '/me/preferences?categories=audio&fields=video.quality',
    });
    expect(hors.statusCode).toBe(400);
    expect(hors.json().error).toBe('FIELD_OUTSIDE_CATEGORIES');
    await app.close();
  });

  it('rend 304 sur `If-None-Match`, et un ETag PROPRE à la sélection', async () => {
    const { app } = await buildApp();

    const complet = await app.inject({ method: 'GET', url: '/me/preferences' });
    const etagComplet = complet.headers.etag as string;
    expect(etagComplet).toBeTruthy();

    const rejoue = await app.inject({
      method: 'GET',
      url: '/me/preferences',
      headers: { 'if-none-match': etagComplet },
    });
    expect(rejoue.statusCode).toBe(304);
    expect(rejoue.body).toBe('');

    // Deux écrans qui lisent deux sous-ensembles ne s'invalident plus l'un
    // l'autre : l'ETag hache CE QUI EST SERVI.
    const partiel = await app.inject({ method: 'GET', url: '/me/preferences?categories=audio' });
    expect(partiel.headers.etag).not.toBe(etagComplet);
    await app.close();
  });

  it('rend 401 sans compte', async () => {
    const { app } = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'GET', url: '/me/preferences' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('rend 500 quand la base tombe', async () => {
    const prisma = makePrisma();
    prisma.userPreferences.findUnique = jest.fn<any>().mockRejectedValue(new Error('db crash'));
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/me/preferences' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /me/preferences — quatorze routes en une
// ═══════════════════════════════════════════════════════════════════════════════

describe('PATCH /me/preferences — l\'écriture unifiée', () => {
  it('écrit DEUX catégories en UN seul upsert, et diffuse une fois par catégorie', async () => {
    const { app, prisma, emissions } = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/me/preferences',
      payload: { application: { theme: 'dark' }, notification: { pushEnabled: false } },
    });

    expect(res.statusCode).toBe(200);
    expect(prisma.userPreferences.upsert).toHaveBeenCalledTimes(1);

    const update = prisma.userPreferences.upsert.mock.calls[0][0].update;
    expect(Object.keys(update).sort()).toEqual(['application', 'notification']);
    expect(update.application.theme).toBe('dark');
    expect(update.notification.pushEnabled).toBe(false);

    // Le contrat client est PAR CATÉGORIE : un évènement « tout » serait
    // laissé tomber par `use-socket-cache-sync`, qui ne discrimine que sur
    // `category`.
    const diffusees = preferenceEmissions(emissions).map((e) => (e.payload as any).category);
    expect(diffusees.sort()).toEqual(['application', 'notification']);
    await app.close();
  });

  it('`mode=merge` (défaut) rend la forme du GET, complétée par les défauts', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/me/preferences',
      payload: { application: { theme: 'dark' } },
    });

    const application = res.json().data.application;
    expect(application.theme).toBe('dark');
    expect(Object.keys(application).sort()).toEqual(
      Object.keys(APPLICATION_PREFERENCE_DEFAULTS).sort()
    );
    await app.close();
  });

  it('un REJEU de cmid ressert la forme du GET, même sur un document laissé PARTIEL par un `replace`', async () => {
    // Le seul chemin où la complétion de la RÉPONSE porte quelque chose que
    // l'écriture n'a pas déjà fait. `mode=merge` écrit un document complet, si
    // bien qu'un écho de la base ressemble à une réponse complétée ; le rejeu,
    // lui, relit ce que la MUTATION PRÉCÉDENTE avait laissé — et un `replace`
    // laisse volontairement un document partiel. Sans complétion ici, le client
    // qui rejoue sa mutation hors ligne reçoit un objet amputé, et l'écran
    // affiche des réglages vides là où le serveur en obéit des pleins.
    const prisma = makePrisma();
    prisma.userPreferences.findUnique = jest
      .fn<any>()
      .mockResolvedValue({ id: 'pref-1', application: { theme: 'dark' } });
    mockWithMutationLog.mockImplementation(({ onDuplicate }: { onDuplicate: (id: string) => Promise<unknown> }) =>
      onDuplicate('pref-1')
    );

    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: '/me/preferences',
      payload: { application: { theme: 'dark' } },
    });

    expect(res.statusCode).toBe(200);
    const application = res.json().data.application;
    expect(application.theme).toBe('dark');
    expect(Object.keys(application).sort()).toEqual(
      Object.keys(APPLICATION_PREFERENCE_DEFAULTS).sort()
    );
    await app.close();
  });

  it('`mode=merge` fusionne par-dessus le STOCKÉ, sans remettre un voisin à son défaut', async () => {
    const { app, prisma } = await buildApp({
      prisma: makePrisma({ application: { accentColor: 'rose', theme: 'light' } }),
    });
    await app.inject({
      method: 'PATCH',
      url: '/me/preferences',
      payload: { application: { theme: 'dark' } },
    });

    const written = prisma.userPreferences.upsert.mock.calls[0][0].update.application;
    expect(written.theme).toBe('dark');
    expect(written.accentColor).toBe('rose');
    await app.close();
  });

  it('`mode=replace` laisse ABSENTE une clé que le corps ne nomme pas — pas remise à son défaut', async () => {
    const { app, prisma } = await buildApp({
      prisma: makePrisma({ application: { theme: 'light', accentColor: 'rose' } }),
    });
    const res = await app.inject({
      method: 'PATCH',
      url: '/me/preferences?mode=replace',
      payload: { application: { theme: 'dark' } },
    });

    expect(res.statusCode).toBe(200);

    // Ce que la base REÇOIT : le corps, et rien que lui. `PUT` y écrivait le
    // schéma entier garni de ses `default()` — une réinitialisation partielle
    // silencieuse de tout ce que le corps ne nommait pas.
    const written = prisma.userPreferences.upsert.mock.calls[0][0].update.application;
    expect(written).toEqual({ theme: 'dark' });
    expect(written).not.toHaveProperty('fontSize');
    expect(written).not.toHaveProperty('accentColor');

    // Ce que le client LIT — mesuré sur la charge sérialisée, donc à travers
    // le schéma AJV réel de la route (critère 3).
    const application = res.json().data.application;
    expect(application).toEqual({ theme: 'dark' });
    expect(application).not.toHaveProperty('fontSize');
    await app.close();
  });

  it('refuse un `mode` inconnu, un corps vide, un corps non-objet et une catégorie inconnue', async () => {
    const { app } = await buildApp();

    const mode = await app.inject({
      method: 'PATCH',
      url: '/me/preferences?mode=overwrite',
      payload: { application: { theme: 'dark' } },
    });
    expect(mode.statusCode).toBe(400);
    expect(mode.json().error).toBe('VALIDATION_ERROR');

    const vide = await app.inject({ method: 'PATCH', url: '/me/preferences', payload: {} });
    expect(vide.statusCode).toBe(400);

    const inconnue = await app.inject({
      method: 'PATCH',
      url: '/me/preferences',
      payload: { applications: { theme: 'dark' } },
    });
    expect(inconnue.statusCode).toBe(400);
    expect(inconnue.json().error).toBe('UNKNOWN_CATEGORY');
    await app.close();
  });

  it('rend 400 sur une valeur que le schéma refuse', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/me/preferences',
      payload: { privacy: { showOnlineStatus: 'peut-être' } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('VALIDATION_ERROR');
    await app.close();
  });

  it('rend 403 en nommant la CATÉGORIE de chaque manquement de consentement', async () => {
    mockValidatePreferences.mockResolvedValue([
      { field: 'audioTranscriptionEnabled', message: 'Requires consent', requiredConsents: ['voiceDataConsentAt'] },
    ]);
    const { app, prisma } = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/me/preferences',
      payload: { audio: { transcriptionEnabled: true } },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error).toBe('CONSENT_REQUIRED');
    expect(body.violations[0].category).toBe('audio');
    // Un refus n'écrit rien : le corps multi-catégories est TOUT ou RIEN.
    expect(prisma.userPreferences.upsert).not.toHaveBeenCalled();
    await app.close();
  });

  it('rend 401 sans compte', async () => {
    const { app } = await buildApp({ authenticated: false });
    const res = await app.inject({
      method: 'PATCH',
      url: '/me/preferences',
      payload: { application: { theme: 'dark' } },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /me/preferences — huit routes en une
// ═══════════════════════════════════════════════════════════════════════════════

describe('DELETE /me/preferences — la remise à zéro unifiée', () => {
  it('sans liste, remet les SEPT catégories et fait les TROIS gestes', async () => {
    const { app, prisma, emissions } = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/me/preferences' });

    expect(res.statusCode).toBe(200);

    const data = prisma.userPreferences.updateMany.mock.calls[0][0].data;
    expect(Object.keys(data).sort()).toEqual([...PREFERENCE_CATEGORIES].sort());
    expect(Object.values(data).every((v) => v === null)).toBe(true);

    // Geste 1 — les lignes héritées de janvier 2026. Sans lui, la lecture
    // redescend sur elles et la remise à zéro ne remet RIEN, tout en n'étant
    // plus visible nulle part.
    expect(prisma.userPreference.deleteMany).toHaveBeenCalled();
    // Geste 2 — le cache des six portes de diffusion.
    expect(mockInvalidatePrivacyPreferences).toHaveBeenCalledWith(USER_ID);
    // Geste 3 — une diffusion PAR catégorie.
    expect(preferenceEmissions(emissions)).toHaveLength(PREFERENCE_CATEGORIES.length);
    await app.close();
  });

  it('`?categories=audio` ne touche QUE l\'audio — ni cache de confidentialité, ni lignes héritées', async () => {
    const { app, prisma, emissions } = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/me/preferences?categories=audio' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.categories).toEqual(['audio']);
    expect(prisma.userPreferences.updateMany.mock.calls[0][0].data).toEqual({ audio: null });
    expect(prisma.userPreference.deleteMany).not.toHaveBeenCalled();
    expect(mockInvalidatePrivacyPreferences).not.toHaveBeenCalled();
    expect(preferenceEmissions(emissions).map((e) => (e.payload as any).category)).toEqual(['audio']);
    await app.close();
  });

  it('refuse une catégorie inconnue plutôt que de tout effacer', async () => {
    const { app, prisma } = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/me/preferences?categories=tout' });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('UNKNOWN_CATEGORY');
    expect(prisma.userPreferences.updateMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('rend 401 sans compte', async () => {
    const { app } = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'DELETE', url: '/me/preferences' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Débit — par COMPTE, jamais par adresse (critère 5)
// ═══════════════════════════════════════════════════════════════════════════════

describe('débit des trois routes unifiées', () => {
  const attendus: ReadonlyArray<readonly [string, number]> = [
    ['GET', 300],
    ['PATCH', 120],
    ['DELETE', 20],
  ];

  it.each(attendus)('%s /me/preferences porte %i/min par compte', async (method, max) => {
    const { app, routes } = await buildApp();
    const route = routes.find((r) => r.method === method && r.url === '/me/preferences');

    expect(route).toBeDefined();
    expect(route?.rateLimit?.max).toBe(max);
    expect(route?.rateLimit?.timeWindow).toBe('1 minute');

    // La PHASE est ce qui décide de ce que la clé compte. Le limiteur s'accroche
    // en `onRequest` par défaut, c'est-à-dire AVANT l'authentification de ce
    // module (un hook `preHandler`) : la clé retomberait alors sur l'adresse à
    // chaque requête, et « par compte » serait un mensonge de configuration.
    expect(route?.rateLimit?.hook).toBe('preHandler');

    const key = route?.rateLimit?.keyGenerator({ auth: { userId: USER_ID }, ip: '10.0.0.1' });
    expect(key).toContain(USER_ID);
    expect(key).not.toContain('10.0.0.1');
    await app.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Double montage : les alias survivent, marqués (critère 6)
// ═══════════════════════════════════════════════════════════════════════════════

describe('les vingt-huit alias par catégorie', () => {
  it('restent montés — quatre verbes pour chacune des sept catégories', async () => {
    const { app, routes } = await buildApp();
    for (const category of PREFERENCE_CATEGORIES) {
      for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) {
        expect(
          routes.some((r) => r.method === method && r.url === `/me/preferences/${category}`)
        ).toBe(true);
      }
    }
    await app.close();
  });

  it('portent `Deprecation` (RFC 9745) et le lien vers leur successeur — les unifiées, non', async () => {
    // `Deprecation: 'true'` était le brouillon 2019 — une SECONDE
    // implémentation, écrite ici avant que `utils/deprecation.ts` (#4274)
    // n'existe, et restée JUMELLE ET DIVERGENTE de lui après coup (dimension
    // 11 : une seule source de vérité). La forme correcte, RFC 9745, est une
    // date structurée : `@<secondes-epoch>`, jamais un booléen. Tous les
    // autres sites du dépôt qui déprécient une adresse aujourd'hui (reports,
    // profile, register, sharing, feed, friends…) la produisent déjà par
    // `depreciee()` — un alias de préférences qui reste sur son propre format
    // serait la SEULE adresse dépréciée du dépôt qu'un client ne peut pas
    // dater.
    const { app } = await buildApp();

    const alias = await app.inject({ method: 'GET', url: '/me/preferences/audio' });
    expect(alias.statusCode).toBe(200);
    expect(alias.headers.deprecation).toMatch(/^@\d+$/);
    expect(alias.headers.deprecation).not.toBe('true');
    expect(alias.headers.link).toContain('/api/v1/me/preferences');
    expect(alias.headers.link).toContain('rel="successor-version"');
    // Pas de `retraitLe` codé en dur : le retrait est gouverné par le
    // compteur d'adoption de #4275, jamais par une date posée à la main.
    expect(alias.headers.sunset).toBeUndefined();

    const unifiee = await app.inject({ method: 'GET', url: '/me/preferences' });
    expect(unifiee.headers.deprecation).toBeUndefined();
    await app.close();
  });

  it('annonce le sursis quel que soit le verdict — même sur un 401', async () => {
    // `onRequest` court AVANT l'authentification de ce module (un hook
    // `preHandler`) : l'annonce doit donc apparaître même quand la requête
    // est refusée. C'est justement l'appelant dont le jeton a expiré, ou dont
    // le binaire est trop vieux pour renouveler l'auth, qui a le plus besoin
    // d'apprendre qu'il parle à une adresse en sursis.
    const { app } = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'GET', url: '/me/preferences/audio' });
    expect(res.statusCode).toBe(401);
    expect(res.headers.deprecation).toMatch(/^@\d+$/);
    await app.close();
  });

  it('servent le MÊME état que la route unifiée — la période d\'alias ne fait pas diverger', async () => {
    const { app } = await buildApp({ prisma: makePrisma({ audio: { transcriptionEnabled: false } }) });

    const alias = await app.inject({ method: 'GET', url: '/me/preferences/audio' });
    const unifiee = await app.inject({ method: 'GET', url: '/me/preferences?categories=audio' });

    expect(alias.json().data).toEqual(unifiee.json().data.audio);
    await app.close();
  });
});
