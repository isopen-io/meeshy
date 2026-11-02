/**
 * #13100 — septième audit adversarial : redémarrage PENDANT une panne Redis (Mongo joignable) : le
 * début de la panne survit, et un début posé par une autre instance PENDANT le
 * rattrapage survit à l'oubli. Deux « processus » = deux instances du module.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

type Mod = typeof import('../atRest/sealingDeferral');
const fresh = (): Mod => { let m: Mod | null = null; jest.isolateModules(() => { m = require('../atRest/sealingDeferral'); }); return m!; };
const flush = () => new Promise((r) => setImmediate(r));

describe('début de panne du verrou dans Mongo', () => {
  it('survit au redémarrage, et un début plus récent survit à l’oubli', async () => {
    const rows: Date[] = [];
    const store = {
      record: async (since: Date) => { rows.push(since); },
      earliest: async () => (rows.length ? new Date(Math.min(...rows.map((d) => d.getTime()))) : null),
      forget: async (upTo: Date) => { for (let i = rows.length - 1; i >= 0; i -= 1) if (rows[i] <= upTo) rows.splice(i, 1); },
    };
    const outage = new Date('2026-10-23T12:00:00Z');
    const before = fresh();
    before.configureSealingDeferralStore(store);
    before.noteSealingDeferred(outage);
    await flush();
    const after = fresh();
    after.configureSealingDeferralStore(store);
    expect(await after.rememberedDeferral()).toEqual(outage);

    const other = fresh();
    other.configureSealingDeferralStore(store);
    const sweepStart = new Date('2026-10-26T12:00:00Z');
    other.noteSealingDeferred(new Date('2026-10-26T12:00:05Z'));
    await flush();
    await after.forgetDeferral(sweepStart);
    expect(await after.rememberedDeferral()).toEqual(new Date('2026-10-26T12:00:05Z'));
  });

  it('Mongo injoignable à l’instant de la panne : l’inscription se rejoue au balayage suivant', async () => {
    const rows: Date[] = [];
    const state = { down: true };
    const store = {
      record: async (since: Date) => { if (state.down) throw new Error('mongo down'); rows.push(since); },
      earliest: async () => (rows[0] ?? null),
      forget: async () => undefined,
    };
    const mod = fresh();
    mod.configureSealingDeferralStore(store);
    const outage = new Date('2026-10-23T12:00:00Z');
    mod.noteSealingDeferred(outage);
    await flush();
    expect(rows).toEqual([]);
    state.down = false;
    expect(await mod.rememberedDeferral()).toEqual(outage);
    expect(rows).toEqual([outage]);
  });
});
