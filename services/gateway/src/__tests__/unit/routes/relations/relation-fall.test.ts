/**
 * « CHUTE DÉTECTÉE » par REST (#18748) — le rapport de l'iPhone, « Je vais bien », l'accord explicite
 * et son retrait, le rattrapage et le retrait par personne. Chaque réponse traverse le VRAI
 * sérialiseur : un champ servi est un champ déclaré, et rien d'autre ne sort.
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

const pushes: Array<{ userId: string; payload: { title: string; body: string; data?: Record<string, string> } }> = [];
jest.mock('../../../../services/PushNotificationService', () => ({
  getPushNotificationService: () => ({
    sendToUser: async (options: { userId: string; payload: { title: string; body: string } }) => {
      pushes.push(options);
      return [];
    },
  }),
}));

import { FALL_CONSENT_VERSION } from '@meeshy/shared/types/fall-detection';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { relationsRoutes } from '../../../../routes/relations';
import healthFallMeRoutes from '../../../../routes/me/health-fall';
import { freezeClock, thawClock } from '../../../helpers/relation-app';
import { AUTRE, MOI, NOW, buildBringApp, lien, type BringAppOptions, type BringTestApp } from '../../../helpers/bring-app';

const CHUTE = new Date(NOW.getTime() - 3 * 60_000 - 13_000);
const minute = (date: Date) => new Date(Math.floor(date.getTime() / 60_000) * 60_000).toISOString();

const appli = (options: BringAppOptions = { liens: [lien('BLOOD', 'BLOOD')] }): Promise<BringTestApp> =>
  buildBringApp(async (a) => {
    await a.register(relationsRoutes, { prefix: '/api/v1/relations' });
    await a.register(healthFallMeRoutes, { prefix: '/api/v1/me' });
  }, options);

function avecDoubles(app: BringTestApp, options: { readonly consenti?: boolean } = {}) {
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
  if (options.consenti !== false) Object.assign(app.users.get(MOI)!, { fallAlertConsentedAt: new Date('2026-11-01T00:00:00.000Z'), fallAlertConsentVersion: FALL_CONSENT_VERSION });
  return app;
}

beforeEach(() => { cache.clear(); pushes.length = 0; freezeClock(NOW); });
afterEach(() => thawClock());

describe('le rapport de l\'iPhone', () => {
  it('sans accord : 403 FALL_CONSENT_REQUIRED, rien n\'est servi ni poussé', async () => {
    const app = avecDoubles(await appli(), { consenti: false });
    const refus = await app.call('POST', '/api/v1/me/health/fall', { detectedAt: CHUTE.toISOString() }, MOI);
    const tous = await app.call('GET', '/api/v1/relations/falls', undefined, AUTRE);
    await app.close();
    expect(refus.status).toBe(403);
    expect(refus.body.code).toBe('FALL_CONSENT_REQUIRED');
    expect(tous.body.data).toEqual({ items: [] });
    expect(pushes).toEqual([]);
  });

  it('une autre donnée de santé, une chute trop vieille ou dans le futur : 400', async () => {
    const app = avecDoubles(await appli());
    const extra = await app.call('POST', '/api/v1/me/health/fall', { detectedAt: CHUTE.toISOString(), heartRate: 130 }, MOI);
    const vieille = await app.call('POST', '/api/v1/me/health/fall', { detectedAt: new Date(NOW.getTime() - 31 * 60_000).toISOString() }, MOI);
    const future = await app.call('POST', '/api/v1/me/health/fall', { detectedAt: new Date(NOW.getTime() + 3 * 60_000).toISOString() }, MOI);
    await app.close();
    expect(extra.status).toBe(400);
    expect([vieille.status, vieille.body.code]).toEqual([400, 'FALL_REPORT_TOO_OLD']);
    expect([future.status, future.body.code]).toEqual([400, 'FALL_REPORT_IN_FUTURE']);
  });

  it('avec accord : le Sang reçoit l\'état champ par champ et un push générique ; le rattrapage le sert', async () => {
    const app = avecDoubles(await appli());
    const ack = await app.call('POST', '/api/v1/me/health/fall', { detectedAt: CHUTE.toISOString() }, MOI);
    const encore = await app.call('POST', '/api/v1/me/health/fall', { detectedAt: CHUTE.toISOString() }, MOI);
    const tous = await app.call('GET', '/api/v1/relations/falls', undefined, AUTRE);
    await app.close();
    const etat = { userId: MOI, detectedAt: minute(CHUTE), expiresAt: new Date(Date.parse(minute(CHUTE)) + 360 * 60_000).toISOString() };
    expect(ack.body).toEqual({ success: true, data: { recorded: true } });
    expect(encore.body).toEqual({ success: true, data: { recorded: false } });
    expect(tous.body.data).toEqual({ items: [etat] });
    expect(app.emissions).toContainEqual({ room: ROOMS.user(AUTRE), event: SERVER_EVENTS.FALL_DETECTED, payload: { userId: MOI, state: etat, announcement: { kind: 'detected', at: minute(CHUTE) } } });
    expect(pushes.map((p) => [p.userId, p.payload.title])).toEqual([[AUTRE, '⚠️ Alerte de sécurité']]);
    expect(JSON.stringify(pushes.map((p) => [p.payload.title, p.payload.body]))).not.toMatch(/chute|fall|santé|health/i);
  });

  it('« Je vais bien » efface chez le Sang et lui dit qu\'on a répondu', async () => {
    const app = avecDoubles(await appli());
    await app.call('POST', '/api/v1/me/health/fall', { detectedAt: CHUTE.toISOString() }, MOI);
    const ok = await app.call('POST', '/api/v1/me/health/fall/ok', {}, MOI);
    const tous = await app.call('GET', '/api/v1/relations/falls', undefined, AUTRE);
    await app.close();
    expect(ok.body).toEqual({ success: true, data: { cleared: true } });
    expect(app.emissions).toContainEqual({ room: ROOMS.user(AUTRE), event: SERVER_EVENTS.FALL_CLEARED, payload: { userId: MOI, reason: 'responded' } });
    expect(pushes.at(-1)?.payload.body).toBe(`U${MOI.slice(-2)} a répondu`);
    expect(tous.body.data).toEqual({ items: [] });
  });
});

describe('l\'accord et les réglages', () => {
  it('rien par défaut ; l\'accord se donne sur la version courante, se lit, puis se retire en effaçant l\'épisode', async () => {
    const app = avecDoubles(await appli(), { consenti: false });
    const avant = await app.call('GET', '/api/v1/me/health/fall/settings', undefined, MOI);
    const perime = await app.call('PUT', '/api/v1/me/health/fall/settings', { consented: true, version: '2000-01-01' }, MOI);
    const accord = await app.call('PUT', '/api/v1/me/health/fall/settings', { consented: true, version: FALL_CONSENT_VERSION }, MOI);
    await app.call('POST', '/api/v1/me/health/fall', { detectedAt: CHUTE.toISOString() }, MOI);
    const retrait = await app.call('PUT', '/api/v1/me/health/fall/settings', { consented: false }, MOI);
    const tous = await app.call('GET', '/api/v1/relations/falls', undefined, AUTRE);
    const apres = await app.call('POST', '/api/v1/me/health/fall', { detectedAt: CHUTE.toISOString() }, MOI);
    await app.close();
    expect(avant.body.data).toEqual({ consentedAt: null, consentVersion: null, currentVersion: FALL_CONSENT_VERSION });
    expect([perime.status, perime.body.code]).toEqual([400, 'FALL_CONSENT_VERSION_STALE']);
    expect(accord.body.data).toEqual({ consentedAt: NOW.toISOString(), consentVersion: FALL_CONSENT_VERSION, currentVersion: FALL_CONSENT_VERSION });
    expect(retrait.body.data).toEqual({ consentedAt: null, consentVersion: null, currentVersion: FALL_CONSENT_VERSION });
    expect(app.emissions).toContainEqual({ room: ROOMS.user(AUTRE), event: SERVER_EVENTS.FALL_CLEARED, payload: { userId: MOI, reason: 'withdrawn' } });
    expect(tous.body.data).toEqual({ items: [] });
    expect(apres.status).toBe(403);
  });

  it('un compte de moins de 15 ans déclarés ne peut pas donner l\'accord (403 FALL_CONSENT_MINOR)', async () => {
    const app = avecDoubles(await appli({ liens: [lien('BLOOD', 'BLOOD')], personnes: { [MOI]: { birthDate: new Date(Date.UTC(NOW.getUTCFullYear() - 14, 0, 1)) } } }), { consenti: false });
    const refus = await app.call('PUT', '/api/v1/me/health/fall/settings', { consented: true, version: FALL_CONSENT_VERSION }, MOI);
    await app.close();
    expect([refus.status, refus.body.code]).toEqual([403, 'FALL_CONSENT_MINOR']);
    expect(app.users.get(MOI)?.fallAlertConsentedAt ?? null).toBeNull();
  });

  it('un retrait par personne efface la chute chez ce Sang ; Sang accordé par défaut une fois l\'accord donné', async () => {
    const app = avecDoubles(await appli());
    const lu = await app.call('GET', `/api/v1/relations/${AUTRE}/fall/settings`, undefined, MOI);
    await app.call('POST', '/api/v1/me/health/fall', { detectedAt: CHUTE.toISOString() }, MOI);
    const retrait = await app.call('PUT', `/api/v1/relations/${AUTRE}/fall/settings`, { shared: false }, MOI);
    await app.close();
    expect(lu.body.data).toEqual({ userId: AUTRE, shared: true });
    expect(retrait.body.data).toEqual({ userId: AUTRE, shared: false });
    expect(app.emissions).toContainEqual({ room: ROOMS.user(AUTRE), event: SERVER_EVENTS.FALL_CLEARED, payload: { userId: MOI, reason: 'withdrawn' } });
  });

  it('sans accord global, le réglage par personne lit « non partagé »', async () => {
    const app = avecDoubles(await appli(), { consenti: false });
    const lu = await app.call('GET', `/api/v1/relations/${AUTRE}/fall/settings`, undefined, MOI);
    await app.close();
    expect(lu.body.data).toEqual({ userId: AUTRE, shared: false });
  });
});
