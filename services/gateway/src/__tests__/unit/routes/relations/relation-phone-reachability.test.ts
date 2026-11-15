/**
 * LE TÉLÉPHONE INJOIGNABLE par REST (#18737) — l'état servi à un lecteur, le rattrapage, le signe
 * de vie et les réglages. Chaque réponse traverse le VRAI sérialiseur : un champ servi est un champ
 * déclaré, et rien d'autre ne sort.
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
const sets = new Map<string, Set<string>>();
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

import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { relationsRoutes } from '../../../../routes/relations';
import deviceReachabilityMeRoutes from '../../../../routes/me/device-reachability';
import { storeReachability } from '../../../../services/phoneReachability/phoneReachabilityStore';
import { freezeClock, thawClock } from '../../../helpers/relation-app';
import { AUTRE, MOI, NOW, buildBringApp, lien, type BringAppOptions, type BringTestApp } from '../../../helpers/bring-app';

const memoire = {
  get: async (key: string) => cache.get(key) ?? null,
  set: async (key: string, value: string) => { cache.set(key, value); },
  del: async (key: string) => { cache.delete(key); },
  setnx: async () => true,
  addMember: async (key: string, member: string) => { sets.set(key, new Set([...(sets.get(key) ?? []), member])); },
  removeMember: async (key: string, member: string) => { sets.get(key)?.delete(member); },
  members: async (key: string) => [...(sets.get(key) ?? [])],
};

const DEPUIS = '2026-11-15T13:40:00.000Z';

const appli = (options: BringAppOptions = { liens: [lien('BLOOD', 'BLOOD')] }): Promise<BringTestApp> =>
  buildBringApp(async (a) => {
    await a.register(relationsRoutes, { prefix: '/api/v1/relations' });
    await a.register(deviceReachabilityMeRoutes, { prefix: '/api/v1/me' });
  }, options);

function avecSessions(app: BringTestApp) {
  app.prisma.userSession = { findMany: jest.fn(async () => []) };
  app.prisma.conversation = { findMany: jest.fn(async () => []) };
  const egal = (value: unknown, condition: unknown) =>
    condition !== null && typeof condition === 'object' && 'in' in condition ? (condition as { in: unknown[] }).in.includes(value) : value === condition;
  app.prisma.relationFeatureSetting.findMany = jest.fn(async (args: { where: Record<string, unknown> }) =>
    [...app.reglages.values()].filter((row) => Object.entries(args.where).every(([colonne, condition]) => egal(row[colonne], condition))));
  app.prisma.user.update = jest.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
    const user = app.users.get(args.where.id)!;
    Object.assign(user, args.data);
    return user;
  });
  return app;
}

const injoignable = (servedTo: readonly string[] = [AUTRE]) =>
  storeReachability(memoire, MOI, {
    lastSeenAt: DEPUIS,
    probesSent: 2,
    lastProbeAt: DEPUIS,
    lastAnsweredAt: null,
    unreachableSince: DEPUIS,
    cause: 'network',
    servedTo,
  });

beforeEach(() => { cache.clear(); sets.clear(); freezeClock(NOW); });
afterEach(() => thawClock());

describe('l\'état servi', () => {
  it('le Sang lit l\'état champ par champ, et le retrouve au rattrapage', async () => {
    const app = avecSessions(await appli());
    await injoignable();
    const lu = await app.call('GET', `/api/v1/relations/${MOI}/phone-reachability`, undefined, AUTRE);
    const tous = await app.call('GET', '/api/v1/relations/phone-reachability', undefined, AUTRE);
    await app.close();
    expect(lu.body.data).toEqual({ state: { userId: MOI, unreachableSince: DEPUIS, cause: 'network' } });
    expect(tous.body.data.items).toEqual([lu.body.data.state]);
  });

  it('un Ami ne lit rien, pas même au rattrapage', async () => {
    const app = avecSessions(await appli({ liens: [lien('FRIEND', 'FRIEND')] }));
    await injoignable();
    const lu = await app.call('GET', `/api/v1/relations/${MOI}/phone-reachability`, undefined, AUTRE);
    const tous = await app.call('GET', '/api/v1/relations/phone-reachability', undefined, AUTRE);
    await app.close();
    expect(lu.body.data).toEqual({ state: null });
    expect(tous.body.data).toEqual({ items: [] });
  });

  it('deux comptes de l\'équipe sans lien se lisent comme des Sangs (#16623)', async () => {
    const app = avecSessions(await appli({ liens: [], personnes: { [MOI]: { role: 'ADMIN' }, [AUTRE]: { role: 'ANALYST' } } }));
    await injoignable();
    const lu = await app.call('GET', `/api/v1/relations/${MOI}/phone-reachability`, undefined, AUTRE);
    await app.close();
    expect(lu.body.data.state).toMatchObject({ userId: MOI, cause: 'network' });
  });
});

describe('le signe de vie', () => {
  it('un appareil qui n\'est pas le téléphone suivi n\'est pas suivi', async () => {
    const app = avecSessions(await appli());
    const ack = await app.call('POST', '/api/v1/me/device/alive', undefined, MOI);
    await app.close();
    expect(ack.body).toEqual({ success: true, data: { tracked: false } });
  });
});

describe('les réglages', () => {
  it('un Proche ne reçoit rien sans accord ; l\'accord le lui sert tout de suite', async () => {
    const app = avecSessions(await appli({ liens: [lien('CLOSE', 'CLOSE')] }));
    await injoignable([]);
    const avant = await app.call('GET', `/api/v1/relations/${AUTRE}/phone-reachability/settings`, undefined, MOI);
    const apres = await app.call('PUT', `/api/v1/relations/${AUTRE}/phone-reachability/settings`, { shared: true }, MOI);
    const refus = await app.call('PUT', `/api/v1/relations/${AUTRE}/phone-reachability/settings`, { shared: true, extra: 1 }, MOI);
    await app.close();
    expect(avant.body.data).toEqual({ userId: AUTRE, shared: false });
    expect(apres.body.data).toEqual({ userId: AUTRE, shared: true });
    expect(refus.status).toBe(400);
    expect(app.emissions).toContainEqual({
      room: ROOMS.user(AUTRE),
      event: SERVER_EVENTS.PHONE_UNREACHABLE,
      payload: { userId: MOI, state: { userId: MOI, unreachableSince: DEPUIS, cause: 'network' } },
    });
  });

  it('le fantôme efface l\'état chez le Sang et ne sert plus rien', async () => {
    const app = avecSessions(await appli());
    await injoignable();
    const lu = await app.call('GET', '/api/v1/me/device/reachability/settings', undefined, MOI);
    const coupe = await app.call('PUT', '/api/v1/me/device/reachability/settings', { sharingEnabled: false }, MOI);
    const tous = await app.call('GET', '/api/v1/relations/phone-reachability', undefined, AUTRE);
    await app.close();
    expect(lu.body.data).toEqual({ sharingEnabled: true });
    expect(coupe.body.data).toEqual({ sharingEnabled: false });
    expect(app.emissions).toContainEqual({ room: ROOMS.user(AUTRE), event: SERVER_EVENTS.PHONE_REACHABLE, payload: { userId: MOI } });
    expect(tous.body.data).toEqual({ items: [] });
  });
});
