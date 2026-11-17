/**
 * Deux bascules rapprochées ne se perdent pas (#18910, web-notifs-4).
 *
 * Sur un réseau lent, l'utilisateur coupe « Son », puis « Jeu » 300 ms plus
 * tard. Chaque `PATCH` ne porte QUE la clé du geste. La route lisait la
 * catégorie, la fusionnait côté serveur et réécrivait la colonne ENTIÈRE : les
 * deux lectures précédaient les deux écritures, la dernière gagnait, et l'écran
 * — qui n'adopte de chaque réponse que la clé de son geste — affichait les deux
 * coupées pendant que le serveur en gardait une allumée. Le son continuait de
 * sonner, et la bascule « revenait » au rechargement.
 *
 * Le témoin passe par la ROUTE et par une table dont la lecture rend un
 * instantané PRIS À L'APPEL (cf. `helpers/user-preferences-store`) : c'est la
 * seule forme où la course existe.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyRequest } from 'fastify';

jest.mock('../../../../../middleware/auth', () => ({ createUnifiedAuthMiddleware: jest.fn() }));
jest.mock('../../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
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
jest.mock('../../../../../services/preferences/privacy-cache', () => ({ invalidatePrivacyPreferences: jest.fn() }));
jest.mock('../../../../../services/ConsentValidationService', () => ({
  ConsentValidationService: jest.fn().mockImplementation(() => ({ validatePreferences: async () => [] })),
}));
jest.mock('../../../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../../../utils/withMutationLog') as object),
  withMutationLog: ({ op }: { op: () => Promise<unknown> }) => op(),
}));

import { createUnifiedAuthMiddleware } from '../../../../../middleware/auth';
import { userPreferencesRoutes } from '../../../../../routes/me/preferences/index';
import { NOTIFICATION_PREFERENCE_DEFAULTS } from '@meeshy/shared/types/preferences';
import { makeUserPreferencesStore } from '../../../../helpers/user-preferences-store';

const USER_ID = '507f1f77bcf86cd799439011';

async function buildApp(store: ReturnType<typeof makeUserPreferencesStore>) {
  (createUnifiedAuthMiddleware as jest.MockedFunction<any>).mockImplementation(() => async (req: FastifyRequest) => {
    (req as any).auth = { userId: USER_ID, isAuthenticated: true };
  });
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const emitter = { to: () => ({ emit: () => undefined }) };
  app.decorate('prisma', { ...store, userPreference: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) } } as unknown);
  app.decorate('socketIOHandler', { getManager: () => ({ getIO: () => emitter }) } as unknown);
  app.decorate('mutationLogService', null as unknown);
  await app.register(userPreferencesRoutes, { prefix: '/me/preferences' });
  await app.ready();
  return app;
}

const patch = (app: Awaited<ReturnType<typeof buildApp>>, body: unknown, mode = 'merge') =>
  app.inject({ method: 'PATCH', url: `/me/preferences?mode=${mode}`, payload: body as object });

const storedNotification = (store: ReturnType<typeof makeUserPreferencesStore>) =>
  store.rowOf(USER_ID)?.notification as Record<string, unknown> | undefined;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PATCH /me/preferences — deux bascules rapprochées', () => {
  it('« Son » puis « Jeu » à 300 ms d’écart : les deux restent coupées sur le serveur', async () => {
    const store = makeUserPreferencesStore({ rows: { [USER_ID]: { notification: { pushEnabled: true } } }, readLatencyMs: 40 });
    const app = await buildApp(store);

    const [first, second] = await Promise.all([
      patch(app, { notification: { soundEnabled: false } }),
      patch(app, { notification: { gameEnabled: false } }),
    ]);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(storedNotification(store)).toMatchObject({ soundEnabled: false, gameEnabled: false });
    await app.close();
  });

  it('la ligne n’existe pas encore : les deux premières bascules survivent aussi', async () => {
    const store = makeUserPreferencesStore({ readLatencyMs: 40 });
    const app = await buildApp(store);

    await Promise.all([
      patch(app, { notification: { soundEnabled: false } }),
      patch(app, { notification: { gameEnabled: false } }),
    ]);

    expect(storedNotification(store)).toMatchObject({ soundEnabled: false, gameEnabled: false });
    await app.close();
  });

  it('une clé non touchée garde sa valeur stockée, et les défauts comblent le reste', async () => {
    const store = makeUserPreferencesStore({ rows: { [USER_ID]: { notification: { pushEnabled: false } } } });
    const app = await buildApp(store);

    const res = await patch(app, { notification: { soundEnabled: false } });

    const served = res.json().data.notification as Record<string, unknown>;
    expect(served.pushEnabled).toBe(false);
    expect(served.soundEnabled).toBe(false);
    expect(served.gameEnabled).toBe(NOTIFICATION_PREFERENCE_DEFAULTS.gameEnabled);
    expect(storedNotification(store)).toMatchObject({ pushEnabled: false, soundEnabled: false });
    await app.close();
  });

  it('deux catégories dans un même corps : les deux sont fusionnées sans effacer leurs voisines', async () => {
    const store = makeUserPreferencesStore({
      rows: { [USER_ID]: { notification: { pushEnabled: false }, application: { theme: 'dark' } } },
    });
    const app = await buildApp(store);

    await patch(app, { notification: { soundEnabled: false }, application: { fontSize: 'large' } });

    expect(storedNotification(store)).toMatchObject({ pushEnabled: false, soundEnabled: false });
    expect(store.rowOf(USER_ID)?.application).toMatchObject({ theme: 'dark', fontSize: 'large' });
    await app.close();
  });

  it('par l’adresse de catégorie (PATCH /me/preferences/notification, Android) : les deux bascules survivent', async () => {
    const store = makeUserPreferencesStore({ rows: { [USER_ID]: { notification: { pushEnabled: true } } }, readLatencyMs: 40 });
    const app = await buildApp(store);
    const patchAlias = (body: object) => app.inject({ method: 'PATCH', url: '/me/preferences/notification', payload: body });

    const [first, second] = await Promise.all([
      patchAlias({ soundEnabled: false }),
      patchAlias({ gameEnabled: false }),
    ]);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(storedNotification(store)).toMatchObject({ pushEnabled: true, soundEnabled: false, gameEnabled: false });
    await app.close();
  });
});
