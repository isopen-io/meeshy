/**
 * #13100 — le début d'une panne du verrou de scellement se garde dans MONGO,
 * pas dans le Redis en panne : il survit à un redémarrage de la passerelle
 * PENDANT la panne (sixième audit adversarial), et seuls les débuts
 * antérieurs à ce que le balayage a rattrapé s'oublient.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

import type { DeferralStore } from '../atRest/sealingDeferral';

const HOUR = 60 * 60 * 1000;
const now = new Date('2026-10-26T12:00:00Z');

/** Une table `AtRestSealingDeferral` en mémoire, partagée entre deux « vies » du processus. */
function mongoTable(): DeferralStore & { rows: Date[] } {
  const rows: Date[] = [];
  return {
    rows,
    record: async (since) => { rows.push(since); },
    earliest: async () => (rows.length === 0 ? null : new Date(Math.min(...rows.map((d) => d.getTime())))),
    forget: async (upTo) => { rows.splice(0, rows.length, ...rows.filter((d) => d > upTo)); },
  };
}

type DeferralModule = typeof import('../atRest/sealingDeferral');
const freshProcess = (): DeferralModule => {
  const holder: { module?: DeferralModule } = {};
  jest.isolateModules(() => { holder.module = jest.requireActual<DeferralModule>('../atRest/sealingDeferral'); });
  return holder.module as DeferralModule;
};
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('le début d’une panne du verrou', () => {
  it('survit à un redémarrage PENDANT la panne : Mongo s’en souvient, Redis n’y est pour rien', async () => {
    const table = mongoTable();
    const outage = new Date(now.getTime() - 72 * HOUR);
    const before = freshProcess();
    before.configureSealingDeferralStore(table);
    before.noteSealingDeferred(outage);
    await flush();

    const after = freshProcess();
    after.configureSealingDeferralStore(table);
    expect(await after.rememberedDeferral()).toEqual(outage);
  });

  it('une inscription ratée se rejoue au balayage suivant', async () => {
    const table = mongoTable();
    const flaky = { ...table, record: jest.fn<DeferralStore['record']>().mockRejectedValueOnce(new Error('mongo')).mockImplementation(table.record) };
    const proc = freshProcess();
    proc.configureSealingDeferralStore(flaky);
    const outage = new Date(now.getTime() - 5 * HOUR);
    proc.noteSealingDeferred(outage);
    await flush();
    expect(table.rows).toEqual([]);
    expect(await proc.rememberedDeferral()).toEqual(outage);
    expect(table.rows).toEqual([outage]);
  });

  it('le rattrapage n’oublie que les débuts antérieurs : celui d’une autre instance, plus récent, survit', async () => {
    const table = mongoTable();
    const proc = freshProcess();
    proc.configureSealingDeferralStore(table);
    proc.noteSealingDeferred(new Date(now.getTime() - 3 * HOUR));
    await flush();
    table.rows.push(new Date(now.getTime() + HOUR));
    await proc.forgetDeferral(now);
    expect(table.rows).toEqual([new Date(now.getTime() + HOUR)]);
    expect(await proc.rememberedDeferral()).toEqual(new Date(now.getTime() + HOUR));
  });
});
