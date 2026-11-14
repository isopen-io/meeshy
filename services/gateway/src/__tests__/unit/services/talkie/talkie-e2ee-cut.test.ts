/**
 * #14490 — une conversation directe passée en E2EE coupe le talkie À L'INSTANT,
 * et un rejugement qui ne rend jamais coupe aussi.
 *
 * Avant : le rejugement d'arrière-plan (toutes les 2 s, sur l'arrivée d'un
 * fragment) était la seule voie, et il n'était pas attendu : jusqu'à ≈ 2 s de
 * voix en clair (plus la latence du jugement) après l'activation du bout en
 * bout, et un jugement qui ne rendait jamais laissait passer la voix jusqu'à la
 * minuterie de 30 s.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { TalkieRelay, REJUDGE_EVERY_MS, REJUDGE_TIMEOUT_MS, type TalkieRelayDeps } from '../../../../services/talkie/talkieRelay';
import { cutTalkiesOnEndToEnd, readTalkieCut, type TalkieCutDeps } from '../../../../services/talkie/talkieCut';
import type { TalkieVerdict } from '../../../../services/talkie/talkieGate';

const ALICE = '507f1f77bcf86cd799439011';
const BOB = '507f1f77bcf86cd799439022';
const CAROL = '507f1f77bcf86cd799439033';

type Emission = { room: string; event: string; payload: Record<string, any> };

function memoryCache() {
  const store = new Map<string, string>();
  return {
    store,
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => { store.set(key, value); return true; },
    isAvailable: () => true,
  };
}

function relayWith(overrides: Partial<TalkieRelayDeps> = {}) {
  const emissions: Emission[] = [];
  let clock = Date.parse('2026-11-13T10:00:00Z');
  const cache = memoryCache();
  const deps: TalkieRelayDeps = {
    io: { to: (room: string) => ({ emit: (event: string, payload: Record<string, any>) => { emissions.push({ room, event, payload }); } }) } as never,
    judge: async (): Promise<TalkieVerdict> => ({ ok: true }),
    withinStartRate: async () => true,
    cutAt: (from, to) => readTalkieCut(cache, from, to),
    now: () => clock,
    report: () => undefined,
    ...overrides,
  };
  const relay = new TalkieRelay(deps);
  const cutDeps: TalkieCutDeps = { cache, relay, now: () => clock };
  return { relay, emissions, cache, cutDeps, advance: (ms: number) => { clock += ms; } };
}

const frame = () => new Uint8Array(4000).fill(7);
const of = (emissions: Emission[], event: string) => emissions.filter((e) => e.event === event);

async function open(t: ReturnType<typeof relayWith>, socket: string, from: string, to: string) {
  const ack = await t.relay.start(socket, from, { toUserId: to, codec: 'aac-adts' });
  if (!ack.success) throw new Error(`refus ${ack.code}`);
  return ack.data.talkieId;
}

afterEach(() => jest.useRealTimers());

describe('#14490 — le passage en E2EE d’un tête-à-tête coupe sa voix en clair à l’instant', () => {
  it('coupe, sur cette instance, les voix de la paire dans les DEUX sens, et ne prévient que celui qui écoute', async () => {
    const t = relayWith();
    await open(t, 'sock-a', ALICE, BOB);
    await open(t, 'sock-b', BOB, ALICE);

    await cutTalkiesOnEndToEnd(t.cutDeps, { userIds: [ALICE, BOB] });

    expect(t.relay.openCount).toBe(0);
    const ended = of(t.emissions, 'talkie:ended');
    expect(ended.map((e) => e.room).sort()).toEqual([`user:${ALICE}`, `user:${BOB}`]);
    expect(ended.every((e) => e.payload.reason === 'cut')).toBe(true);
  });

  it('pose la coupure partagée dans les deux sens : une voix portée par une AUTRE instance s’arrête au fragment suivant', async () => {
    const elsewhere = relayWith();
    const talkieId = await open(elsewhere, 'sock-a', ALICE, BOB);
    await elsewhere.relay.chunk('sock-a', ALICE, { talkieId, seq: 0, data: frame() });

    const here: TalkieCutDeps = { cache: elsewhere.cache, relay: null, now: () => Date.parse('2026-11-13T10:00:00Z') };
    await cutTalkiesOnEndToEnd(here, { userIds: [ALICE, BOB] });
    await elsewhere.relay.chunk('sock-a', ALICE, { talkieId, seq: 1, data: frame() });

    expect(of(elsewhere.emissions, 'talkie:chunk').map((e) => e.payload.seq)).toEqual([0]);
    expect(of(elsewhere.emissions, 'talkie:ended')[0].payload.reason).toBe('cut');
    expect(await readTalkieCut(elsewhere.cache, BOB, ALICE)).not.toBeNull();
  });

  it('une écriture partagée qui échoue n’empêche ni la coupure locale des deux sens ni l’écriture de l’autre sens, et l’échec remonte', async () => {
    const t = relayWith();
    await open(t, 'sock-a', ALICE, BOB);
    await open(t, 'sock-b', BOB, ALICE);
    const failing: TalkieCutDeps = {
      ...t.cutDeps,
      cache: {
        get: t.cache.get,
        set: async (key: string, value: string) => {
          if (key.endsWith(`${ALICE}:${BOB}`)) throw new Error('redis down');
          return t.cache.set(key, value);
        },
      },
    };

    await expect(cutTalkiesOnEndToEnd(failing, { userIds: [ALICE, BOB] })).rejects.toThrow('redis down');
    expect(t.relay.openCount).toBe(0);
    expect(await readTalkieCut(t.cache, BOB, ALICE)).not.toBeNull();
  });

  it('ne touche aucune autre paire', async () => {
    const t = relayWith();
    await open(t, 'sock-c', CAROL, ALICE);

    await cutTalkiesOnEndToEnd(t.cutDeps, { userIds: [ALICE, BOB] });
    const stillOpen = t.relay.openCount;
    t.relay.dispose();

    expect(stillOpen).toBe(1);
    expect([...t.cache.store.keys()].some((key) => key.includes(CAROL))).toBe(false);
  });

  it('une conversation qui n’est pas un tête-à-tête de deux comptes ne pose rien', async () => {
    const t = relayWith();
    await cutTalkiesOnEndToEnd(t.cutDeps, { userIds: [ALICE] });
    await cutTalkiesOnEndToEnd(t.cutDeps, { userIds: [ALICE, BOB, CAROL] });
    await cutTalkiesOnEndToEnd(t.cutDeps, { userIds: [ALICE, null] });

    expect(t.cache.store.size).toBe(0);
  });

  it('une voix ouverte APRÈS le passage n’est pas visée par cette coupure (seul l’instant compte)', async () => {
    const t = relayWith();
    await cutTalkiesOnEndToEnd(t.cutDeps, { userIds: [ALICE, BOB] });
    t.advance(1_000);
    const talkieId = await open(t, 'sock-a', ALICE, BOB);
    await t.relay.chunk('sock-a', ALICE, { talkieId, seq: 0, data: frame() });
    const relayed = of(t.emissions, 'talkie:chunk').length;
    t.relay.dispose();

    expect(relayed).toBe(1);
  });
});

describe('#14490 — un rejugement qui ne rend jamais coupe la voix', () => {
  it('au-delà du délai d’attente, la prise de parole est coupée sans attendre la minuterie de 30 s', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    let calls = 0;
    const judge = jest.fn(async (): Promise<TalkieVerdict> => {
      calls += 1;
      return calls === 1 ? { ok: true } : new Promise<TalkieVerdict>(() => undefined);
    });
    const reports: string[] = [];
    const t = relayWith({ judge, report: (message) => { reports.push(message); } });
    const talkieId = await open(t, 'sock-a', ALICE, BOB);
    t.advance(REJUDGE_EVERY_MS + 1);
    await t.relay.chunk('sock-a', ALICE, { talkieId, seq: 0, data: frame() });

    jest.advanceTimersByTime(REJUDGE_TIMEOUT_MS - 1);
    const openBefore = t.relay.openCount;
    jest.advanceTimersByTime(2);

    expect(openBefore).toBe(1);
    expect(t.relay.openCount).toBe(0);
    expect(reports).toEqual(['Talkie rejudge timed out']);
    const ended = of(t.emissions, 'talkie:ended');
    expect(ended.map((e) => e.room)).toEqual([`user:${BOB}`]);
    expect(ended[0].payload.reason).toBe('cut');
  });

  it('un rejugement qui rend à temps n’est pas coupé par le délai, et le suivant peut repartir', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    const judge = jest.fn(async (): Promise<TalkieVerdict> => ({ ok: true }));
    const t = relayWith({ judge });
    const talkieId = await open(t, 'sock-a', ALICE, BOB);
    t.advance(REJUDGE_EVERY_MS + 1);
    await t.relay.chunk('sock-a', ALICE, { talkieId, seq: 0, data: frame() });
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(REJUDGE_TIMEOUT_MS * 2);
    t.advance(REJUDGE_EVERY_MS + 1);
    await t.relay.chunk('sock-a', ALICE, { talkieId, seq: 1, data: frame() });
    const stillOpen = t.relay.openCount;
    t.relay.dispose();

    expect(stillOpen).toBe(1);
    expect(judge).toHaveBeenCalledTimes(3);
  });

  it('le délai d’attente tient dans la cadence du rejugement : la voix en clair ne dépasse pas deux cadences', () => {
    expect(REJUDGE_TIMEOUT_MS).toBeGreaterThan(0);
    expect(REJUDGE_TIMEOUT_MS).toBeLessThanOrEqual(REJUDGE_EVERY_MS);
  });
});
