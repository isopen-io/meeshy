/**
 * Les réglages par personne (`/relations/:userId/settings`) : `bringBlocked` (#13936)
 * et `talkieBlocked` (#13935), des préférences de RÉCEPTION actives par défaut,
 * écrites PARTIELLEMENT ; couper le talkie de quelqu'un coupe sa voix en vol.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

const cache = new Map<string, { value: string; expiresAt: number }>();
jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({
    get: async (key: string) => {
      const hit = cache.get(key);
      return hit && hit.expiresAt > Date.now() ? hit.value : null;
    },
    set: async (key: string, value: string, ttl = 3600) => { cache.set(key, { value, expiresAt: Date.now() + ttl * 1000 }); },
    setnx: async (key: string, value: string, ttl = 3600) => {
      const hit = cache.get(key);
      if (hit && hit.expiresAt > Date.now()) return false;
      cache.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
      return true;
    },
    del: async (key: string) => { cache.delete(key); },
  }),
}));

jest.mock('../../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn(async (args: { op: () => Promise<unknown> }) => args.op()),
}));

const pushes: Array<Record<string, any>> = [];
jest.mock('../../../../services/PushNotificationService', () => ({
  getPushNotificationService: () => ({
    sendToUser: async (options: Record<string, unknown>) => { pushes.push(options); return []; },
  }),
}));

import { relationsRoutes } from '../../../../routes/relations';
import { freezeClock, thawClock } from '../../../helpers/relation-app';
import { AUTRE, MOI, NOW, buildBringApp, lien, type BringAppOptions, type BringTestApp } from '../../../helpers/bring-app';

const appli = (options: BringAppOptions = { liens: [lien('CLOSE', 'CLOSE')] }): Promise<BringTestApp> =>
  buildBringApp(async (a) => { await a.register(relationsRoutes, { prefix: '/api/v1/relations' }); }, options);

const regler = (app: BringTestApp, body: unknown) => app.call('PUT', `/api/v1/relations/${MOI}/settings`, body, AUTRE);
const lire = (app: BringTestApp) => app.call('GET', `/api/v1/relations/${MOI}/settings`, undefined, AUTRE);

beforeEach(() => { cache.clear(); pushes.length = 0; freezeClock(NOW); });
afterEach(() => thawClock());

describe('#13935 — talkieBlocked', () => {
  it('par défaut, rien n’est coupé', async () => {
    const app = await appli();
    const res = await lire(app);
    await app.close();

    expect(res.body.data).toEqual({ userId: MOI, bringBlocked: false, talkieBlocked: false });
  });

  it('se coupe et se relit, sans toucher au Bring', async () => {
    const app = await appli();
    await regler(app, { bringBlocked: true });
    const pose = await regler(app, { talkieBlocked: true });
    const relu = await lire(app);
    await app.close();

    expect(pose.body.data).toEqual({ userId: MOI, bringBlocked: true, talkieBlocked: true });
    expect(relu.body.data).toEqual(pose.body.data);
    expect(app.reglages.get(`${AUTRE}:${MOI}`)).toMatchObject({ bringBlockedAt: NOW, talkieBlockedAt: NOW });
  });

  it('se rouvre', async () => {
    const app = await appli();
    await regler(app, { talkieBlocked: true });
    const rouvert = await regler(app, { talkieBlocked: false });
    await app.close();

    expect(rouvert.body.data.talkieBlocked).toBe(false);
  });

  it('couper le talkie de X pose sa coupure : sa voix en vol s’arrête au fragment suivant, sur toute instance', async () => {
    const app = await appli();
    await regler(app, { talkieBlocked: true });
    await app.close();

    expect(cache.get(`talkie:cut:${MOI}:${AUTRE}`)?.value).toBe(String(NOW.getTime()));
    expect(cache.has(`talkie:cut:${AUTRE}:${MOI}`)).toBe(false);
  });

  it('un corps vide ou un réglage inconnu : 400', async () => {
    const app = await appli();
    const vide = await regler(app, {});
    const inconnu = await regler(app, { talkieBlocked: true, ghost: true });
    await app.close();

    expect(vide.status).toBe(400);
    expect(inconnu.status).toBe(400);
    expect(app.reglages.size).toBe(0);
  });
});
