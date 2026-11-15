/**
 * LA BATTERIE par REST (#14147) — le relevé (`POST /me/device/battery`, la même porte que la
 * socket), l'état servi à un lecteur, le relevé à la demande (Sang seulement, une fois toutes les
 * 5 min) et les réglages. Chaque réponse traverse le VRAI sérialiseur : un champ servi est un
 * champ déclaré, et rien d'autre ne sort.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => {
  const logger = { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() };
  return { enhancedLogger: { ...logger, child: () => logger } };
});
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn(), logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

const cache = new Map<string, string>();
jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({
    get: async (key: string) => cache.get(key) ?? null,
    set: async (key: string, value: string) => { cache.set(key, value); },
    setnx: async (key: string, value: string) => {
      if (cache.has(key)) return false;
      cache.set(key, value);
      return true;
    },
    del: async (key: string) => { cache.delete(key); },
    keys: async () => [...cache.keys()],
  }),
}));

const wakes: Array<Record<string, unknown>> = [];
jest.mock('../../../../services/PushNotificationService', () => ({
  getPushNotificationService: () => ({
    sendToUser: async (options: Record<string, unknown>) => { wakes.push(options); return []; },
  }),
}));

import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { relationsRoutes } from '../../../../routes/relations';
import deviceBatteryMeRoutes from '../../../../routes/me/device-battery';
import { freezeClock, thawClock } from '../../../helpers/relation-app';
import { AUTRE, MOI, NOW, buildBringApp, lien, type BringAppOptions, type BringTestApp } from '../../../helpers/bring-app';

const appli = (options: BringAppOptions = { liens: [lien('BLOOD', 'BLOOD')] }): Promise<BringTestApp> =>
  buildBringApp(async (a) => {
    await a.register(relationsRoutes, { prefix: '/api/v1/relations' });
    await a.register(deviceBatteryMeRoutes, { prefix: '/api/v1/me' });
  }, options);

const releve = (level: number) => ({ level, charging: false, lowPower: false, measuredAt: NOW.toISOString(), deviceLabel: 'iPhone' });

function avecSessions(app: BringTestApp) {
  app.prisma.userSession = { findFirst: jest.fn(async () => null) };
  app.prisma.conversation = { findMany: jest.fn(async () => []) };
  const egal = (value: unknown, condition: unknown) =>
    condition !== null && typeof condition === 'object' && 'in' in condition ? (condition as { in: unknown[] }).in.includes(value) : value === condition;
  app.prisma.relationFeatureSetting.findMany = jest.fn(async (args: { where: Record<string, unknown> }) =>
    [...app.reglages.values()].filter((row) => Object.entries(args.where).every(([colonne, condition]) => egal(row[colonne], condition))));
  app.prisma.relationFeatureSetting.findFirst = jest.fn(async (args: { where: { ownerId: string; otherId: string } }) => app.reglages.get(`${args.where.ownerId}:${args.where.otherId}`) ?? null);
  return app;
}

beforeEach(() => { cache.clear(); wakes.length = 0; freezeClock(NOW); });
afterEach(() => thawClock());

describe('le relevé par REST, puis l\'état servi au Sang', () => {
  it('le relevé range l\'épisode et le Sang le lit champ par champ ; une charge illisible est refusée', async () => {
    const app = avecSessions(await appli());
    expect((await app.call('POST', '/api/v1/me/device/battery', releve(18), MOI)).body).toEqual({ success: true, data: { tracked: true } });
    expect((await app.call('POST', '/api/v1/me/device/battery', { level: 900 }, MOI)).status).toBe(400);

    const lu = await app.call('GET', `/api/v1/relations/${MOI}/battery`, undefined, AUTRE);
    const tous = await app.call('GET', '/api/v1/relations/battery', undefined, AUTRE);
    await app.close();

    expect(lu.body.data.state).toEqual({ userId: MOI, phase: 'low', level: 18, charging: false, lowPower: false, measuredAt: NOW.toISOString(), deviceLabel: 'iPhone' });
    expect(tous.body.data.items).toEqual([lu.body.data.state]);
  });

  it('un Ami ne lit rien', async () => {
    const app = avecSessions(await appli({ liens: [lien('FRIEND', 'FRIEND')] }));
    await app.call('POST', '/api/v1/me/device/battery', releve(18), MOI);
    const lu = await app.call('GET', `/api/v1/relations/${MOI}/battery`, undefined, AUTRE);
    await app.close();
    expect(lu.body.data).toEqual({ state: null });
  });
});

describe('le relevé à la demande', () => {
  it('le Sang demande : le téléphone reçoit un réveil silencieux sans nom, puis 429 sous 5 min', async () => {
    const app = avecSessions(await appli());
    const premier = await app.call('POST', `/api/v1/relations/${MOI}/battery/pull`, {}, AUTRE);
    const second = await app.call('POST', `/api/v1/relations/${MOI}/battery/pull`, {}, AUTRE);
    await app.close();

    expect(premier.body).toEqual({ success: true, data: { requestedAt: NOW.toISOString() } });
    expect(app.emissions).toEqual([{ room: ROOMS.user(MOI), event: SERVER_EVENTS.BATTERY_PULL_REQUESTED, payload: { requestedAt: NOW.toISOString() } }]);
    expect(wakes).toEqual([expect.objectContaining({ userId: MOI, payload: { title: '', body: '', silent: true, data: { type: 'battery_pull', requestedAt: NOW.toISOString() } } })]);
    expect(JSON.stringify(wakes)).not.toContain(AUTRE);
    expect(second).toMatchObject({ status: 429, body: { code: 'BATTERY_PULL_TOO_SOON' } });
  });

  it('un Proche ne peut pas : 403', async () => {
    const app = avecSessions(await appli({ liens: [lien('CLOSE', 'CLOSE')], reglages: [{ ownerId: MOI, otherId: AUTRE, bringBlockedAt: null, batteryShared: true }] }));
    const res = await app.call('POST', `/api/v1/relations/${MOI}/battery/pull`, {}, AUTRE);
    await app.close();
    expect(res).toMatchObject({ status: 403, body: { code: 'BATTERY_PULL_FORBIDDEN' } });
  });
});

describe('les réglages', () => {
  it('par personne : retirer au Sang efface chez lui ; ce que je reçois s\'écrit', async () => {
    const app = avecSessions(await appli());
    await app.call('POST', '/api/v1/me/device/battery', releve(18), MOI);
    app.emissions.length = 0;

    const retire = await app.call('PUT', `/api/v1/relations/${AUTRE}/battery/settings`, { shared: false }, MOI);
    const recu = await app.call('PUT', `/api/v1/relations/${MOI}/battery/settings`, { receive: 'critical' }, AUTRE);
    const illisible = await app.call('PUT', `/api/v1/relations/${AUTRE}/battery/settings`, {}, MOI);
    await app.close();

    expect(retire.body.data).toEqual({ userId: AUTRE, shared: false, receive: 'all' });
    expect(app.emissions).toEqual([{ room: ROOMS.user(AUTRE), event: SERVER_EVENTS.BATTERY_CLEARED, payload: { userId: MOI } }]);
    expect(recu.body.data).toEqual({ userId: MOI, shared: true, receive: 'critical' });
    expect(illisible.status).toBe(400);
  });

  it('global : couper efface chez le Sang, et se relit', async () => {
    const app = avecSessions(await appli());
    await app.call('POST', '/api/v1/me/device/battery', releve(18), MOI);
    app.emissions.length = 0;
    app.prisma.user.update.mockImplementation(async (args: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(app.users.get(args.where.id)!, args.data));

    const coupe = await app.call('PUT', '/api/v1/me/device/battery/settings', { sharingEnabled: false }, MOI);
    const relu = await app.call('GET', '/api/v1/me/device/battery/settings', undefined, MOI);
    await app.close();

    expect(coupe.body.data).toEqual({ sharingEnabled: false });
    expect(relu.body.data).toEqual({ sharingEnabled: false });
    expect(app.emissions).toEqual([{ room: ROOMS.user(AUTRE), event: SERVER_EVENTS.BATTERY_CLEARED, payload: { userId: MOI } }]);
  });
});
