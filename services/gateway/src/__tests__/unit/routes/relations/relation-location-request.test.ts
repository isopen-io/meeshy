/**
 * LA DEMANDE DE PARTAGE PAR REST (#19204) — `POST /relations/:userId/location/request`
 * `{ kind: 'extend' | 'reask' }`. Dès Ami ; plafonnée à une par paire et par fenêtre ; la
 * réponse traverse le VRAI sérialiseur : rien d'autre que `requestedAt` ne sort.
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
    getNativeClient: () => null,
  }),
}));

import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { relationsRoutes } from '../../../../routes/relations';
import { freezeClock, thawClock } from '../../../helpers/relation-app';
import { AUTRE, MOI, NOW, TIERS, buildBringApp, lien, type BringAppOptions, type BringTestApp } from '../../../helpers/bring-app';

const appli = (options: BringAppOptions = { liens: [lien('FRIEND', 'FRIEND')] }): Promise<BringTestApp> =>
  buildBringApp(async (a) => {
    await a.register(relationsRoutes, { prefix: '/api/v1/relations' });
  }, options);

beforeEach(() => { cache.clear(); freezeClock(NOW); });
afterEach(() => thawClock());

describe('demander à prolonger ou redemander un partage (#19204)', () => {
  it('un Ami demande : 200 avec la seule date, l\'émetteur reçoit l\'événement sans coordonnée, puis 429 dans la fenêtre', async () => {
    const app = await appli();
    const premier = await app.call('POST', `/api/v1/relations/${MOI}/location/request`, { kind: 'extend' }, AUTRE);
    const second = await app.call('POST', `/api/v1/relations/${MOI}/location/request`, { kind: 'reask' }, AUTRE);
    await app.close();

    expect(premier).toEqual({ status: 200, body: { success: true, data: { requestedAt: NOW.toISOString() } } });
    expect(app.emissions).toEqual([
      { room: ROOMS.user(MOI), event: SERVER_EVENTS.SHARED_LOCATION_REQUESTED, payload: { userId: AUTRE, kind: 'extend', requestedAt: NOW.toISOString() } },
    ]);
    expect(second).toMatchObject({ status: 429, body: { code: 'SHARED_LOCATION_REQUEST_TOO_SOON' } });
  });

  it('une Connaissance ne peut pas : 403, et rien ne part', async () => {
    const app = await appli({ liens: [lien('ACQUAINTANCE', 'ACQUAINTANCE')] });
    const res = await app.call('POST', `/api/v1/relations/${MOI}/location/request`, { kind: 'reask' }, AUTRE);
    await app.close();

    expect(res).toMatchObject({ status: 403, body: { code: 'SHARED_LOCATION_REQUEST_FORBIDDEN' } });
    expect(app.emissions).toEqual([]);
  });

  it('une charge illisible : 400 ; une personne sans lien : 403', async () => {
    const app = await appli();
    const illisible = await app.call('POST', `/api/v1/relations/${MOI}/location/request`, { kind: 'now' }, AUTRE);
    const sansLien = await app.call('POST', `/api/v1/relations/${MOI}/location/request`, { kind: 'extend' }, TIERS);
    await app.close();

    expect(illisible.status).toBe(400);
    expect(sansLien.status).toBe(403);
  });
});
