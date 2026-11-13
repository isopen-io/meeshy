import type { SocketClient } from '@/lib/net/socket';
import { TALKIE_CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events/talkie-event-names';

import { createTalkieSender, type TalkieCaptureFactory, type TalkieSendOutcome, type TalkieVoiceCopy } from './talkie-sender';

/** Le banc d'essai de l'émetteur du talkie, partagé par ses témoins (#16641, #16698). */
export const PROCHE = '64b000000000000000000001';
export const TALKIE_ID = 'a'.repeat(24);

type Emitted = { readonly event: string; readonly payload: unknown };

export function fakeSocket(ack: () => Promise<unknown>) {
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

export const accepted = () => Promise.resolve({ success: true, data: { talkieId: TALKIE_ID, maxDurationMs: 30_000, maxChunkBytes: 16_384 } });

export function fakeCapture({ fails = false, slowStop }: { readonly fails?: boolean; readonly slowStop?: (done: () => void) => void } = {}) {
  let frame: ((bytes: Uint8Array, durationMs: number) => void) | null = null;
  let stopped = 0;
  const factory: TalkieCaptureFactory = async ({ onFrame }) => {
    if (fails) throw new Error('NotAllowedError');
    frame = onFrame;
    return {
      stop: async () => {
        stopped += 1;
        if (slowStop !== undefined) await new Promise<void>((resolve) => slowStop(resolve));
      },
    };
  };
  return {
    factory,
    push: (count: number, bytes = 200, durationMs = 50) => Array.from({ length: count }, () => frame?.(new Uint8Array(bytes).fill(7), durationMs)),
    stopped: () => stopped,
  };
}

export function harness({
  ack = accepted,
  capture = fakeCapture(),
  socketPresent = true,
  copied = true,
}: { readonly ack?: () => Promise<unknown>; readonly capture?: ReturnType<typeof fakeCapture>; readonly socketPresent?: boolean; readonly copied?: boolean } = {}) {
  const wire = fakeSocket(ack);
  const outcomes: TalkieSendOutcome[] = [];
  const timers: Array<{ readonly run: () => void; readonly ms: number; cancelled: boolean }> = [];
  let clock = 1_000;
  const copies: TalkieVoiceCopy[] = [];
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
    copier: async (copy) => {
      copies.push(copy);
      return copied;
    },
  });
  const chunks = () => wire.emitted.filter((e) => e.event === TALKIE_CLIENT_EVENTS.TALKIE_SEND_CHUNK).map((e) => e.payload as { talkieId: string; seq: number; data: Uint8Array; capturedAt: number });
  const ends = () => wire.emitted.filter((e) => e.event === TALKIE_CLIENT_EVENTS.TALKIE_END).map((e) => e.payload);
  const fireTimers = () => timers.filter((t) => !t.cancelled).forEach((t) => t.run());
  return { sender, wire, outcomes, copies, capture, chunks, ends, timers, fireTimers, tick: (ms: number) => (clock += ms) };
}

export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

