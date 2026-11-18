/**
 * LA VÉRIFICATION D'INACTIVITÉ par REST (#18738) — le rattrapage des alertes, « Je vais bien » et
 * les réglages. Chaque réponse traverse le VRAI sérialiseur : un champ servi est un champ
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
import wellnessMeRoutes from '../../../../routes/me/wellness';
import { storeInactivity } from '../../../../services/inactivityCheck/inactivityStore';
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

const DEPUIS = new Date(NOW.getTime() - 13 * 3_600_000).toISOString();
const ALERTE = new Date(NOW.getTime() - 30 * 60_000).toISOString();

const appli = (options: BringAppOptions = { liens: [lien('BLOOD', 'BLOOD')] }): Promise<BringTestApp> =>
  buildBringApp(async (a) => {
    await a.register(relationsRoutes, { prefix: '/api/v1/relations' });
    await a.register(wellnessMeRoutes, { prefix: '/api/v1/me' });
  }, options);

function avecSessions(app: BringTestApp) {
  app.prisma.userSession = { findMany: jest.fn(async () => []) };
  app.prisma.conversation = { findMany: jest.fn(async () => []) };
  app.prisma.bloodLocationPoint = { findMany: jest.fn(async () => []) };
  app.prisma.notification = { findRaw: jest.fn(async () => []), deleteMany: jest.fn(async () => ({ count: 0 })) };
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

const alerte = (alertedTo: readonly string[] = [AUTRE]) =>
  storeInactivity(memoire, MOI, { lastActivityAt: DEPUIS, phase: 'alerted', askedAt: new Date(NOW.getTime() - 60 * 60_000).toISOString(), alertedAt: ALERTE, alertedTo });

beforeEach(() => { cache.clear(); sets.clear(); freezeClock(NOW); });
afterEach(() => thawClock());

describe('le rattrapage', () => {
  it('le Sang retrouve l\'alerte en cours, champ par champ', async () => {
    const app = avecSessions(await appli());
    await alerte();
    const tous = await app.call('GET', '/api/v1/relations/inactivity', undefined, AUTRE);
    await app.close();
    expect(tous.body.data).toEqual({ items: [{ userId: MOI, inactiveSince: DEPUIS, alertedAt: ALERTE }] });
  });

  it('un Proche ne lit rien', async () => {
    const app = avecSessions(await appli({ liens: [lien('CLOSE', 'CLOSE')] }));
    await alerte();
    const tous = await app.call('GET', '/api/v1/relations/inactivity', undefined, AUTRE);
    await app.close();
    expect(tous.body.data).toEqual({ items: [] });
  });

  it('deux comptes de l\'équipe sans lien se lisent comme des Sangs (#16623)', async () => {
    const app = avecSessions(await appli({ liens: [], personnes: { [MOI]: { role: 'ANALYST' }, [AUTRE]: { role: 'ADMIN' } } }));
    const vers = await app.call('GET', `/api/v1/relations/${AUTRE}/inactivity/settings`, undefined, MOI);
    await app.close();
    expect(vers.body.data).toEqual({ userId: AUTRE, shared: true });
  });
});

describe('« Je vais bien »', () => {
  it('répond depuis n\'importe quel appareil et annonce le retour au Sang prévenu', async () => {
    const app = avecSessions(await appli());
    await alerte();
    const ack = await app.call('POST', '/api/v1/me/wellness/ok', undefined, MOI);
    const tous = await app.call('GET', '/api/v1/relations/inactivity', undefined, AUTRE);
    await app.close();
    expect(ack.body).toEqual({ success: true, data: { tracked: true } });
    expect(app.emissions).toContainEqual({
      room: ROOMS.user(AUTRE),
      event: SERVER_EVENTS.INACTIVITY_CLEARED,
      payload: { userId: MOI, announcement: { kind: 'responded', inactiveSince: DEPUIS, at: NOW.toISOString() } },
    });
    expect(tous.body.data).toEqual({ items: [] });
  });
});

describe('les réglages', () => {
  it('le délai se lit, se choisit et se refuse hors liste', async () => {
    const app = avecSessions(await appli());
    const lu = await app.call('GET', '/api/v1/me/wellness/settings', undefined, MOI);
    const six = await app.call('PUT', '/api/v1/me/wellness/settings', { delayHours: 6 }, MOI);
    const refus = await app.call('PUT', '/api/v1/me/wellness/settings', { delayHours: 3 }, MOI);
    await app.close();
    expect(lu.body.data).toEqual({ delayHours: 12 });
    expect(six.body.data).toEqual({ delayHours: 6 });
    expect(refus.status).toBe(400);
  });

  it('couper efface l\'alerte chez le Sang et ne sert plus rien', async () => {
    const app = avecSessions(await appli());
    await alerte();
    const coupe = await app.call('PUT', '/api/v1/me/wellness/settings', { delayHours: null }, MOI);
    const tous = await app.call('GET', '/api/v1/relations/inactivity', undefined, AUTRE);
    await app.close();
    expect(coupe.body.data).toEqual({ delayHours: null });
    expect(app.emissions).toContainEqual({ room: ROOMS.user(AUTRE), event: SERVER_EVENTS.INACTIVITY_CLEARED, payload: { userId: MOI } });
    expect(tous.body.data).toEqual({ items: [] });
  });

  it('un retrait par personne efface l\'alerte chez ce Sang', async () => {
    const app = avecSessions(await appli());
    await alerte();
    const avant = await app.call('GET', `/api/v1/relations/${AUTRE}/inactivity/settings`, undefined, MOI);
    const retrait = await app.call('PUT', `/api/v1/relations/${AUTRE}/inactivity/settings`, { shared: false }, MOI);
    await app.close();
    expect(avant.body.data).toEqual({ userId: AUTRE, shared: true });
    expect(retrait.body.data).toEqual({ userId: AUTRE, shared: false });
    expect(app.emissions).toContainEqual({ room: ROOMS.user(AUTRE), event: SERVER_EVENTS.INACTIVITY_CLEARED, payload: { userId: MOI } });
  });
});
