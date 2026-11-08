/**
 * #17142 — une voix vers un Proche sans socket : la session `waking` garde ses fragments
 * en mémoire, bornés, envoie UN réveil, et les rejoue dans l'ordre au destinataire qui
 * émet `talkie:join` (pendant la session ou 60 s après), puis le direct, puis la fin.
 * Rien n'est persisté ; le tampon est libéré à l'expiration.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { TALKIE_JOIN_WINDOW_MS, TALKIE_MAX_DURATION_MS } from '@meeshy/shared/types/talkie';
import { TalkieRelay, TALKIE_WAKING_PROCESS_MAX_BYTES, type TalkieRelayDeps } from '../../../../services/talkie/talkieRelay';
import type { TalkieVerdict } from '../../../../services/talkie/talkieGate';

const FROM = '507f1f77bcf86cd799439011';
const TO = '507f1f77bcf86cd799439022';
const INTRUS = '507f1f77bcf86cd799439033';
const SENDER_SOCKET = 'sock-from';
const RECIPIENT_SOCKET = 'sock-to';

type Emission = { room: string; event: string; payload: Record<string, any> };
const WAKING: TalkieVerdict = { ok: true, delivery: 'waking', channel: 'push' };

function relayWith(overrides: Partial<TalkieRelayDeps> = {}) {
  const emissions: Emission[] = [];
  let clock = Date.parse('2026-11-08T10:00:00Z');
  const cuts = new Map<string, number>();
  const wake = jest.fn(async (_params: unknown) => undefined);
  const followUp = jest.fn(async (_params: unknown) => undefined);
  const trace = jest.fn((_event: string, _fields: Record<string, unknown>) => undefined);
  let verdict: TalkieVerdict = WAKING;
  const deps: TalkieRelayDeps = {
    io: { to: (room: string) => ({ emit: (event: string, payload: Record<string, any>) => { emissions.push({ room, event, payload }); } }) } as never,
    judge: async () => verdict,
    withinStartRate: async () => true,
    cutAt: async (from, to) => cuts.get(`${from}:${to}`) ?? null,
    now: () => clock,
    report: () => undefined,
    wake,
    followUp,
    trace,
    ...overrides,
  };
  const relay = new TalkieRelay(deps);
  return {
    relay, emissions, cuts, wake, followUp, trace,
    advance: (ms: number) => { clock += ms; },
    now: () => clock,
    setVerdict: (next: TalkieVerdict) => { verdict = next; },
  };
}

const frame = (byte: number, bytes = 1000) => new Uint8Array(bytes).fill(byte);
type Rig = ReturnType<typeof relayWith>;

async function open(t: Rig) {
  const ack = await t.relay.start(SENDER_SOCKET, FROM, { toUserId: TO, codec: 'aac-adts' });
  if (!ack.success) throw new Error(`refus ${ack.code}`);
  return ack;
}
const say = (t: Rig, talkieId: string, seq: number) => t.relay.chunk(SENDER_SOCKET, FROM, { talkieId, seq, data: frame(seq + 1) });
const toSocket = (t: Rig, socket = RECIPIENT_SOCKET) => t.emissions.filter((e) => e.room === socket);

afterEach(() => jest.useRealTimers());

describe('#17142 — ouvrir une voix réveillée', () => {
  it('l’accusé dit waking, UN réveil part, et rien n’est émis vers le destinataire avant qu’il rejoigne', async () => {
    const t = relayWith();
    const ack = await open(t);

    expect(ack.data.delivery).toBe('waking');
    expect(t.wake).toHaveBeenCalledTimes(1);
    expect(t.wake).toHaveBeenCalledWith({ talkieId: ack.data.talkieId, fromUserId: FROM, toUserId: TO, channel: 'push' });
    expect(t.trace).toHaveBeenCalledWith('[TALKIE_WAKING]', { channel: 'push', talkieId: ack.data.talkieId, fromUserId: FROM, toUserId: TO });
    await say(t, ack.data.talkieId, 0);
    expect(t.emissions.filter((e) => e.room === `user:${TO}`)).toEqual([]);
    t.relay.dispose();
  });

  it('une voix en direct garde son accusé live et ne réveille personne', async () => {
    const t = relayWith();
    t.setVerdict({ ok: true });
    const ack = await open(t);

    expect(ack.data.delivery).toBe('live');
    expect(t.wake).not.toHaveBeenCalled();
    t.relay.dispose();
  });

  it('un réveil qui échoue ne casse pas la prise de parole', async () => {
    const report = jest.fn();
    const t = relayWith({ wake: async () => { throw new Error('apns'); }, report });
    const ack = await open(t);
    await Promise.resolve();

    expect(ack.success).toBe(true);
    expect(report).toHaveBeenCalledWith('Talkie wake failed', expect.any(Error));
    t.relay.dispose();
  });
});

describe('#17142 — talkie:join rejoue tout, dans l’ordre, puis le direct, puis la fin', () => {
  it('pendant la session : incoming, les fragments gardés dans l’ordre, puis le direct, puis ended', async () => {
    const t = relayWith();
    const { data } = await open(t);
    await say(t, data.talkieId, 0);
    await say(t, data.talkieId, 1);

    expect(await t.relay.join(RECIPIENT_SOCKET, TO, { talkieId: data.talkieId })).toBe('joined');
    await say(t, data.talkieId, 2);
    t.relay.end(SENDER_SOCKET, FROM, { talkieId: data.talkieId });

    const seen = toSocket(t).map((e) => (e.event === 'talkie:chunk' ? `chunk:${e.payload.seq}` : e.event));
    expect(seen).toEqual(['talkie:incoming', 'chunk:0', 'chunk:1', 'chunk:2']);
    expect(toSocket(t)[0].payload).toMatchObject({ talkieId: data.talkieId, fromUserId: FROM, codec: 'aac-adts' });
    expect(t.emissions.filter((e) => e.event === 'talkie:ended').map((e) => e.room)).toEqual([`user:${TO}`, `user:${FROM}`]);
    expect(t.trace).toHaveBeenCalledWith('[TALKIE_JOINED]', expect.objectContaining({ talkieId: data.talkieId, toUserId: TO, afterEnd: false }));
    expect(t.followUp).not.toHaveBeenCalled();
    t.relay.dispose();
  });

  it('un second join de la même socket ne rejoue pas deux fois', async () => {
    const t = relayWith();
    const { data } = await open(t);
    await say(t, data.talkieId, 0);
    await t.relay.join(RECIPIENT_SOCKET, TO, { talkieId: data.talkieId });
    await t.relay.join(RECIPIENT_SOCKET, TO, { talkieId: data.talkieId });

    expect(toSocket(t).filter((e) => e.event === 'talkie:chunk')).toHaveLength(1);
    t.relay.dispose();
  });

  it('dans les 60 s après la fin : incoming, tous les fragments, puis ended', async () => {
    const t = relayWith();
    const { data } = await open(t);
    await say(t, data.talkieId, 0);
    await say(t, data.talkieId, 1);
    t.relay.end(SENDER_SOCKET, FROM, { talkieId: data.talkieId });
    t.advance(TALKIE_JOIN_WINDOW_MS - 1_000);

    expect(await t.relay.join(RECIPIENT_SOCKET, TO, { talkieId: data.talkieId })).toBe('joined');
    expect(toSocket(t).map((e) => e.event)).toEqual(['talkie:incoming', 'talkie:chunk', 'talkie:chunk', 'talkie:ended']);
    expect(toSocket(t)[3].payload).toMatchObject({ reason: 'sender' });
    t.relay.dispose();
  });

  it('après la fenêtre de 60 s : le tampon est libéré, plus rien ne se rejoue', async () => {
    jest.useFakeTimers();
    const t = relayWith();
    const { data } = await open(t);
    await say(t, data.talkieId, 0);
    t.relay.end(SENDER_SOCKET, FROM, { talkieId: data.talkieId });
    jest.advanceTimersByTime(TALKIE_JOIN_WINDOW_MS + 1);

    expect(await t.relay.join(RECIPIENT_SOCKET, TO, { talkieId: data.talkieId })).toBe('unknown');
    expect(t.relay.bufferedBytes).toBe(0);
  });

  it('le join d’un autre compte que le destinataire est refusé, et rien ne lui est émis', async () => {
    const t = relayWith();
    const { data } = await open(t);
    await say(t, data.talkieId, 0);

    expect(await t.relay.join('sock-intrus', INTRUS, { talkieId: data.talkieId })).toBe('refused');
    expect(await t.relay.join('sock-from-2', FROM, { talkieId: data.talkieId })).toBe('refused');
    expect(toSocket(t, 'sock-intrus')).toEqual([]);
    t.relay.dispose();
  });

  it('une coupure (blocage) posée depuis l’ouverture refuse le join, même après la fin', async () => {
    const t = relayWith();
    const { data } = await open(t);
    await say(t, data.talkieId, 0);
    t.relay.end(SENDER_SOCKET, FROM, { talkieId: data.talkieId });
    t.cuts.set(`${FROM}:${TO}`, t.now());

    expect(await t.relay.join(RECIPIENT_SOCKET, TO, { talkieId: data.talkieId })).toBe('refused');
    expect(toSocket(t)).toEqual([]);
    t.relay.dispose();
  });

  it('la porte rejugée au join (talkie coupé entre-temps) refuse ; une porte en panne aussi', async () => {
    const t = relayWith();
    const { data } = await open(t);
    t.setVerdict({ ok: false, code: 'TALKIE_BLOCKED', message: 'x' });
    expect(await t.relay.join(RECIPIENT_SOCKET, TO, { talkieId: data.talkieId })).toBe('refused');

    t.setVerdict(WAKING);
    const broken = relayWith({ judge: jest.fn<TalkieRelayDeps['judge']>().mockResolvedValueOnce(WAKING).mockRejectedValue(new Error('mongo')) });
    const second = await open(broken);
    expect(await broken.relay.join(RECIPIENT_SOCKET, TO, { talkieId: second.data.talkieId })).toBe('refused');
    t.relay.dispose();
    broken.relay.dispose();
  });

  it('une voix coupée par un blocage ne se garde pas pour la fenêtre de rattrapage', async () => {
    const t = relayWith();
    const { data } = await open(t);
    await say(t, data.talkieId, 0);
    t.relay.cutPair(FROM, TO);

    expect(await t.relay.join(RECIPIENT_SOCKET, TO, { talkieId: data.talkieId })).toBe('unknown');
    expect(t.relay.bufferedBytes).toBe(0);
  });

  it('cutPair efface aussi une voix finie qui attendait son rattrapage', async () => {
    const t = relayWith();
    const { data } = await open(t);
    await say(t, data.talkieId, 0);
    t.relay.end(SENDER_SOCKET, FROM, { talkieId: data.talkieId });
    t.relay.cutPair(FROM, TO);

    expect(await t.relay.join(RECIPIENT_SOCKET, TO, { talkieId: data.talkieId })).toBe('unknown');
    expect(t.relay.bufferedBytes).toBe(0);
  });

  it('un join illisible ou d’une voix inconnue : unknown', async () => {
    const t = relayWith();
    expect(await t.relay.join(RECIPIENT_SOCKET, TO, { talkieId: 'nope' })).toBe('unknown');
    expect(await t.relay.join(RECIPIENT_SOCKET, TO, { talkieId: 'f'.repeat(24) })).toBe('unknown');
  });

  it('une voix en DIRECT ne se rejoint pas : rien n’est gardé', async () => {
    const t = relayWith();
    t.setVerdict({ ok: true });
    const { data } = await open(t);
    await say(t, data.talkieId, 0);

    expect(await t.relay.join(RECIPIENT_SOCKET, TO, { talkieId: data.talkieId })).toBe('unknown');
    expect(t.relay.bufferedBytes).toBe(0);
    t.relay.dispose();
  });
});

describe('#17142 — les bornes du tampon', () => {
  it('le tampon d’une session suit les octets gardés, et se libère à la fermeture sans rattrapage', async () => {
    const t = relayWith();
    const { data } = await open(t);
    await say(t, data.talkieId, 0);
    await say(t, data.talkieId, 1);
    expect(t.relay.bufferedBytes).toBe(2000);

    t.relay.socketGone(SENDER_SOCKET);
    expect(t.relay.bufferedBytes).toBe(0);
  });

  it('le plafond d’octets du processus ferme la prise de parole qui le franchirait (« limit »)', async () => {
    const t = relayWith();
    const sessions = Math.ceil(TALKIE_WAKING_PROCESS_MAX_BYTES / 500_000) + 1;
    const ids: string[] = [];
    for (let i = 0; i < sessions; i += 1) {
      const ack = await t.relay.start(`s-${i}`, FROM, { toUserId: TO, codec: 'aac-adts' });
      if (!ack.success) throw new Error('refus');
      ids.push(ack.data.talkieId);
      for (let seq = 0; seq < 31; seq += 1) await t.relay.chunk(`s-${i}`, FROM, { talkieId: ack.data.talkieId, seq, data: frame(1, 16_000) });
    }

    expect(t.relay.bufferedBytes).toBeLessThanOrEqual(TALKIE_WAKING_PROCESS_MAX_BYTES);
    expect(t.emissions.some((e) => e.event === 'talkie:ended' && e.payload.reason === 'limit')).toBe(true);
    t.relay.dispose();
    expect(t.relay.bufferedBytes).toBe(0);
  });

  it('la durée maximale ferme la session réveillée comme une autre, et la garde pour le rattrapage', async () => {
    jest.useFakeTimers();
    const t = relayWith();
    const { data } = await open(t);
    await say(t, data.talkieId, 0);
    jest.advanceTimersByTime(TALKIE_MAX_DURATION_MS + 1_001);

    expect(t.emissions.find((e) => e.event === 'talkie:ended')?.payload).toMatchObject({ reason: 'limit' });
    expect(await t.relay.join(RECIPIENT_SOCKET, TO, { talkieId: data.talkieId })).toBe('joined');
    t.relay.dispose();
  });
});

describe('#17142 — la voix lisible sans socket (extension de notification) et le push de suivi', () => {
  it('le destinataire lit les fragments concaténés, pendant la session et après', async () => {
    const t = relayWith();
    const { data } = await open(t);
    await say(t, data.talkieId, 0);
    await say(t, data.talkieId, 1);

    const during = await t.relay.audioFor(data.talkieId, TO);
    expect(during).toMatchObject({ ok: true, codec: 'aac-adts' });
    expect(during.ok && Array.from(during.data.slice(999, 1001))).toEqual([1, 2]);
    expect(during.ok && during.data.byteLength).toBe(2000);

    t.relay.end(SENDER_SOCKET, FROM, { talkieId: data.talkieId });
    expect((await t.relay.audioFor(data.talkieId, TO)).ok).toBe(true);
    t.relay.dispose();
  });

  it('même garde que le join : un autre compte, une coupure, une voix inconnue ⇒ refus', async () => {
    const t = relayWith();
    const { data } = await open(t);
    await say(t, data.talkieId, 0);

    expect(await t.relay.audioFor(data.talkieId, INTRUS)).toEqual({ ok: false, reason: 'refused' });
    expect(await t.relay.audioFor('f'.repeat(24), TO)).toEqual({ ok: false, reason: 'unknown' });
    t.cuts.set(`${FROM}:${TO}`, t.now());
    expect(await t.relay.audioFor(data.talkieId, TO)).toEqual({ ok: false, reason: 'refused' });
    t.relay.dispose();
  });

  it('finie sans join : un push de suivi, avec la date limite de lecture', async () => {
    const t = relayWith();
    const { data } = await open(t);
    await say(t, data.talkieId, 0);
    t.relay.end(SENDER_SOCKET, FROM, { talkieId: data.talkieId });

    expect(t.followUp).toHaveBeenCalledWith({
      talkieId: data.talkieId, fromUserId: FROM, toUserId: TO, availableUntil: new Date(t.now() + TALKIE_JOIN_WINDOW_MS), bytes: 1000, durationMs: 0,
    });
    t.relay.dispose();
  });

  it('aucun suivi pour une voix vide, rejointe ou coupée', async () => {
    const t = relayWith();
    const empty = await open(t);
    t.relay.end(SENDER_SOCKET, FROM, { talkieId: empty.data.talkieId });
    const cut = await open(t);
    await say(t, cut.data.talkieId, 0);
    t.relay.cutPair(FROM, TO);

    expect(t.followUp).not.toHaveBeenCalled();
    t.relay.dispose();
  });
});
