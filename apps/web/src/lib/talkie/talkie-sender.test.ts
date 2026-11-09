import { describe, expect, test } from 'bun:test';

import { TALKIE_CLIENT_EVENTS, TALKIE_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/talkie-event-names';

import type { SocketClient } from '@/lib/net/socket';

import { bindTalkieSender, createTalkieSender, outcomeOfRefusal, type TalkieCaptureFactory, type TalkieSendOutcome } from './talkie-sender';

/**
 * ÉMETTRE LE TALKIE DEPUIS LE WEB (#16641) — appuyer ouvre `talkie:start` et le
 * micro ENSEMBLE, chaque trame AAC ADTS est regroupée en fragments de ~250 ms
 * (`talkie:send-chunk`, `seq` croissant), relâcher vide ce qui reste puis ferme
 * (`talkie:end`). Un refus codé se rend sans fuite, la limite de 30 s ferme seule.
 */

const PROCHE = '64b000000000000000000001';
const TALKIE_ID = 'a'.repeat(24);

type Emitted = { readonly event: string; readonly payload: unknown };

function fakeSocket(ack: () => Promise<unknown>) {
  const emitted: Emitted[] = [];
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const socket: SocketClient = {
    connected: true,
    connect: () => undefined,
    disconnect: () => undefined,
    on: (event, handler) => {
      const set = handlers.get(event) ?? new Set();
      set.add(handler as (payload: unknown) => void);
      handlers.set(event, set);
    },
    off: (event, handler) => {
      handlers.get(event)?.delete(handler as (payload: unknown) => void);
    },
    emit: (event, payload) => {
      emitted.push({ event, payload });
    },
    emitWithAck: async (event, payload) => {
      emitted.push({ event, payload });
      return ack();
    },
  };
  const fire = (event: string, payload: unknown): void => handlers.get(event)?.forEach((handler) => handler(payload));
  return { socket, emitted, fire, listeners: (event: string) => handlers.get(event)?.size ?? 0 };
}

const accepted = () => Promise.resolve({ success: true, data: { talkieId: TALKIE_ID, maxDurationMs: 30_000, maxChunkBytes: 16_384 } });

function fakeCapture({ fails = false }: { readonly fails?: boolean } = {}) {
  let frame: ((bytes: Uint8Array, durationMs: number) => void) | null = null;
  let stopped = 0;
  const factory: TalkieCaptureFactory = async ({ onFrame }) => {
    if (fails) throw new Error('NotAllowedError');
    frame = onFrame;
    return {
      stop: async () => {
        stopped += 1;
      },
    };
  };
  return {
    factory,
    push: (count: number, bytes = 200, durationMs = 50) => Array.from({ length: count }, () => frame?.(new Uint8Array(bytes).fill(7), durationMs)),
    stopped: () => stopped,
  };
}

function harness({ ack = accepted, capture = fakeCapture(), socketPresent = true }: { readonly ack?: () => Promise<unknown>; readonly capture?: ReturnType<typeof fakeCapture>; readonly socketPresent?: boolean } = {}) {
  const wire = fakeSocket(ack);
  const outcomes: TalkieSendOutcome[] = [];
  const timers: Array<{ readonly run: () => void; readonly ms: number; cancelled: boolean }> = [];
  let clock = 1_000;
  const sender = createTalkieSender({
    socket: () => (socketPresent ? wire.socket : null),
    capture: capture.factory,
    now: () => clock,
    schedule: (run, ms) => {
      const timer = { run, ms, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    onOutcome: (outcome) => outcomes.push(outcome),
  });
  const chunks = () => wire.emitted.filter((e) => e.event === TALKIE_CLIENT_EVENTS.TALKIE_SEND_CHUNK).map((e) => e.payload as { talkieId: string; seq: number; data: Uint8Array; capturedAt: number });
  const ends = () => wire.emitted.filter((e) => e.event === TALKIE_CLIENT_EVENTS.TALKIE_END).map((e) => e.payload);
  const fireTimers = () => timers.filter((t) => !t.cancelled).forEach((t) => t.run());
  return { sender, wire, outcomes, capture, chunks, ends, timers, fireTimers, tick: (ms: number) => (clock += ms) };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('appuyer → parler → relâcher', () => {
  test('appuyer ouvre talkie:start vers le Proche, en AAC ADTS, et passe en « je parle » à l’accusé', async () => {
    const h = harness();
    h.sender.press(PROCHE);
    expect(h.sender.store.getState().phase).toEqual({ kind: 'starting', toUserId: PROCHE });
    await settle();
    expect(h.wire.emitted[0]).toEqual({ event: TALKIE_CLIENT_EVENTS.TALKIE_START, payload: { toUserId: PROCHE, codec: 'aac-adts' } });
    expect(h.sender.store.getState().phase).toEqual({ kind: 'talking', toUserId: PROCHE, talkieId: TALKIE_ID, delivery: 'live' });
  });

  test('un destinataire hors ligne mais joignable : la prise de parole s’ouvre en réveil (#17144)', async () => {
    const h = harness({ ack: () => Promise.resolve({ success: true, data: { talkieId: TALKIE_ID, maxDurationMs: 30_000, maxChunkBytes: 16_384, delivery: 'waking' } }) });
    h.sender.press(PROCHE);
    await settle();
    expect(h.sender.store.getState().phase).toEqual({ kind: 'talking', toUserId: PROCHE, talkieId: TALKIE_ID, delivery: 'waking' });
  });

  test('une livraison inconnue d’une passerelle future se lit en direct', async () => {
    const h = harness({ ack: () => Promise.resolve({ success: true, data: { talkieId: TALKIE_ID, maxDurationMs: 30_000, maxChunkBytes: 16_384, delivery: 'teleport' } }) });
    h.sender.press(PROCHE);
    await settle();
    expect(h.sender.store.getState().phase).toMatchObject({ delivery: 'live' });
  });

  test('les trames sont regroupées en fragments de ~250 ms, numérotés dans l’ordre, binaires', async () => {
    const h = harness();
    h.sender.press(PROCHE);
    await settle();
    h.capture.push(10);
    const sent = h.chunks();
    expect(sent.map((c) => c.seq)).toEqual([0, 1]);
    expect(sent.every((c) => c.talkieId === TALKIE_ID && c.data instanceof Uint8Array && c.data.byteLength === 1_000)).toBe(true);
    expect(typeof sent[0]?.capturedAt).toBe('number');
  });

  test('ce qui est capté AVANT l’accusé n’est pas perdu : il part dès que le serveur ouvre', async () => {
    let open: (value: unknown) => void = () => undefined;
    const h = harness({ ack: () => new Promise((resolve) => (open = resolve)) });
    h.sender.press(PROCHE);
    await settle();
    h.capture.push(5);
    expect(h.chunks()).toEqual([]);
    open({ success: true, data: { talkieId: TALKIE_ID, maxDurationMs: 30_000, maxChunkBytes: 16_384 } });
    await settle();
    expect(h.chunks().map((c) => c.seq)).toEqual([0]);
  });

  test('relâcher arrête le micro, envoie le reste puis talkie:end — et revient au repos', async () => {
    const h = harness();
    h.sender.press(PROCHE);
    await settle();
    h.capture.push(7);
    await h.sender.release();
    expect(h.capture.stopped()).toBe(1);
    expect(h.chunks().map((c) => c.seq)).toEqual([0, 1]);
    expect(h.chunks()[1]?.data.byteLength).toBe(400);
    expect(h.ends()).toEqual([{ talkieId: TALKIE_ID }]);
    expect(h.sender.store.getState().phase).toEqual({ kind: 'idle' });
  });

  test('relâcher AVANT l’accusé : la prise de parole part entière et se ferme dès l’ouverture', async () => {
    let open: (value: unknown) => void = () => undefined;
    const h = harness({ ack: () => new Promise((resolve) => (open = resolve)) });
    h.sender.press(PROCHE);
    await settle();
    h.capture.push(3);
    const released = h.sender.release();
    open({ success: true, data: { talkieId: TALKIE_ID, maxDurationMs: 30_000, maxChunkBytes: 16_384 } });
    await released;
    await settle();
    expect(h.chunks().map((c) => c.seq)).toEqual([0]);
    expect(h.ends()).toEqual([{ talkieId: TALKIE_ID }]);
  });

  test('un second appui pendant une prise de parole ne rouvre rien', async () => {
    const h = harness();
    h.sender.press(PROCHE);
    h.sender.press(PROCHE);
    await settle();
    expect(h.wire.emitted.filter((e) => e.event === TALKIE_CLIENT_EVENTS.TALKIE_START)).toHaveLength(1);
  });
});

describe('les limites', () => {
  test('passé la durée maximale servie, la prise de parole se ferme seule et le dit', async () => {
    const h = harness();
    h.sender.press(PROCHE);
    await settle();
    expect(h.timers.at(-1)?.ms).toBe(30_000);
    h.fireTimers();
    await settle();
    expect(h.ends()).toEqual([{ talkieId: TALKIE_ID }]);
    expect(h.outcomes).toEqual(['limit']);
    expect(h.sender.store.getState().phase).toEqual({ kind: 'idle' });
  });

  test('un fragment ne dépasse jamais le plafond servi par le serveur', async () => {
    const h = harness({ ack: () => Promise.resolve({ success: true, data: { talkieId: TALKIE_ID, maxDurationMs: 30_000, maxChunkBytes: 1_000 } }) });
    h.sender.press(PROCHE);
    await settle();
    h.capture.push(4, 400, 10);
    expect(h.chunks().every((c) => c.data.byteLength <= 1_000)).toBe(true);
    expect(h.chunks()).toHaveLength(1);
  });

  test('le serveur ferme MA prise de parole (limite) : le micro s’arrête et rien ne repart', async () => {
    const h = harness();
    const unbind = bindTalkieSender({ socket: h.wire.socket, sender: h.sender });
    h.sender.press(PROCHE);
    await settle();
    h.wire.fire(TALKIE_SERVER_EVENTS.TALKIE_ENDED, { talkieId: TALKIE_ID, fromUserId: 'me', toUserId: PROCHE, reason: 'limit', endedAt: '2026-11-07T10:00:30.000Z' });
    await settle();
    h.capture.push(10);
    expect(h.capture.stopped()).toBe(1);
    expect(h.chunks()).toEqual([]);
    expect(h.outcomes).toEqual(['limit']);
    unbind();
    expect(h.wire.listeners(TALKIE_SERVER_EVENTS.TALKIE_ENDED)).toBe(0);
  });

  test('la fin d’une AUTRE prise de parole (une voix reçue) ne coupe pas la mienne', async () => {
    const h = harness();
    bindTalkieSender({ socket: h.wire.socket, sender: h.sender });
    h.sender.press(PROCHE);
    await settle();
    h.wire.fire(TALKIE_SERVER_EVENTS.TALKIE_ENDED, { talkieId: 'b'.repeat(24), fromUserId: PROCHE, toUserId: 'me', reason: 'cut', endedAt: '2026-11-07T10:00:30.000Z' });
    expect(h.sender.store.getState().phase.kind).toBe('talking');
  });
});

describe('les refus, rendus sans fuite', () => {
  const table = [
    ['TALKIE_NOT_ALLOWED', 'not-allowed'],
    ['TALKIE_BLOCKED', 'voice'],
    ['TALKIE_FALLBACK_VOICE', 'voice'],
    ['TALKIE_E2EE_CONVERSATION', 'e2ee'],
    ['TALKIE_RATE_LIMITED', 'rate-limited'],
    ['TALKIE_UNAVAILABLE', 'failed'],
    ['TALKIE_INVALID', 'failed'],
    ['inconnu', 'failed'],
  ] as const;
  table.forEach(([code, outcome]) =>
    test(`${code} → ${outcome}`, () => {
      expect(outcomeOfRefusal(code)).toBe(outcome);
    }),
  );

  test('un blocage et un repli rendent LE MÊME résultat : un blocage ne se devine pas', () => {
    expect(outcomeOfRefusal('TALKIE_BLOCKED')).toBe(outcomeOfRefusal('TALKIE_FALLBACK_VOICE'));
  });

  test('un refus arrête le micro, n’envoie rien et revient au repos', async () => {
    const h = harness({ ack: () => Promise.resolve({ success: false, error: 'x', code: 'TALKIE_FALLBACK_VOICE' }) });
    h.sender.press(PROCHE);
    await settle();
    await settle();
    h.capture.push(10);
    expect(h.chunks()).toEqual([]);
    expect(h.ends()).toEqual([]);
    expect(h.capture.stopped()).toBe(1);
    expect(h.outcomes).toEqual(['voice']);
    expect(h.sender.store.getState().phase).toEqual({ kind: 'idle' });
  });

  test('hors ligne : rien ne part, le micro ne s’ouvre pas', async () => {
    const capture = fakeCapture();
    const h = harness({ socketPresent: false, capture });
    h.sender.press(PROCHE);
    await settle();
    expect(h.outcomes).toEqual(['offline']);
    expect(h.wire.emitted).toEqual([]);
    expect(h.sender.store.getState().phase).toEqual({ kind: 'idle' });
  });

  test('un accusé qui n’arrive pas (socket tombée) se rend « hors ligne »', async () => {
    const h = harness({ ack: () => Promise.reject(new Error('timeout')) });
    h.sender.press(PROCHE);
    await settle();
    await settle();
    expect(h.outcomes).toEqual(['offline']);
    expect(h.sender.store.getState().phase).toEqual({ kind: 'idle' });
  });

  test('micro refusé : la prise de parole ouverte se ferme aussitôt et le dit', async () => {
    const h = harness({ capture: fakeCapture({ fails: true }) });
    h.sender.press(PROCHE);
    await settle();
    await settle();
    expect(h.outcomes).toEqual(['mic-denied']);
    expect(h.ends()).toEqual([{ talkieId: TALKIE_ID }]);
    expect(h.sender.store.getState().phase).toEqual({ kind: 'idle' });
  });
});
