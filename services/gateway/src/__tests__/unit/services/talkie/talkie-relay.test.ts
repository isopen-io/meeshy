/**
 * #13935 — le relais du talkie (D-4) : chaque fragment repart vers le destinataire
 * à l'instant où il arrive, borné, coupé par un blocage, sans rien stocker.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { TALKIE_MAX_CHUNK_BYTES, TALKIE_MAX_DURATION_MS } from '@meeshy/shared/types/talkie';
import { TalkieRelay, type TalkieRelayDeps } from '../../../../services/talkie/talkieRelay';
import type { TalkieVerdict } from '../../../../services/talkie/talkieGate';

const FROM = '507f1f77bcf86cd799439011';
const TO = '507f1f77bcf86cd799439022';
const SOCKET = 'sock-1';

type Emission = { room: string; event: string; payload: Record<string, any> };

function relayWith(overrides: Partial<TalkieRelayDeps> = {}) {
  const emissions: Emission[] = [];
  let clock = Date.parse('2026-11-02T10:00:00Z');
  const cuts = new Map<string, number>();
  const deps: TalkieRelayDeps = {
    io: { to: (room: string) => ({ emit: (event: string, payload: Record<string, any>) => { emissions.push({ room, event, payload }); } }) } as never,
    judge: async (): Promise<TalkieVerdict> => ({ ok: true }),
    withinStartRate: async () => true,
    cutAt: async (from, to) => cuts.get(`${from}:${to}`) ?? null,
    now: () => clock,
    report: () => undefined,
    ...overrides,
  };
  const relay = new TalkieRelay(deps);
  return {
    relay, emissions, cuts,
    advance: (ms: number) => { clock += ms; },
    now: () => clock,
  };
}

const frame = (bytes = 4000) => new Uint8Array(bytes).fill(7);

async function open(t: ReturnType<typeof relayWith>) {
  const ack = await t.relay.start(SOCKET, FROM, { toUserId: TO, codec: 'aac-adts' });
  if (!ack.success) throw new Error(`refus ${ack.code}`);
  return ack.data.talkieId;
}

const of = (t: ReturnType<typeof relayWith>, event: string) => t.emissions.filter((e) => e.event === event);

afterEach(() => jest.useRealTimers());

describe('#13935 — ouvrir une prise de parole', () => {
  it('rend un talkieId et ses bornes, et prévient le destinataire — lui seul — par talkie:incoming', async () => {
    const t = relayWith();
    const ack = await t.relay.start(SOCKET, FROM, { toUserId: TO, codec: 'aac-adts' });
    t.relay.dispose();

    expect(ack).toEqual({ success: true, data: { talkieId: expect.stringMatching(/^[0-9a-f]{24}$/), maxDurationMs: TALKIE_MAX_DURATION_MS, maxChunkBytes: TALKIE_MAX_CHUNK_BYTES } });
    const incoming = of(t, 'talkie:incoming');
    expect(incoming.map((e) => e.room)).toEqual([`user:${TO}`]);
    expect(incoming[0].payload).toMatchObject({ fromUserId: FROM, codec: 'aac-adts', maxDurationMs: TALKIE_MAX_DURATION_MS });
  });

  it.each([
    [{ ok: false, code: 'TALKIE_NOT_ALLOWED', message: 'x' }],
    [{ ok: false, code: 'TALKIE_BLOCKED', message: 'x' }],
    [{ ok: false, code: 'TALKIE_E2EE_CONVERSATION', message: 'x' }],
    [{ ok: false, code: 'TALKIE_FALLBACK_VOICE', message: 'x' }],
  ] as const)('un refus de la porte (%j) est rendu tel quel, et rien ne part', async (verdict) => {
    const t = relayWith({ judge: async () => verdict });
    const ack = await t.relay.start(SOCKET, FROM, { toUserId: TO, codec: 'aac-adts' });

    expect(ack).toMatchObject({ success: false, code: verdict.code });
    expect(t.emissions).toEqual([]);
    expect(t.relay.openCount).toBe(0);
  });

  it('une porte qui échoue FERME : TALKIE_UNAVAILABLE', async () => {
    const t = relayWith({ judge: async () => { throw new Error('mongo'); } });
    const ack = await t.relay.start(SOCKET, FROM, { toUserId: TO, codec: 'aac-adts' });

    expect(ack).toMatchObject({ success: false, code: 'TALKIE_UNAVAILABLE' });
  });

  it('au-delà du débit : TALKIE_RATE_LIMITED ; compteur injoignable : TALKIE_UNAVAILABLE', async () => {
    const over = await relayWith({ withinStartRate: async () => false }).relay.start(SOCKET, FROM, { toUserId: TO, codec: 'aac-adts' });
    const down = await relayWith({ withinStartRate: async () => null }).relay.start(SOCKET, FROM, { toUserId: TO, codec: 'aac-adts' });

    expect(over).toMatchObject({ success: false, code: 'TALKIE_RATE_LIMITED' });
    expect(down).toMatchObject({ success: false, code: 'TALKIE_UNAVAILABLE' });
  });

  it.each([
    [{ toUserId: 'pas-un-id', codec: 'aac-adts' }],
    [{ toUserId: TO, codec: 'pcm' }],
    [null],
  ])('une charge illisible (%j) : TALKIE_INVALID', async (payload) => {
    const ack = await relayWith().relay.start(SOCKET, FROM, payload);

    expect(ack).toMatchObject({ success: false, code: 'TALKIE_INVALID' });
  });

  it('une nouvelle prise de parole sur la même socket ferme la précédente', async () => {
    const t = relayWith();
    const first = await open(t);
    const second = await open(t);
    t.relay.dispose();

    expect(second).not.toBe(first);
    expect(of(t, 'talkie:ended')[0].payload).toMatchObject({ talkieId: first, reason: 'sender' });
  });
});

describe('#13935 — le son se lit dès sa réception', () => {
  it('chaque fragment repart AUSSITÔT au destinataire, dans l’ordre, avec l’horloge de capture et de relais', async () => {
    const t = relayWith();
    const talkieId = await open(t);
    await t.relay.chunk(SOCKET, FROM, { talkieId, seq: 0, capturedAt: 1, data: frame() });
    await t.relay.chunk(SOCKET, FROM, { talkieId, seq: 1, capturedAt: 2, data: frame(100) });
    t.relay.dispose();

    const chunks = of(t, 'talkie:chunk');
    expect(chunks.map((e) => [e.room, e.payload.seq, e.payload.data.byteLength])).toEqual([[`user:${TO}`, 0, 4000], [`user:${TO}`, 1, 100]]);
    expect(chunks[0].payload).toMatchObject({ talkieId, fromUserId: FROM, capturedAt: 1, relayedAt: t.now() });
  });

  it('le relais d’un fragment ne prend que le temps d’une lecture de cache : p95 sous 5 ms sur 300 fragments', async () => {
    const t = relayWith();
    const talkieId = await open(t);
    const durations: number[] = [];
    for (let seq = 0; seq < 300; seq += 1) {
      const before = performance.now();
      await t.relay.chunk(SOCKET, FROM, { talkieId, seq, data: frame(1000) });
      durations.push(performance.now() - before);
    }
    t.relay.dispose();

    const sorted = [...durations].sort((a, b) => a - b);
    expect(of(t, 'talkie:chunk')).toHaveLength(300);
    expect(sorted[Math.floor(sorted.length * 0.95)]).toBeLessThan(5);
  });

  it('un ArrayBuffer est relayé en octets', async () => {
    const t = relayWith();
    const talkieId = await open(t);
    await t.relay.chunk(SOCKET, FROM, { talkieId, seq: 0, data: frame(10).buffer });
    t.relay.dispose();

    expect(of(t, 'talkie:chunk')[0].payload.data).toBeInstanceOf(Uint8Array);
  });

  it.each([
    ['trop gros', { seq: 0, data: frame(TALKIE_MAX_CHUNK_BYTES + 1) }],
    ['vide', { seq: 0, data: new Uint8Array(0) }],
    ['pas binaire', { seq: 0, data: 'AAAA' }],
  ])('un fragment %s est ignoré', async (_cas, chunk) => {
    const t = relayWith();
    const talkieId = await open(t);
    await t.relay.chunk(SOCKET, FROM, { talkieId, ...chunk });
    t.relay.dispose();

    expect(of(t, 'talkie:chunk')).toEqual([]);
  });

  it('un numéro de séquence qui ne croît pas est ignoré (rejeu, désordre)', async () => {
    const t = relayWith();
    const talkieId = await open(t);
    await t.relay.chunk(SOCKET, FROM, { talkieId, seq: 3, data: frame() });
    await t.relay.chunk(SOCKET, FROM, { talkieId, seq: 3, data: frame() });
    await t.relay.chunk(SOCKET, FROM, { talkieId, seq: 2, data: frame() });
    t.relay.dispose();

    expect(of(t, 'talkie:chunk').map((e) => e.payload.seq)).toEqual([3]);
  });

  it('une autre socket, ou un autre compte, ne peut pas glisser un fragment dans ma prise de parole', async () => {
    const t = relayWith();
    const talkieId = await open(t);
    await t.relay.chunk('sock-2', FROM, { talkieId, seq: 0, data: frame() });
    await t.relay.chunk(SOCKET, TO, { talkieId, seq: 0, data: frame() });
    t.relay.dispose();

    expect(of(t, 'talkie:chunk')).toEqual([]);
  });
});

describe('#13935 — finir, et les bornes', () => {
  it('relâcher : talkie:ended « sender » au destinataire et aux appareils de l’émetteur, puis plus rien ne passe', async () => {
    const t = relayWith();
    const talkieId = await open(t);
    t.relay.end(SOCKET, FROM, { talkieId });
    await t.relay.chunk(SOCKET, FROM, { talkieId, seq: 0, data: frame() });

    const ended = of(t, 'talkie:ended');
    expect(ended.map((e) => e.room).sort()).toEqual([`user:${FROM}`, `user:${TO}`].sort());
    expect(ended[0].payload).toMatchObject({ talkieId, fromUserId: FROM, toUserId: TO, reason: 'sender' });
    expect(of(t, 'talkie:chunk')).toEqual([]);
  });

  it('au-delà de 30 s, la prise de parole se ferme (« limit »)', async () => {
    const t = relayWith();
    const talkieId = await open(t);
    t.advance(TALKIE_MAX_DURATION_MS + 1_500);
    await t.relay.chunk(SOCKET, FROM, { talkieId, seq: 0, data: frame() });

    expect(of(t, 'talkie:chunk')).toEqual([]);
    expect(of(t, 'talkie:ended')[0].payload.reason).toBe('limit');
  });

  it('une minuterie ferme la prise de parole même si l’émetteur se tait', async () => {
    jest.useFakeTimers();
    const t = relayWith();
    await open(t);
    jest.advanceTimersByTime(TALKIE_MAX_DURATION_MS + 1_001);

    expect(of(t, 'talkie:ended')[0].payload.reason).toBe('limit');
    expect(t.relay.openCount).toBe(0);
  });

  it('au-delà de 512 Ko, la prise de parole se ferme', async () => {
    const t = relayWith();
    const talkieId = await open(t);
    for (let seq = 0; seq < 40; seq += 1) await t.relay.chunk(SOCKET, FROM, { talkieId, seq, data: frame(TALKIE_MAX_CHUNK_BYTES) });

    expect(of(t, 'talkie:chunk').length).toBeLessThan(40);
    expect(of(t, 'talkie:ended')[0].payload.reason).toBe('limit');
  });

  it('la socket de l’émetteur part : la prise de parole est coupée', async () => {
    const t = relayWith();
    await open(t);
    t.relay.socketGone(SOCKET);

    expect(of(t, 'talkie:ended')[0].payload.reason).toBe('cut');
    expect(t.relay.openCount).toBe(0);
  });
});

describe('#13935 — un blocage coupe immédiatement, et ne s’annonce qu’à celui qui écoute', () => {
  it('une coupure posée APRÈS l’ouverture (sur n’importe quelle instance) arrête le fragment suivant', async () => {
    const t = relayWith();
    const talkieId = await open(t);
    await t.relay.chunk(SOCKET, FROM, { talkieId, seq: 0, data: frame() });
    t.cuts.set(`${FROM}:${TO}`, t.now());
    await t.relay.chunk(SOCKET, FROM, { talkieId, seq: 1, data: frame() });

    expect(of(t, 'talkie:chunk').map((e) => e.payload.seq)).toEqual([0]);
    const ended = of(t, 'talkie:ended');
    expect(ended.map((e) => e.room)).toEqual([`user:${TO}`]);
    expect(ended[0].payload.reason).toBe('cut');
  });

  it('une coupure ANTÉRIEURE à l’ouverture (déblocage puis nouvelle voix) ne vise pas la nouvelle prise de parole', async () => {
    const t = relayWith();
    t.cuts.set(`${FROM}:${TO}`, t.now() - 10_000);
    const talkieId = await open(t);
    await t.relay.chunk(SOCKET, FROM, { talkieId, seq: 0, data: frame() });
    t.relay.dispose();

    expect(of(t, 'talkie:chunk')).toHaveLength(1);
  });

  it('une lecture de coupure qui échoue FERME : à l’ouverture rien ne s’ouvre, en cours la voix s’arrête', async () => {
    const refused = await relayWith({ cutAt: async () => { throw new Error('redis'); } }).relay.start(SOCKET, FROM, { toUserId: TO, codec: 'aac-adts' });
    expect(refused).toMatchObject({ success: false, code: 'TALKIE_UNAVAILABLE' });

    let calls = 0;
    const t = relayWith({ cutAt: async () => { calls += 1; if (calls > 1) throw new Error('redis'); return null; } });
    const talkieId = await open(t);
    await t.relay.chunk(SOCKET, FROM, { talkieId, seq: 0, data: frame() });

    expect(of(t, 'talkie:chunk')).toEqual([]);
    expect(of(t, 'talkie:ended')[0].payload.reason).toBe('cut');
  });

  it('cutPair coupe sur cette instance, tout de suite, sans prévenir l’émetteur', async () => {
    const t = relayWith();
    await open(t);
    t.relay.cutPair(FROM, TO);

    expect(of(t, 'talkie:ended').map((e) => e.room)).toEqual([`user:${TO}`]);
    expect(t.relay.openCount).toBe(0);
  });
});

describe('#14459 (m4, m5) — la coupure partagée', () => {
  it('un cache partagé attendu mais injoignable FERME la lecture de coupure (le repli mémoire ne la voit pas)', async () => {
    const { readTalkieCut } = await import('../../../../services/talkie/talkieCut');
    const down = { get: async () => null, isAvailable: () => false };

    await expect(readTalkieCut(down, FROM, TO, { requireShared: true })).rejects.toThrow();
    await expect(readTalkieCut(down, FROM, TO, { requireShared: false })).resolves.toBeNull();
  });

  it('la clé de coupure ne dépend pas de la casse des identifiants', async () => {
    const { cutTalkiesOnBlock, readTalkieCut } = await import('../../../../services/talkie/talkieCut');
    const store = new Map<string, string>();
    const cache = { get: async (k: string) => store.get(k) ?? null, set: async (k: string, v: string) => { store.set(k, v); }, isAvailable: () => true };
    await cutTalkiesOnBlock({ cache, relay: null, now: () => 42 }, { blockerId: TO.toUpperCase(), blockedId: FROM.toUpperCase(), scope: 'talkie' });

    expect(await readTalkieCut(cache, FROM, TO)).toBe(42);
  });
});
