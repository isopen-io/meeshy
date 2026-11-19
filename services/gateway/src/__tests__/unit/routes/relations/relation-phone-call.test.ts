/**
 * « EN APPEL » par REST (#18753) — le rattrapage des appels en cours, le rapport du téléphone et les
 * réglages. Chaque réponse traverse le VRAI sérialiseur : un champ servi est un champ
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
import deviceCallMeRoutes from '../../../../routes/me/device-call';
import { storePhoneCall } from '../../../../services/phoneCall/phoneCallStore';
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

const DEBUT = new Date(NOW.getTime() - 12 * 60_000 - 13_000);

const appli = (options: BringAppOptions = { liens: [lien('BLOOD', 'BLOOD')] }): Promise<BringTestApp> =>
  buildBringApp(async (a) => {
    await a.register(relationsRoutes, { prefix: '/api/v1/relations' });
    await a.register(deviceCallMeRoutes, { prefix: '/api/v1/me' });
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

const enAppel = (servedTo: readonly string[] = [AUTRE]) =>
  storePhoneCall(memoire, MOI, { since: DEBUT.toISOString(), reportedAt: NOW.toISOString(), servedTo });

const arrondi = (date: Date) => new Date(Math.floor(date.getTime() / 300_000) * 300_000).toISOString();

beforeEach(() => { cache.clear(); sets.clear(); freezeClock(NOW); });
afterEach(() => thawClock());

describe('le rattrapage', () => {
  it('le Sang lit l\'appel en cours champ par champ : début arrondi, expiration, rien d\'autre', async () => {
    const app = avecSessions(await appli());
    await enAppel();
    const tous = await app.call('GET', '/api/v1/relations/phone-calls', undefined, AUTRE);
    await app.close();
    expect(tous.body.data).toEqual({ items: [{ userId: MOI, since: arrondi(DEBUT), expiresAt: new Date(Math.ceil(NOW.getTime() / 300_000) * 300_000 + 180 * 60_000).toISOString() }] });
  });

  it('un Proche ne lit rien', async () => {
    const app = avecSessions(await appli({ liens: [lien('CLOSE', 'CLOSE')] }));
    await enAppel();
    const tous = await app.call('GET', '/api/v1/relations/phone-calls', undefined, AUTRE);
    await app.close();
    expect(tous.body.data).toEqual({ items: [] });
  });

  it('deux comptes de l\'équipe sans lien se partagent « en appel » comme des Sangs (#16623)', async () => {
    const app = avecSessions(await appli({ liens: [], personnes: { [MOI]: { role: 'ANALYST' }, [AUTRE]: { role: 'ADMIN' } } }));
    const vers = await app.call('GET', `/api/v1/relations/${AUTRE}/phone-call/settings`, undefined, MOI);
    await app.close();
    expect(vers.body.data).toEqual({ userId: AUTRE, shared: true });
  });
});

describe('le rapport du téléphone', () => {
  it('un appareil qui n\'est pas le téléphone suivi n\'est pas suivi ; un interlocuteur est refusé', async () => {
    const app = avecSessions(await appli());
    const ack = await app.call('POST', '/api/v1/me/device/call', { active: true }, MOI);
    const refus = await app.call('POST', '/api/v1/me/device/call', { active: true, with: '+33600000000' }, MOI);
    await app.close();
    expect(ack.body).toEqual({ success: true, data: { tracked: false } });
    expect(refus.status).toBe(400);
  });
});

describe('les réglages', () => {
  it('couper pour tous efface l\'appel chez le Sang et ne sert plus rien', async () => {
    const app = avecSessions(await appli());
    await enAppel();
    const lu = await app.call('GET', '/api/v1/me/device/call/settings', undefined, MOI);
    const coupe = await app.call('PUT', '/api/v1/me/device/call/settings', { sharingEnabled: false }, MOI);
    const tous = await app.call('GET', '/api/v1/relations/phone-calls', undefined, AUTRE);
    await app.close();
    expect(lu.body.data).toEqual({ sharingEnabled: true });
    expect(coupe.body.data).toEqual({ sharingEnabled: false });
    expect(app.emissions).toContainEqual({ room: ROOMS.user(AUTRE), event: SERVER_EVENTS.PHONE_CALL_ENDED, payload: { userId: MOI } });
    expect(tous.body.data).toEqual({ items: [] });
  });

  it('un retrait par personne efface l\'appel chez ce Sang', async () => {
    const app = avecSessions(await appli());
    await enAppel();
    const retrait = await app.call('PUT', `/api/v1/relations/${AUTRE}/phone-call/settings`, { shared: false }, MOI);
    await app.close();
    expect(retrait.body.data).toEqual({ userId: AUTRE, shared: false });
    expect(app.emissions).toContainEqual({ room: ROOMS.user(AUTRE), event: SERVER_EVENTS.PHONE_CALL_ENDED, payload: { userId: MOI } });
  });
});
