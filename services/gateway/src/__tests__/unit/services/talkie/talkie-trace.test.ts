/**
 * #17252 — une prise de parole se LOCALISE : la passerelle journalise son ouverture, le premier
 * fragment relayé et sa fin, par identifiants seulement — jamais un octet de voix. Une perte se
 * lit alors dans le journal : ouverte sans fragment, fragments reçus mais aucun relayé, ou fin.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { TalkieRelay, type TalkieRelayDeps } from '../../../../services/talkie/talkieRelay';
import type { TalkieVerdict } from '../../../../services/talkie/talkieGate';

const FROM = '507f1f77bcf86cd799439011';
const TO = '507f1f77bcf86cd799439022';
const SENDER_SOCKET = 'sock-from';
const RECIPIENT_SOCKET = 'sock-to';

type Traced = { readonly event: string; readonly fields: Readonly<Record<string, unknown>> };

function relayWith(verdict: TalkieVerdict, overrides: Partial<TalkieRelayDeps> = {}) {
  const traced: Traced[] = [];
  let clock = Date.parse('2026-11-13T10:00:00Z');
  const deps: TalkieRelayDeps = {
    io: { to: () => ({ emit: () => undefined }) } as never,
    judge: async () => verdict,
    withinStartRate: async () => true,
    cutAt: async () => null,
    now: () => clock,
    report: () => undefined,
    wake: jest.fn(async () => undefined),
    followUp: jest.fn(async () => undefined),
    trace: (event, fields) => { traced.push({ event, fields }); },
    ...overrides,
  };
  return { relay: new TalkieRelay(deps), traced, advance: (ms: number) => { clock += ms; } };
}

type Rig = ReturnType<typeof relayWith>;
const LIVE: TalkieVerdict = { ok: true };
const WAKING: TalkieVerdict = { ok: true, delivery: 'waking', channel: 'push' };
const of = (t: Rig, event: string) => t.traced.filter((entry) => entry.event === event).map((entry) => entry.fields);

async function open(t: Rig): Promise<string> {
  const ack = await t.relay.start(SENDER_SOCKET, FROM, { toUserId: TO, codec: 'aac-adts' });
  if (!ack.success) throw new Error(`refus ${ack.code}`);
  return ack.data.talkieId;
}
const say = (t: Rig, talkieId: string, seq: number, bytes = 400) =>
  t.relay.chunk(SENDER_SOCKET, FROM, { talkieId, seq, data: new Uint8Array(bytes).fill(7) });

const carriesVoice = (fields: Readonly<Record<string, unknown>>) =>
  Object.values(fields).some((value) => value instanceof Uint8Array || value instanceof ArrayBuffer);

describe('#17252 — la passerelle journalise l’ouverture d’une prise de parole', () => {
  it('une voix en direct journalise son ouverture : identifiants, mode et codec', async () => {
    const t = relayWith(LIVE);
    const talkieId = await open(t);

    expect(of(t, '[TALKIE_STARTED]')).toEqual([
      { talkieId, fromUserId: FROM, toUserId: TO, delivery: 'live', codec: 'aac-adts', sealed: false },
    ]);
    t.relay.dispose();
  });

  it('une voix réveillée journalise aussi son ouverture, en mode waking', async () => {
    const t = relayWith(WAKING);
    const talkieId = await open(t);

    expect(of(t, '[TALKIE_STARTED]')).toEqual([
      { talkieId, fromUserId: FROM, toUserId: TO, delivery: 'waking', codec: 'aac-adts', sealed: false },
    ]);
    t.relay.dispose();
  });

  it('un refus n’ouvre rien et ne journalise aucune ouverture', async () => {
    const t = relayWith({ ok: false, code: 'TALKIE_NOT_ALLOWED', message: 'Non' } as TalkieVerdict);
    const ack = await t.relay.start(SENDER_SOCKET, FROM, { toUserId: TO, codec: 'aac-adts' });

    expect(ack.success).toBe(false);
    expect(of(t, '[TALKIE_STARTED]')).toEqual([]);
  });
});

describe('#17252 — le premier fragment relayé se journalise, une fois', () => {
  it('le premier fragment relayé en direct dit son rang et son délai depuis l’ouverture, les suivants se taisent', async () => {
    const t = relayWith(LIVE);
    const talkieId = await open(t);
    t.advance(180);
    await say(t, talkieId, 0);
    t.advance(40);
    await say(t, talkieId, 1);

    expect(of(t, '[TALKIE_RELAYED]')).toEqual([{ talkieId, seq: 0, afterMs: 180 }]);
    t.relay.dispose();
  });

  it('une voix réveillée que personne n’a rejointe n’a rien relayé : aucune ligne de relais', async () => {
    const t = relayWith(WAKING);
    const talkieId = await open(t);
    await say(t, talkieId, 0);

    expect(of(t, '[TALKIE_RELAYED]')).toEqual([]);
    t.relay.dispose();
  });

  it('une voix réveillée relaie son premier fragment vers celui qui l’a rejointe', async () => {
    const t = relayWith(WAKING);
    const talkieId = await open(t);
    expect(await t.relay.join(RECIPIENT_SOCKET, TO, { talkieId })).toBe('joined');
    t.advance(90);
    await say(t, talkieId, 0);

    expect(of(t, '[TALKIE_RELAYED]')).toEqual([{ talkieId, seq: 0, afterMs: 90 }]);
    t.relay.dispose();
  });

  it('un fragment dont l’émission lève n’est pas compté comme relayé', async () => {
    const t = relayWith(LIVE, {
      io: { to: () => ({ emit: (event: string) => { if (event === 'talkie:chunk') throw new Error('adaptateur'); } }) } as never,
    });
    const talkieId = await open(t);
    await say(t, talkieId, 0);

    expect(of(t, '[TALKIE_RELAYED]')).toEqual([]);
    t.relay.end(SENDER_SOCKET, FROM, { talkieId });
    expect(of(t, '[TALKIE_ENDED]')).toEqual([expect.objectContaining({ talkieId, chunks: 1, relayedChunks: 0 })]);
  });
});

describe('#17252 — la fin d’une prise de parole dit ce qui est passé', () => {
  it('relâchée en direct : raison, fragments reçus et relayés, octets et durée', async () => {
    const t = relayWith(LIVE);
    const talkieId = await open(t);
    await say(t, talkieId, 0, 300);
    await say(t, talkieId, 1, 500);
    t.advance(1200);
    t.relay.end(SENDER_SOCKET, FROM, { talkieId });

    expect(of(t, '[TALKIE_ENDED]')).toEqual([
      { talkieId, fromUserId: FROM, toUserId: TO, delivery: 'live', reason: 'sender', chunks: 2, relayedChunks: 2, bytes: 800, durationMs: 1200 },
    ]);
  });

  it('une voix réveillée dit en plus si quelqu’un l’a rejointe', async () => {
    const t = relayWith(WAKING);
    const talkieId = await open(t);
    await say(t, talkieId, 0);
    t.relay.end(SENDER_SOCKET, FROM, { talkieId });

    expect(of(t, '[TALKIE_ENDED]')).toEqual([expect.objectContaining({ talkieId, delivery: 'waking', joined: false, relayedChunks: 0 })]);
    t.relay.dispose();
  });

  it('une ouverture sans aucun fragment se lit à sa fin : zéro reçu, zéro relayé', async () => {
    const t = relayWith(LIVE);
    const talkieId = await open(t);
    t.relay.socketGone(SENDER_SOCKET);

    expect(of(t, '[TALKIE_ENDED]')).toEqual([expect.objectContaining({ talkieId, reason: 'cut', chunks: 0, relayedChunks: 0, bytes: 0 })]);
  });

  it('aucune ligne de journal ne porte un octet de voix', async () => {
    const t = relayWith(WAKING);
    const talkieId = await open(t);
    await t.relay.join(RECIPIENT_SOCKET, TO, { talkieId });
    await say(t, talkieId, 0);
    t.relay.end(SENDER_SOCKET, FROM, { talkieId });

    expect(t.traced.length).toBeGreaterThan(0);
    expect(t.traced.filter((entry) => carriesVoice(entry.fields))).toEqual([]);
    t.relay.dispose();
  });
});
