/**
 * L'ÉTAT DU JEU SE PROPAGE ET S'ORDONNE (#10900) — `game:updated` part dans la room `user:<id>` après une écriture du jeu,
 * avec le bloc SERVI et un marqueur d'ordre croissant ; les gains fréquents sont coalescés.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { gameUpdatedEventSchema, shouldApplyGameState } from '@meeshy/shared/types/game-sync';
import type { GameBlock } from '@meeshy/shared/types/game';
import { GameStateBroadcast } from '../GameStateBroadcast';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const USER = '68a000000000000000000001';

type Emitted = { readonly room: string; readonly event: string; readonly payload: { gameRevision: number; reason: string; game: unknown } };

/** Un faux serveur Socket.IO qui garde le COUPLE (événement, charge) et la room. */
const fakeIO = () => {
  const emitted: Emitted[] = [];
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: Emitted['payload']) => {
        emitted.push({ room, event, payload });
        return true;
      },
    }),
  };
  return { io, emitted };
};

/** Une horloge manuelle et des minuteurs qu'on déclenche à la main. */
const manualClock = (start = 1_000) => {
  let now = start;
  const timers: Array<{ at: number; fn: () => void; cancelled: boolean }> = [];
  return {
    now: () => now,
    schedule: (fn: () => void, ms: number) => {
      const timer = { at: now + ms, fn, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    advance: async (ms: number) => {
      now += ms;
      for (const timer of timers.filter((t) => !t.cancelled && t.at <= now)) {
        timer.cancelled = true;
        timer.fn();
      }
      await flush();
    },
    pending: () => timers.filter((t) => !t.cancelled).length,
  };
};

const flush = async () => {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

const block = (price: number) => ({ mint: { price } }) as unknown as GameBlock;

const harness = (options: { build?: (userId: string) => Promise<GameBlock | null>; io?: boolean } = {}) => {
  const { io, emitted } = fakeIO();
  const clock = manualClock();
  const build = jest.fn(options.build ?? (async () => block(653)));
  const broadcast = new GameStateBroadcast({
    io: () => (options.io === false ? undefined : (io as never)),
    build,
    now: clock.now,
    schedule: clock.schedule,
    creditWindowMs: 2_000,
  });
  return { broadcast, emitted, clock, build };
};

describe('GameStateBroadcast — game:updated (#10900)', () => {
  it('une frappe émet AUSSITÔT game:updated dans la seule room user:<id>, avec le bloc servi et le marqueur d\'ordre', async () => {
    const { broadcast, emitted, clock } = harness();

    broadcast.announce(USER, 'mint');
    await flush();

    expect(emitted).toEqual([{ room: ROOMS.user(USER), event: SERVER_EVENTS.GAME_UPDATED, payload: { gameRevision: clock.now(), reason: 'mint', game: block(653) } }]);
    expect(SERVER_EVENTS.GAME_UPDATED).toBe('game:updated');
  });

  it('la charge tient le contrat partagé (un bloc nul vaut invalidation pure)', async () => {
    const { broadcast, emitted } = harness({ build: async () => null });

    broadcast.announce(USER, 'prestige');
    await flush();

    expect(gameUpdatedEventSchema.safeParse(emitted[0]!.payload).success).toBe(true);
    expect(emitted[0]!.payload.game).toBeNull();
  });

  it('le marqueur est pris AVANT la lecture : un état lu pendant une écriture plus récente reste plus ancien qu\'elle', async () => {
    let release: (value: GameBlock) => void = () => undefined;
    const { broadcast, emitted, clock } = harness({ build: () => new Promise<GameBlock>((resolve) => (release = resolve)) });

    broadcast.announce(USER, 'spend');
    const takenAt = clock.now();
    await clock.advance(500);
    release(block(700));
    await flush();

    expect(emitted[0]!.payload.gameRevision).toBe(takenAt);
  });

  it('les gains fréquents sont COALESCÉS : une seule émission par fenêtre, après la fenêtre', async () => {
    const { broadcast, emitted, clock, build } = harness();

    broadcast.announce(USER, 'credit');
    broadcast.announce(USER, 'credit');
    broadcast.announce(USER, 'credit');
    await flush();
    expect(emitted).toHaveLength(0);

    await clock.advance(2_000);

    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.payload.reason).toBe('credit');
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('une frappe pendant une fenêtre de gains part aussitôt et absorbe les gains en attente', async () => {
    const { broadcast, emitted, clock } = harness();

    broadcast.announce(USER, 'credit');
    broadcast.announce(USER, 'mint');
    await flush();
    await clock.advance(5_000);

    expect(emitted.map((e) => e.payload.reason)).toEqual(['mint']);
  });

  it('deux écritures pendant une lecture en vol : une seconde lecture suit, jamais deux en parallèle, et les marqueurs CROISSENT', async () => {
    const releases: Array<(value: GameBlock) => void> = [];
    const { broadcast, emitted, clock, build } = harness({ build: () => new Promise<GameBlock>((resolve) => releases.push(resolve)) });

    broadcast.announce(USER, 'mint');
    await clock.advance(10);
    broadcast.announce(USER, 'spend');
    broadcast.announce(USER, 'prestige');
    await flush();
    expect(build).toHaveBeenCalledTimes(1);

    releases[0]!(block(653));
    await flush();
    await clock.advance(10);
    releases[1]!(block(700));
    await flush();

    expect(build).toHaveBeenCalledTimes(2);
    expect(emitted.map((e) => e.payload.reason)).toEqual(['mint', 'prestige']);
    expect(emitted[1]!.payload.gameRevision).toBeGreaterThan(emitted[0]!.payload.gameRevision);
  });

  it('course (Promise.all) : des annonces concurrentes de plusieurs comptes partent chacune dans SA room', async () => {
    const { broadcast, emitted } = harness({ build: async (userId) => block(userId === USER ? 653 : 900) });
    const OTHER = '68a000000000000000000002';

    await Promise.all([Promise.resolve().then(() => broadcast.announce(USER, 'mint')), Promise.resolve().then(() => broadcast.announce(OTHER, 'mint'))]);
    await flush();

    expect(emitted.map((e) => [e.room, (e.payload.game as { mint: { price: number } }).mint.price]).sort()).toEqual([
      [ROOMS.user(USER), 653],
      [ROOMS.user(OTHER), 900],
    ]);
  });

  it('sans serveur temps réel (tests, scripts), rien n\'est lu ni émis', async () => {
    const { broadcast, build, clock } = harness({ io: false });

    broadcast.announce(USER, 'mint');
    broadcast.announce(USER, 'credit');
    await clock.advance(5_000);

    expect(build).not.toHaveBeenCalled();
  });

  it('une lecture qui TOMBE émet une invalidation (bloc nul) au lieu de taire l\'écriture, et ne lève jamais', async () => {
    const { broadcast, emitted } = harness({ build: async () => { throw new Error('mongo down'); } });

    expect(() => broadcast.announce(USER, 'reclaim')).not.toThrow();
    await flush();

    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.payload).toMatchObject({ reason: 'reclaim', game: null });
  });

  it('aucune entrée ne reste en mémoire une fois l\'émission faite (carte bornée)', async () => {
    const { broadcast, clock } = harness();

    broadcast.announce(USER, 'credit');
    await clock.advance(2_000);
    broadcast.announce(USER, 'mint');
    await flush();

    expect(broadcast.pendingUsers()).toBe(0);
    expect(clock.pending()).toBe(0);
  });
});

describe('shouldApplyGameState — l\'ordre des sources côté client (#10900)', () => {
  it('ignore un état strictement plus ancien, applique un égal ou plus récent, et toute source sans marqueur', () => {
    expect(shouldApplyGameState(10, 11)).toBe(false);
    expect(shouldApplyGameState(11, 11)).toBe(true);
    expect(shouldApplyGameState(12, 11)).toBe(true);
    expect(shouldApplyGameState(undefined, 11)).toBe(true);
    expect(shouldApplyGameState(10, null)).toBe(true);
  });
});
