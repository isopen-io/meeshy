/**
 * LES JOBS DU JEU (#9384, #9390) — la passe des ligues ne se chevauche pas et
 * survit à un échec ; le nocturne ne calcule qu'une fois par jour UTC, après 3 h,
 * et un des deux calculs qui échoue ne retient pas l'autre.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { GameLeagueJob } from '../../../jobs/game-league';
import { GameNightlyJob } from '../../../jobs/game-nightly';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const report = { snapshots: 0, settled: 0, placed: 0, purged: 0 };

describe('GameLeagueJob', () => {
  it('lance runDue une fois par passage et rend son rapport', async () => {
    const runDue = jest.fn<() => Promise<typeof report>>().mockResolvedValue(report);
    const job = new GameLeagueJob({} as never, { runDue } as never, { expireOld: jest.fn<() => Promise<number>>().mockResolvedValue(0) } as never);
    expect(await job.runNow()).toEqual(report);
    expect(runDue).toHaveBeenCalledTimes(1);
  });

  it('clôt aussi les duos des semaines révolues, et son échec ne retient pas le passage', async () => {
    const runDue = jest.fn<() => Promise<typeof report>>().mockResolvedValue(report);
    const expireOld = jest.fn<() => Promise<number>>().mockRejectedValue(new Error('down'));
    const job = new GameLeagueJob({} as never, { runDue } as never, { expireOld } as never);
    expect(await job.runNow()).toEqual(report);
    expect(expireOld).toHaveBeenCalledTimes(1);
  });

  it('ne se chevauche pas : un passage en cours fait refuser le suivant', async () => {
    let release: (value: typeof report) => void = () => undefined;
    const runDue = jest.fn<() => Promise<typeof report>>().mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const job = new GameLeagueJob({} as never, { runDue } as never, { expireOld: jest.fn<() => Promise<number>>().mockResolvedValue(0) } as never);

    const first = job.runNow();
    expect(await job.runNow()).toBeNull();
    release(report);
    await first;
    expect(runDue).toHaveBeenCalledTimes(1);
  });

  it('un échec est avalé, et le passage suivant a lieu', async () => {
    const runDue = jest.fn<() => Promise<typeof report>>().mockRejectedValueOnce(new Error('down')).mockResolvedValue(report);
    const job = new GameLeagueJob({} as never, { runDue } as never, { expireOld: jest.fn<() => Promise<number>>().mockResolvedValue(0) } as never);
    expect(await job.runNow()).toBeNull();
    expect(await job.runNow()).toEqual(report);
  });

  it('start arme un intervalle, stop le coupe', () => {
    jest.useFakeTimers();
    try {
      const runDue = jest.fn<() => Promise<typeof report>>().mockResolvedValue(report);
      const job = new GameLeagueJob({} as never, { runDue } as never, { expireOld: jest.fn<() => Promise<number>>().mockResolvedValue(0) } as never);
      job.start();
      jest.advanceTimersByTime(15 * 60 * 1000);
      expect(runDue).toHaveBeenCalledTimes(1);
      job.stop();
      jest.advanceTimersByTime(60 * 60 * 1000);
      expect(runDue).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('GameNightlyJob', () => {
  const rarity = () => ({
    recomputeRarity: jest.fn<() => Promise<unknown>>().mockResolvedValue({ population: 0, keys: 0 }),
    recomputeMythic: jest.fn<() => Promise<unknown>>().mockResolvedValue([]),
  });

  it('ne calcule pas avant 3 h UTC', async () => {
    const service = rarity();
    const job = new GameNightlyJob({} as never, service as never);
    expect(await job.runIfDue(new Date('2026-10-06T02:59:00Z'))).toBe(false);
    expect(service.recomputeRarity).not.toHaveBeenCalled();
  });

  it('calcule une fois par jour UTC, puis de nouveau le lendemain', async () => {
    const service = rarity();
    const job = new GameNightlyJob({} as never, service as never);

    expect(await job.runIfDue(new Date('2026-10-06T03:00:00Z'))).toBe(true);
    expect(await job.runIfDue(new Date('2026-10-06T15:00:00Z'))).toBe(false);
    expect(await job.runIfDue(new Date('2026-10-07T03:30:00Z'))).toBe(true);

    expect(service.recomputeRarity).toHaveBeenCalledTimes(2);
    expect(service.recomputeMythic).toHaveBeenCalledTimes(2);
  });

  it('un calcul qui échoue ne retient pas l’autre, et le jour n’est pas marqué fait (rattrapage au tour suivant)', async () => {
    const service = rarity();
    service.recomputeRarity.mockRejectedValueOnce(new Error('down'));
    const job = new GameNightlyJob({} as never, service as never);

    expect(await job.runIfDue(new Date('2026-10-06T03:00:00Z'))).toBe(false);
    expect(service.recomputeMythic).toHaveBeenCalledTimes(1);

    expect(await job.runIfDue(new Date('2026-10-06T03:30:00Z'))).toBe(true);
  });
});
