/**
 * Audit adversarial #14459 (B2, B3), repris au lot : une rafale ne franchit pas les bornes,
 * et un blocage acquitté pendant le jugement de l'ouverture coupe.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { TALKIE_MAX_CHUNK_BYTES, TALKIE_MAX_TOTAL_BYTES } from '@meeshy/shared/types/talkie';
import { TalkieRelay, type TalkieRelayDeps } from '../../../../services/talkie/talkieRelay';
import type { TalkieVerdict } from '../../../../services/talkie/talkieGate';

const FROM = '507f1f77bcf86cd799439011';
const TO = '507f1f77bcf86cd799439022';
const SOCKET = 'sock-1';

function harness(overrides: Partial<TalkieRelayDeps> = {}) {
  const emissions: { room: string; event: string; payload: Record<string, unknown> }[] = [];
  let clock = Date.parse('2026-11-02T10:00:00Z');
  const cuts = new Map<string, number>();
  const deps: TalkieRelayDeps = {
    io: { to: (room: string) => ({ emit: (event: string, payload: Record<string, unknown>) => { emissions.push({ room, event, payload }); } }) } as never,
    judge: async (): Promise<TalkieVerdict> => ({ ok: true }),
    withinStartRate: async () => true,
    cutAt: async (from, to) => cuts.get(`${from}:${to}`) ?? null,
    now: () => clock,
    report: () => undefined,
    ...overrides,
  };
  return { relay: new TalkieRelay(deps), emissions, cuts, advance: (ms: number) => { clock += ms; }, now: () => clock };
}

const chunks = (t: ReturnType<typeof harness>) => t.emissions.filter((e) => e.event === 'talkie:chunk');

describe('audit — rafale de fragments arrivés dans le même tour de boucle', () => {
  it('un même numéro de séquence ne repart qu’une fois (rejeu)', async () => {
    const t = harness();
    const ack = await t.relay.start(SOCKET, FROM, { toUserId: TO, codec: 'aac-adts' });
    if (!ack.success) throw new Error('refus');
    const data = new Uint8Array(1000).fill(1);

    await Promise.all([0, 0, 0, 0, 0].map((seq) => t.relay.chunk(SOCKET, FROM, { talkieId: ack.data.talkieId, seq, data })));
    t.relay.dispose();

    expect(chunks(t).map((e) => e.payload.seq)).toEqual([0]);
  });

  it('le plafond total de la prise de parole tient en rafale', async () => {
    const t = harness();
    const ack = await t.relay.start(SOCKET, FROM, { toUserId: TO, codec: 'aac-adts' });
    if (!ack.success) throw new Error('refus');
    const data = new Uint8Array(TALKIE_MAX_CHUNK_BYTES).fill(1);
    const burst = Array.from({ length: 200 }, (_, seq) => seq);

    await Promise.all(burst.map((seq) => t.relay.chunk(SOCKET, FROM, { talkieId: ack.data.talkieId, seq, data })));
    t.relay.dispose();

    const relayed = chunks(t).reduce((sum, e) => sum + (e.payload.data as Uint8Array).byteLength, 0);
    expect(relayed).toBeLessThanOrEqual(TALKIE_MAX_TOTAL_BYTES);
  });
});

describe('audit — un blocage acquitté PENDANT le jugement de l’ouverture', () => {
  it('coupe la prise de parole ouverte sur un verdict périmé', async () => {
    let release: (v: TalkieVerdict) => void = () => undefined;
    const t = harness({ judge: () => new Promise<TalkieVerdict>((resolve) => { release = resolve; }) });
    const opening = t.relay.start(SOCKET, FROM, { toUserId: TO, codec: 'aac-adts' });
    await new Promise((r) => setImmediate(r));

    // Le jugement a lu « pas bloqué » ; le blocage arrive et pose sa coupure.
    t.advance(50);
    t.cuts.set(`${FROM}:${TO}`, t.now());
    t.relay.cutPair(FROM, TO);
    t.advance(50);
    release({ ok: true });

    const ack = await opening;
    expect(ack).toMatchObject({ success: false, code: 'TALKIE_NOT_ALLOWED' });
    if (!ack.success) return;
    await t.relay.chunk(SOCKET, FROM, { talkieId: ack.data.talkieId, seq: 0, data: new Uint8Array(100) });
    t.relay.dispose();

    expect(chunks(t)).toEqual([]);
  });
});

describe('audit — le reste des bornes et des courses', () => {
  it('le NOMBRE de fragments est plafonné : 512 000 fragments d’un octet ne passent pas', async () => {
    const t = harness();
    const ack = await t.relay.start(SOCKET, FROM, { toUserId: TO, codec: 'aac-adts' });
    if (!ack.success) throw new Error('refus');
    for (let seq = 0; seq < 400; seq += 1) await t.relay.chunk(SOCKET, FROM, { talkieId: ack.data.talkieId, seq, data: new Uint8Array(1) });

    expect(chunks(t)).toHaveLength(300);
    expect(t.emissions.find((e) => e.event === 'talkie:ended')?.payload.reason).toBe('limit');
  });

  it('m6 : la socket tombe pendant le jugement ⇒ aucune session fantôme, aucun talkie:incoming', async () => {
    let release: (v: TalkieVerdict) => void = () => undefined;
    const t = harness({ judge: () => new Promise<TalkieVerdict>((resolve) => { release = resolve; }) });
    const opening = t.relay.start(SOCKET, FROM, { toUserId: TO, codec: 'aac-adts' });
    await new Promise((r) => setImmediate(r));
    t.relay.socketGone(SOCKET);
    release({ ok: true });

    expect(await opening).toMatchObject({ success: false, code: 'TALKIE_UNAVAILABLE' });
    expect(t.relay.openCount).toBe(0);
    expect(t.emissions.filter((e) => e.event === 'talkie:incoming')).toEqual([]);
  });

  it('m1 : un rejugement qui refuse (préférence coupée, appel, Ne pas déranger, E2EE…) coupe la voix en cours', async () => {
    let verdict: TalkieVerdict = { ok: true };
    const t = harness({ judge: async () => verdict });
    const ack = await t.relay.start(SOCKET, FROM, { toUserId: TO, codec: 'aac-adts' });
    if (!ack.success) throw new Error('refus');
    await t.relay.chunk(SOCKET, FROM, { talkieId: ack.data.talkieId, seq: 0, data: new Uint8Array(10) });
    verdict = { ok: false, code: 'TALKIE_FALLBACK_VOICE', message: 'appel' };
    t.advance(2_500);
    await t.relay.chunk(SOCKET, FROM, { talkieId: ack.data.talkieId, seq: 1, data: new Uint8Array(10) });
    await new Promise((r) => setImmediate(r));
    await t.relay.chunk(SOCKET, FROM, { talkieId: ack.data.talkieId, seq: 2, data: new Uint8Array(10) });

    const ended = t.emissions.filter((e) => e.event === 'talkie:ended');
    expect(ended.map((e) => [e.room, e.payload.reason])).toEqual([[`user:${TO}`, 'cut']]);
    expect(chunks(t).map((e) => e.payload.seq)).not.toContain(2);
    expect(t.relay.openCount).toBe(0);
  });

  it('m5 : cutPair coupe quelle que soit la casse des identifiants', async () => {
    const t = harness();
    await t.relay.start(SOCKET, FROM, { toUserId: TO, codec: 'aac-adts' });
    t.relay.cutPair(FROM.toUpperCase(), TO.toUpperCase());

    expect(t.relay.openCount).toBe(0);
  });
});

