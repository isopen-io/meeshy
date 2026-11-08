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
    expect(seen).toEqual(['talkie:incoming', 'chunk:0', 'chunk:1', 'chunk:2', 'talkie:ended']);
    expect(toSocket(t)[0].payload).toMatchObject({ talkieId: data.talkieId, fromUserId: FROM, codec: 'aac-adts' });
    const ended = t.emissions.filter((e) => e.event === 'talkie:ended');
    expect(ended.map((e) => e.room)).toEqual([RECIPIENT_SOCKET, `user:${FROM}`]);
    expect(ended[1].payload).toMatchObject({ reason: 'sender', joined: true });
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
  it('le tampon suit les octets gardés ; la socket émettrice qui tombe GARDE la voix pour le rattrapage, un blocage la libère', async () => {
    const t = relayWith();
    const { data } = await open(t);
    await say(t, data.talkieId, 0);
    await say(t, data.talkieId, 1);
    expect(t.relay.bufferedBytes).toBe(2000);

    t.relay.socketGone(SENDER_SOCKET);
    expect(t.relay.bufferedBytes).toBe(2000);
    expect(t.followUp).toHaveBeenCalledTimes(1);
    t.relay.cutPair(FROM, TO);
    expect(t.relay.bufferedBytes).toBe(0);
  });

  it('au plus deux voix réveillées par émetteur à la fois : la troisième se replie, avec sa conversation', async () => {
    const t = relayWith({ fallbackConversation: async () => 'd'.repeat(24) });
    const first = await t.relay.start('s-1', FROM, { toUserId: TO, codec: 'aac-adts' });
    await t.relay.start('s-2', FROM, { toUserId: TO, codec: 'aac-adts' });
    if (first.success) t.relay.end('s-1', FROM, { talkieId: first.data.talkieId });
    const third = await t.relay.start('s-3', FROM, { toUserId: TO, codec: 'aac-adts' });

    expect(third).toMatchObject({ success: false, code: 'TALKIE_FALLBACK_VOICE', conversationId: 'd'.repeat(24) });
    expect(t.wake).toHaveBeenCalledTimes(2);
    t.relay.dispose();
  });

  it('un processus qui ne peut plus garder une voix entière replie la suivante au lieu d’évincer les autres', async () => {
    const t = relayWith();
    const senders = Array.from({ length: Math.ceil(TALKIE_WAKING_PROCESS_MAX_BYTES / 496_000) + 2 }, (_, i) => `${String(i).padStart(24, '0')}`);
    const outcomes: string[] = [];
    for (const [i, sender] of senders.entries()) {
      const ack = await t.relay.start(`s-${i}`, sender, { toUserId: TO, codec: 'aac-adts' });
      outcomes.push(ack.success ? 'ok' : ack.code);
      if (!ack.success) continue;
      for (let seq = 0; seq < 31; seq += 1) await t.relay.chunk(`s-${i}`, sender, { talkieId: ack.data.talkieId, seq, data: frame(1, 16_000) });
    }

    expect(outcomes).toContain('TALKIE_FALLBACK_VOICE');
    expect(t.relay.bufferedBytes).toBeLessThanOrEqual(TALKIE_WAKING_PROCESS_MAX_BYTES);
    expect(t.emissions.some((e) => e.event === 'talkie:ended' && e.payload.reason === 'limit')).toBe(false);
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

  it('finie sans join : l’émetteur l’apprend (joined: false) pour créer la copie vocale ; le destinataire n’entend rien', async () => {
    const t = relayWith();
    const { data } = await open(t);
    await say(t, data.talkieId, 0);
    t.relay.end(SENDER_SOCKET, FROM, { talkieId: data.talkieId });

    const ended = t.emissions.filter((e) => e.event === 'talkie:ended');
    expect(ended.map((e) => e.room)).toEqual([`user:${FROM}`]);
    expect(ended[0].payload).toMatchObject({ reason: 'sender', joined: false });
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

describe('#17141 — le repli informe, et dit où partira la copie vocale', () => {
  it('TALKIE_FALLBACK_VOICE porte la conversation la plus récente avec le destinataire', async () => {
    const fallbackConversation = jest.fn(async (_from: string, _to: string) => 'd'.repeat(24));
    const t = relayWith({ judge: async () => ({ ok: false, code: 'TALKIE_FALLBACK_VOICE', message: 'm' }), fallbackConversation });

    const ack = await t.relay.start(SENDER_SOCKET, FROM, { toUserId: TO, codec: 'aac-adts' });

    expect(ack).toEqual({ success: false, error: 'm', code: 'TALKIE_FALLBACK_VOICE', conversationId: 'd'.repeat(24) });
    expect(fallbackConversation).toHaveBeenCalledWith(FROM, TO);
  });

  it('aucune conversation, ou une lecture qui échoue : le repli sans conversationId', async () => {
    const none = relayWith({ judge: async () => ({ ok: false, code: 'TALKIE_FALLBACK_VOICE', message: 'm' }), fallbackConversation: async () => null });
    const broken = relayWith({ judge: async () => ({ ok: false, code: 'TALKIE_FALLBACK_VOICE', message: 'm' }), fallbackConversation: async () => { throw new Error('mongo'); } });

    expect(await none.relay.start(SENDER_SOCKET, FROM, { toUserId: TO, codec: 'aac-adts' })).toEqual({ success: false, error: 'm', code: 'TALKIE_FALLBACK_VOICE' });
    expect(await broken.relay.start(SENDER_SOCKET, FROM, { toUserId: TO, codec: 'aac-adts' })).toEqual({ success: false, error: 'm', code: 'TALKIE_FALLBACK_VOICE' });
  });

  it('un autre refus ne cherche aucune conversation', async () => {
    const fallbackConversation = jest.fn(async () => 'd'.repeat(24));
    const t = relayWith({ judge: async () => ({ ok: false, code: 'TALKIE_NOT_ALLOWED', message: 'm' }), fallbackConversation });

    expect(await t.relay.start(SENDER_SOCKET, FROM, { toUserId: TO, codec: 'aac-adts' })).toEqual({ success: false, error: 'm', code: 'TALKIE_NOT_ALLOWED' });
    expect(fallbackConversation).not.toHaveBeenCalled();
  });
});

describe('#17141 — la conversation la plus récente de la paire', () => {
  const participants = [
    { userId: FROM, conversationId: 'c-direct', isActive: true },
    { userId: TO, conversationId: 'c-direct', isActive: true },
    { userId: FROM, conversationId: 'c-groupe', isActive: true },
    { userId: TO, conversationId: 'c-groupe', isActive: true },
    { userId: FROM, conversationId: 'c-sans-lui', isActive: true },
    { userId: TO, conversationId: 'c-quitte', isActive: false },
    { userId: FROM, conversationId: 'c-quitte', isActive: true },
  ];
  const conversations = [
    { id: 'c-direct', lastMessageAt: 1, isActive: true },
    { id: 'c-groupe', lastMessageAt: 5, isActive: true },
    { id: 'c-quitte', lastMessageAt: 9, isActive: true },
    { id: 'c-sans-lui', lastMessageAt: 10, isActive: true },
  ];
  const prisma = {
    participant: {
      findMany: async (args: { where: { userId: string; isActive: boolean; conversationId?: { in: string[] } } }) =>
        participants.filter((p) => p.userId === args.where.userId && p.isActive && (!args.where.conversationId || args.where.conversationId.in.includes(p.conversationId))),
    },
    conversation: {
      findFirst: async (args: { where: { id: { in: string[] } } }) =>
        conversations.filter((c) => args.where.id.in.includes(c.id)).sort((x, y) => y.lastMessageAt - x.lastMessageAt)[0] ?? null,
    },
  };

  it('la plus récente des conversations où les DEUX sont actifs, pas forcément la directe', async () => {
    const { mostRecentSharedConversation } = await import('../../../../services/talkie/talkieFallback');
    expect(await mostRecentSharedConversation(prisma as never, FROM, TO)).toBe('c-groupe');
    expect(await mostRecentSharedConversation(prisma as never, FROM, INTRUS)).toBeNull();
  });
});

describe('#17142 (audit) — ce qui borne le rattrapage et la copie', () => {
  it('la coupure d’un blocage vit aussi longtemps qu’une voix réveillée reste rejoignable', async () => {
    const { cutTalkiesOnBlock } = await import('../../../../services/talkie/talkieCut');
    const ttls: number[] = [];
    await cutTalkiesOnBlock(
      { cache: { get: async () => null, set: async (_k: string, _v: string, ttl?: number) => { ttls.push(ttl ?? 0); } } as never, relay: null, now: () => 0 },
      { blockerId: TO, blockedId: FROM, scope: 'user' },
    );
    expect(Math.min(...ttls) * 1000).toBeGreaterThanOrEqual(TALKIE_MAX_DURATION_MS + TALKIE_JOIN_WINDOW_MS);
  });

  it('la copie ne vise qu’un échange privé que le serveur lit : direct ou groupe, jamais chiffré', async () => {
    const { mostRecentSharedConversation } = await import('../../../../services/talkie/talkieFallback');
    const findFirst = jest.fn(async (_args: unknown) => null);
    const prisma = {
      participant: { findMany: async () => [{ conversationId: 'c1' }] },
      conversation: { findFirst },
    };
    await mostRecentSharedConversation(prisma as never, FROM, TO);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ type: { in: ['direct', 'group'] }, NOT: expect.objectContaining({ AND: expect.any(Array) }) }),
    }));
  });
});
