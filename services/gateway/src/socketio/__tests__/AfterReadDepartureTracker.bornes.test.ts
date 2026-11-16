/**
 * #18556 — les BORNES du constat de départ : aucune retenue n'est éternelle
 * (au plafond, on brûle) et le débordement des regards reste borné en mémoire.
 * Le reste du comportement vit dans `AfterReadDepartureTracker.test.ts`.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import {
  AfterReadDepartureTracker,
  AFTER_READ_MAX_PERIODS,
  AFTER_READ_VIEW_STOP_GRACE_MS,
  AFTER_READ_MAX_RETRY_DELAY_MS,
  AFTER_READ_RECHECK_MS,
  AFTER_READ_MAX_HOLD_MS,
  AFTER_READ_MAX_TOUCHED,
  AFTER_READ_VIEW_STARTS_PER_MINUTE,
  AFTER_READ_VIEW_STARTS_PER_USER_PER_MINUTE,
  type AfterReadDeparture,
  type AfterReadPeriod,
  type AfterReadReader,
} from '../AfterReadDepartureTracker';
import { GRACE_MS, T0, at, buildTracker, settle, elapse } from './helpers/after-read-tracker';

describe('AfterReadDepartureTracker — aucune retenue n’est éternelle : au plafond, on BRÛLE (#18556, revue de sécurité)', () => {
  afterEach(() => jest.useRealTimers());

  it('un appel actif au-delà du plafond brûle : grâce d’origine + AFTER_READ_MAX_HOLD_MS au plus', async () => {
    jest.useFakeTimers({ now: T0 });
    const { tracker, departures } = buildTracker({ holdsDeparture: async () => true, followTimers: true });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.viewStop('s-1', 'conv-1');
    await elapse(AFTER_READ_VIEW_STOP_GRACE_MS + AFTER_READ_MAX_HOLD_MS - AFTER_READ_RECHECK_MS);
    expect(departures).toEqual([]);

    await elapse(AFTER_READ_RECHECK_MS * 2);
    expect(departures).toHaveLength(1);
  });

  it('l’arrière-plan pendant un appel interminable (CallKit, écran verrouillé) brûle au même plafond', async () => {
    jest.useFakeTimers({ now: T0 });
    const { tracker, departures } = buildTracker({ holdsDeparture: async () => true, followTimers: true });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.background('s-1');
    await elapse(GRACE_MS + AFTER_READ_MAX_HOLD_MS + AFTER_READ_RECHECK_MS);

    expect(departures).toHaveLength(1);
  });

  it('une vérification d’appel qui lève en continu brûle après le plafond', async () => {
    jest.useFakeTimers({ now: T0 });
    const { tracker, departures } = buildTracker({
      holdsDeparture: async () => {
        throw new Error('mongo down');
      },
      followTimers: true,
    });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.background('s-1');
    await elapse(GRACE_MS + AFTER_READ_MAX_HOLD_MS - AFTER_READ_RECHECK_MS);
    expect(departures).toEqual([]);

    await elapse(AFTER_READ_RECHECK_MS * 2);
    expect(departures).toHaveLength(1);
  });

  it('un autre appareil qui regarde sans fin ne retient les flammes que jusqu’au plafond', async () => {
    jest.useFakeTimers({ now: T0 });
    const { tracker, departures } = buildTracker({ viewedElsewhere: async () => true, followTimers: true });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.close('s-1', 'conv-1');
    await elapse(AFTER_READ_MAX_HOLD_MS - AFTER_READ_RECHECK_MS);
    expect(departures).toEqual([]);

    await elapse(AFTER_READ_RECHECK_MS * 2);
    expect(departures).toHaveLength(1);
  });

  it('une vérification inter-nœuds qui lève en continu brûle après le plafond', async () => {
    jest.useFakeTimers({ now: T0 });
    const { tracker, departures } = buildTracker({
      viewedElsewhere: async () => {
        throw new Error('redis down');
      },
      followTimers: true,
    });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.disconnecting('s-1');
    await elapse(GRACE_MS + AFTER_READ_MAX_HOLD_MS - AFTER_READ_RECHECK_MS, 1_000);
    expect(departures).toEqual([]);

    await elapse(AFTER_READ_RECHECK_MS, 1_000);
    expect(departures).toHaveLength(1);
  });

  it('une consommation en échec au-delà des redemandes n’est jamais oubliée : elle brûle quand la base revient', async () => {
    jest.useFakeTimers({ now: T0 });
    const base = { down: true };
    let attempts = 0;
    const { tracker, departures } = buildTracker({
      onDeparture: async () => {
        attempts += 1;
        if (base.down) throw new Error('mongo down');
      },
      followTimers: true,
    });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.close('s-1', 'conv-1');
    for (let i = 0; i < 320; i += 1) {
      jest.advanceTimersByTime(AFTER_READ_MAX_RETRY_DELAY_MS);
      await settle();
    }
    expect(attempts).toBeGreaterThan(300);

    base.down = false;
    jest.advanceTimersByTime(AFTER_READ_MAX_RETRY_DELAY_MS);
    await settle();
    expect(departures).toHaveLength(1);
  });

  it('AUDIT 4.1 — un arrière-plan répété pendant un appel ne repousse pas le plafond', async () => {
    jest.useFakeTimers({ now: T0 });
    const { tracker, departures } = buildTracker({ holdsDeparture: async () => true, followTimers: true });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.background('s-1');
    for (let t = 0; t < GRACE_MS + AFTER_READ_MAX_HOLD_MS + 2 * AFTER_READ_RECHECK_MS; t += 25_000) {
      await elapse(25_000, 5_000);
      await tracker.background('s-1');
    }

    expect(departures).toHaveLength(1);
  });

  it('AUDIT 4.1 — sans appel, un arrière-plan répété par la même socket ne repousse pas sa grâce', async () => {
    jest.useFakeTimers({ now: T0 });
    const { tracker, departures } = buildTracker({ followTimers: true });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.background('s-1');
    await elapse(20_000, 5_000);
    await tracker.background('s-1');
    await elapse(GRACE_MS - 20_000, 5_000);

    expect(departures).toHaveLength(1);
  });

  it('AUDIT 4.1 — un autre appareil qui part juste avant le plafond ne le repousse pas', async () => {
    jest.useFakeTimers({ now: T0 });
    const { tracker, departures } = buildTracker({ holdsDeparture: async () => true, followTimers: true });

    await tracker.viewStart('s-2', 'conv-1');
    await tracker.viewStop('s-2', 'conv-1');
    await tracker.viewStart('s-1', 'conv-1');
    await tracker.viewStop('s-1', 'conv-1');
    await elapse(AFTER_READ_VIEW_STOP_GRACE_MS + AFTER_READ_MAX_HOLD_MS - 2_000, 1_000);
    expect(departures).toEqual([]);

    await tracker.disconnecting('s-2');
    await elapse(3_000, 1_000);
    expect(departures).toHaveLength(1);
  });

  it('AUDIT 4.3 — une conversation évincée du registre de la socket BRÛLE, elle n’est pas oubliée', async () => {
    jest.useFakeTimers({ now: T0 });
    const { tracker, departures } = buildTracker({ holdsDeparture: async () => true, followTimers: true });

    await tracker.viewStart('s-1', 'conv-0');
    await tracker.viewStop('s-1', 'conv-0');
    for (let i = 1; i <= AFTER_READ_MAX_TOUCHED; i += 1) {
      await tracker.viewStart('s-1', `conv-${i}`);
      await tracker.viewStop('s-1', `conv-${i}`);
    }
    await elapse(AFTER_READ_VIEW_STOP_GRACE_MS + AFTER_READ_MAX_HOLD_MS + 2 * AFTER_READ_RECHECK_MS, 10_000);

    expect(departures.map((departure) => departure.conversationId)).toContain('conv-0');
  });

  it('AUDIT 4.4 — une sortie déclarée qui échoue se redemande sans qu’un appel la retienne', async () => {
    jest.useFakeTimers({ now: T0 });
    const failures = { left: 1 };
    const { tracker, departures } = buildTracker({
      holdsDeparture: async () => true,
      onDeparture: async () => {
        if (failures.left > 0) {
          failures.left -= 1;
          throw new Error('mongo down');
        }
      },
      followTimers: true,
    });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.close('s-1', 'conv-1');
    await elapse(GRACE_MS + 1_000, 1_000);

    expect(departures).toHaveLength(1);
  });

  it('après le plafond, une consommation qui échoue se redemande SANS que l’appel la retienne de nouveau', async () => {
    jest.useFakeTimers({ now: T0 });
    const failures = { left: 1 };
    const { tracker, departures } = buildTracker({
      holdsDeparture: async () => true,
      onDeparture: async () => {
        if (failures.left > 0) {
          failures.left -= 1;
          throw new Error('mongo down');
        }
      },
      followTimers: true,
    });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.background('s-1');
    await elapse(GRACE_MS + AFTER_READ_MAX_HOLD_MS + AFTER_READ_RECHECK_MS, 1_000);
    expect(departures).toEqual([]);

    await elapse(GRACE_MS + 1_000, 1_000);
    expect(departures).toHaveLength(1);
  });

  it.each([
    ['sans appel', async () => false],
    ['pendant un appel', async () => true],
  ])('AUDIT 4.1 — deux appareils qui alternent l’arrière-plan ne repoussent pas le plafond (%s)', async (_label, holds) => {
    jest.useFakeTimers({ now: T0 });
    const { tracker, departures } = buildTracker({ holdsDeparture: holds, followTimers: true });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.viewStart('s-2', 'conv-1');
    await tracker.background('s-1');
    await tracker.background('s-2');
    for (let t = 0, turn = 0; t < GRACE_MS + AFTER_READ_MAX_HOLD_MS + 2 * AFTER_READ_RECHECK_MS; t += 25_000, turn += 1) {
      await elapse(25_000, 5_000);
      await tracker.background(turn % 2 === 0 ? 's-1' : 's-2');
    }

    expect(departures).toHaveLength(1);
  });

  it.each([
    ['sans appel', async () => false],
    ['pendant un appel décroché', async () => true],
  ])('AUDIT H — une vieille socket qui part pendant que la nouvelle regarde n’ancre aucun plafond (%s)', async (_label, holds) => {
    jest.useFakeTimers({ now: T0 });
    const { tracker, departures } = buildTracker({ holdsDeparture: holds, followTimers: true });

    await tracker.viewStart('s-old', 'conv-1');
    await tracker.viewStart('s-new', 'conv-1');
    await tracker.disconnecting('s-old');
    await elapse(15 * 60_000, 30_000);
    await tracker.viewStop('s-new', 'conv-1');
    await elapse(AFTER_READ_VIEW_STOP_GRACE_MS - 1_000, 1_000);

    expect(departures).toEqual([]);
  });
});

describe('AfterReadDepartureTracker — le débordement des regards reste borné en mémoire (#18556, revue)', () => {
  afterEach(() => jest.useRealTimers());

  function failingBase() {
    const base = { down: true };
    const attempts: AfterReadDeparture[] = [];
    const built = buildTracker({
      onDeparture: async (departure) => {
        attempts.push(departure);
        if (base.down) throw new Error('mongo down');
      },
    });
    return { ...built, base, attempts };
  }

  async function cycles(
    tracker: AfterReadDepartureTracker,
    clock: { now: Date },
    count: number,
  ): Promise<void> {
    for (let i = 0; i < count; i += 1) {
      clock.now = at(i * 2);
      await tracker.viewStart('s-1', 'conv-1');
      clock.now = at(i * 2 + 1);
      await tracker.viewStop('s-1', 'conv-1');
      await settle();
    }
  }

  it('pendant une panne, au plus UNE brûlure de débordement est en vol par clé', async () => {
    jest.useFakeTimers();
    const { tracker, clock, attempts } = failingBase();

    await cycles(tracker, clock, AFTER_READ_MAX_PERIODS * 4);

    expect(attempts).toHaveLength(1);
  });

  it('les débordements fusionnés brûlent en un départ borné quand la base revient, sans rien perdre', async () => {
    jest.useFakeTimers();
    const { tracker, clock, base, departures } = failingBase();

    await cycles(tracker, clock, AFTER_READ_MAX_PERIODS * 4);
    await tracker.viewStart('s-1', 'conv-1');
    base.down = false;
    for (let i = 0; i < 12; i += 1) {
      jest.advanceTimersByTime(AFTER_READ_MAX_RETRY_DELAY_MS);
      await settle();
    }

    expect(departures.every((departure) => departure.periods.length <= AFTER_READ_MAX_PERIODS)).toBe(true);
    const covered = (instant: Date) =>
      departures.some((departure) =>
        departure.periods.some((period) => period.from <= instant && instant <= period.to),
      );
    const overflowed = Array.from({ length: AFTER_READ_MAX_PERIODS * 3 }, (_unused, i) => at(i * 2));
    expect(overflowed.every(covered)).toBe(true);
  });

  it('une brûlure de débordement en échec se redemande à intervalle DOUBLÉ', async () => {
    jest.useFakeTimers();
    const { tracker, clock, attempts } = failingBase();

    await cycles(tracker, clock, AFTER_READ_MAX_PERIODS + 1);
    await tracker.viewStart('s-1', 'conv-1');
    jest.advanceTimersByTime(GRACE_MS);
    await settle();
    expect(attempts).toHaveLength(2);
    jest.advanceTimersByTime(GRACE_MS * 2 - 1);
    await settle();
    expect(attempts).toHaveLength(2);
    jest.advanceTimersByTime(1);
    await settle();
    expect(attempts).toHaveLength(3);
  });

  it('au-delà de AFTER_READ_VIEW_STARTS_PER_MINUTE par socket, un viewing:start n’ouvre plus de regard', async () => {
    const { tracker, marks } = buildTracker();

    for (let i = 0; i < AFTER_READ_VIEW_STARTS_PER_MINUTE + 5; i += 1) {
      await tracker.viewStart('s-1', 'conv-1');
      await tracker.viewStop('s-1', 'conv-1');
    }

    expect(marks.filter((mark) => mark.viewing)).toHaveLength(AFTER_READ_VIEW_STARTS_PER_MINUTE);
  });

  it('AUDIT K — tant que la borne n’est pas atteinte, une panne ne fusionne aucun trou : rien de non regardé ne brûle', async () => {
    jest.useFakeTimers();
    const { tracker, clock, base, departures } = failingBase();

    await cycles(tracker, clock, AFTER_READ_MAX_PERIODS * 4);
    await tracker.viewStart('s-1', 'conv-1');
    base.down = false;
    for (let i = 0; i < 12; i += 1) {
      jest.advanceTimersByTime(AFTER_READ_MAX_RETRY_DELAY_MS);
      await settle();
    }

    const periods = departures.flatMap((departure) => departure.periods);
    expect(periods.every((period) => period.to.getTime() - period.from.getTime() <= 60_000)).toBe(true);
  });

  it('AUDIT L — une socket dont aucun regard ne s’est résolu ne laisse rien derrière sa déconnexion', async () => {
    const { tracker } = buildTracker({ resolve: () => null });

    await tracker.viewStart('s-ghost', 'conv-1');
    await tracker.disconnecting('s-ghost');

    const internals = tracker as unknown as { viewStarts: ReadonlyMap<string, unknown> };
    expect(internals.viewStarts.size).toBe(0);
  });

  it('ÉQUITÉ — un lecteur A qui sature le budget global ne fait pas fusionner la clé d’un lecteur B', async () => {
    jest.useFakeTimers();
    const base = { down: true };
    const departures: AfterReadDeparture[] = [];
    const clock = { now: T0 };
    const tracker = new AfterReadDepartureTracker({
      resolveReader: async (socketId, conversationId) => ({
        conversationId,
        participantId: `p-${socketId}`,
        readerKey: socketId === 's-b' ? 'u-b' : 'u-a',
      }),
      onDeparture: async (departure) => {
        if (base.down) throw new Error('mongo down');
        departures.push(departure);
      },
      graceMs: GRACE_MS,
      now: () => clock.now,
      overflowLimits: { perKey: 4, perReader: 6, total: 8 },
    });
    const watch = async (socketId: string, conversationId: string, count: number, offset: number) => {
      for (let i = 0; i < count; i += 1) {
        clock.now = at((offset + i) * 2);
        await tracker.viewStart(socketId, conversationId);
        clock.now = at((offset + i) * 2 + 1);
        await tracker.viewStop(socketId, conversationId);
        await settle();
      }
    };

    await watch('s-a', 'conv-a1', AFTER_READ_MAX_PERIODS + 6, 0);
    await watch('s-a', 'conv-a2', AFTER_READ_MAX_PERIODS + 6, 100);
    await watch('s-b', 'conv-b', AFTER_READ_MAX_PERIODS + 3, 200);
    base.down = false;
    for (let i = 0; i < 12; i += 1) {
      jest.advanceTimersByTime(AFTER_READ_MAX_RETRY_DELAY_MS);
      await settle();
    }

    const burnedForB = departures.filter((departure) => departure.readerKey === 'u-b').flatMap((d) => d.periods);
    expect(burnedForB.length).toBeGreaterThan(0);
    expect(burnedForB.every((period) => period.to.getTime() - period.from.getTime() <= 60_000)).toBe(true);
  });

  it('au-delà de AFTER_READ_VIEW_STARTS_PER_USER_PER_MINUTE par UTILISATEUR, plusieurs sockets n’ouvrent plus de regard', async () => {
    const { tracker, marks } = buildTracker({ userOf: () => 'u-1' });

    for (const socketId of ['s-1', 's-2', 's-3']) {
      for (let i = 0; i < AFTER_READ_VIEW_STARTS_PER_MINUTE; i += 1) {
        await tracker.viewStart(socketId, 'conv-1');
        await tracker.viewStop(socketId, 'conv-1');
      }
    }

    expect(marks.filter((mark) => mark.viewing)).toHaveLength(AFTER_READ_VIEW_STARTS_PER_USER_PER_MINUTE);
  });

  it('ÉQUITÉ — à égalité de charge, c’est la file la plus RÉCENTE qui se resserre, jamais le lecteur arrivé avant', async () => {
    jest.useFakeTimers({ now: T0 });
    const tracker = new AfterReadDepartureTracker({
      resolveReader: async () => null,
      onDeparture: async () => {
        throw new Error('mongo down');
      },
      overflowLimits: { perKey: 4, perReader: 4, total: 8 },
    });
    const internals = tracker as unknown as {
      burnOverflow: (reader: AfterReadReader, periods: readonly AfterReadPeriod[]) => void;
      overflows: ReadonlyMap<string, { periods: readonly AfterReadPeriod[] }>;
    };
    const fourLooks = () =>
      Array.from({ length: 4 }, (_unused, i) => ({ from: at(i), to: new Date(at(i).getTime() + 1_000) }));

    internals.burnOverflow({ conversationId: 'c-b', participantId: 'p-b', readerKey: 'u-b' }, fourLooks());
    await settle();
    internals.burnOverflow({ conversationId: 'c-a1', participantId: 'p-a1', readerKey: 'u-a1' }, fourLooks());
    internals.burnOverflow({ conversationId: 'c-a2', participantId: 'p-a2', readerKey: 'u-a2' }, fourLooks());
    await settle();

    expect(internals.overflows.get('u-b\u0000c-b')?.periods).toHaveLength(4);
  });
});

