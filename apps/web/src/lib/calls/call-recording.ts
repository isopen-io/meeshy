import {
  CALL_RECORDING_ERROR_CODES,
  CALL_RECORDING_STOP_REASONS,
  type CallRecordingErrorCode,
  type CallRecordingStopReason,
} from '@meeshy/shared/types/call-recording';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';
import { createStore, type StoreApi } from 'zustand/vanilla';

import type { CallStoreApi } from './call-store';
import type { CallTransport } from './call-transport';

/**
 * **L'ENREGISTREMENT D'UN APPEL, CÔTÉ WEB** (#8064, D-139) — l'état que l'écran
 * lit et les trois gestes (demander, répondre, arrêter). La passerelle est
 * l'autorité : l'enregistreur ne démarre qu'à `call:recording-started`, qui
 * n'est diffusé qu'une fois TOUS les autres participants d'accord. Le module
 * est léger et chargé avec la connexion ; ce qui capte (WebAudio,
 * `MediaRecorder`, dépôt du fichier) est un chunk à part
 * (`call-recording-runtime.ts`), chargé chez l'enregistreur seul.
 */

export type CallRecordingView =
  | { readonly kind: 'idle' }
  | { readonly kind: 'asking'; readonly callId: string }
  | {
      readonly kind: 'pending';
      readonly callId: string;
      readonly recordingId: string;
      readonly requesterId: string;
      readonly mine: boolean;
      readonly mustAnswer: boolean;
    }
  | {
      readonly kind: 'recording';
      readonly callId: string;
      readonly recordingId: string;
      readonly recorderId: string;
      readonly mine: boolean;
    };

export type CallRecordingNotice =
  | { readonly kind: 'stopped'; readonly reason: CallRecordingStopReason; readonly wasRecording: boolean }
  | { readonly kind: 'unavailable'; readonly code: CallRecordingErrorCode }
  | { readonly kind: 'saved' }
  | { readonly kind: 'save-failed' };

export type CallRecordingState = { readonly view: CallRecordingView; readonly notice: CallRecordingNotice | null };

export type CallRecordingStoreApi = StoreApi<CallRecordingState>;

export type CallRecordingOutcome = 'saved' | 'save-failed' | 'empty';

export type CallRecorderHandle = { readonly stop: () => Promise<CallRecordingOutcome> };

export type CallRecorderTarget = { readonly callId: string; readonly recordingId: string };

export type CallRecorderStart = (target: CallRecorderTarget) => CallRecorderHandle;

export type CallRecordingDeps = {
  readonly store: CallRecordingStoreApi;
  readonly calls: CallStoreApi;
  readonly viewerId: () => string;
  readonly transport: () => CallTransport | null;
  readonly loadRecorder: () => Promise<CallRecorderStart>;
};

export const CALL_RECORDING_SERVER_EVENTS: readonly string[] = [
  SERVER_EVENTS.CALL_RECORDING_REQUESTED,
  SERVER_EVENTS.CALL_RECORDING_STARTED,
  SERVER_EVENTS.CALL_RECORDING_STOPPED,
];

const ACK_TIMEOUT_MS = 8_000;

const IDLE: CallRecordingState = { view: { kind: 'idle' }, notice: null };

export function createCallRecordingStore(): CallRecordingStoreApi {
  return createStore<CallRecordingState>(() => IDLE);
}

type Payload = Readonly<Record<string, unknown>>;

const recordOf = (value: unknown): Payload | null => (typeof value === 'object' && value !== null ? (value as Payload) : null);

const text = (payload: Payload, key: string): string | null => {
  const value = payload[key];
  return typeof value === 'string' && value !== '' ? value : null;
};

const isStopReason = (value: unknown): value is CallRecordingStopReason =>
  CALL_RECORDING_STOP_REASONS.some((reason) => reason === value);

const isErrorCode = (value: unknown): value is CallRecordingErrorCode => CALL_RECORDING_ERROR_CODES.some((code) => code === value);

const ackOf = (raw: unknown): { readonly ok: true; readonly recordingId: string } | { readonly ok: false; readonly code: CallRecordingErrorCode } => {
  const ack = recordOf(raw);
  if (ack?.success === true && typeof ack.recordingId === 'string') return { ok: true, recordingId: ack.recordingId };
  return { ok: false, code: isErrorCode(ack?.code) ? ack.code : 'INTERNAL_ERROR' };
};

const sameRecording = (view: CallRecordingView, recordingId: string): boolean =>
  (view.kind === 'pending' || view.kind === 'recording') && view.recordingId === recordingId;

export function createCallRecording(deps: CallRecordingDeps) {
  const { store } = deps;
  const set = (patch: Partial<CallRecordingState>): void => store.setState({ ...store.getState(), ...patch });
  const liveCallId = (): string | null => {
    const call = deps.calls.getState().call;
    return call === null || call.phase.kind === 'ended' ? null : call.callId;
  };

  const onRequested = (payload: Payload): void => {
    const recordingId = text(payload, 'recordingId');
    const requesterId = text(payload, 'requesterId');
    const required = payload.requiredUserIds;
    if (recordingId === null || requesterId === null || !Array.isArray(required)) return;
    const viewer = deps.viewerId();
    set({
      view: {
        kind: 'pending',
        callId: String(payload.callId),
        recordingId,
        requesterId,
        mine: requesterId === viewer,
        mustAnswer: required.includes(viewer),
      },
      notice: null,
    });
  };

  const onStarted = (payload: Payload): void => {
    const recordingId = text(payload, 'recordingId');
    const recorderId = text(payload, 'recorderId');
    if (recordingId === null || recorderId === null) return;
    set({
      view: { kind: 'recording', callId: String(payload.callId), recordingId, recorderId, mine: recorderId === deps.viewerId() },
      notice: null,
    });
  };

  const onStopped = (payload: Payload): void => {
    const recordingId = text(payload, 'recordingId');
    if (recordingId === null || !isStopReason(payload.reason) || !sameRecording(store.getState().view, recordingId)) return;
    set({ view: { kind: 'idle' }, notice: { kind: 'stopped', reason: payload.reason, wasRecording: payload.wasRecording === true } });
  };

  const receive = (event: string, raw: unknown): void => {
    const payload = recordOf(raw);
    if (payload === null || text(payload, 'callId') === null || payload.callId !== liveCallId()) return;
    if (event === SERVER_EVENTS.CALL_RECORDING_REQUESTED) onRequested(payload);
    else if (event === SERVER_EVENTS.CALL_RECORDING_STARTED) onStarted(payload);
    else if (event === SERVER_EVENTS.CALL_RECORDING_STOPPED) onStopped(payload);
  };

  const request = async (): Promise<void> => {
    const callId = liveCallId();
    const transport = deps.transport();
    if (callId === null || transport === null || store.getState().view.kind !== 'idle') return;
    set({ view: { kind: 'asking', callId }, notice: null });
    const ack = ackOf(await transport.request(CLIENT_EVENTS.CALL_RECORDING_REQUEST, { callId }, ACK_TIMEOUT_MS).catch(() => null));
    const view = store.getState().view;
    if (ack.ok) {
      if (view.kind === 'asking') {
        set({ view: { kind: 'pending', callId, recordingId: ack.recordingId, requesterId: deps.viewerId(), mine: true, mustAnswer: false } });
      }
      return;
    }
    if (view.kind === 'asking') set({ view: { kind: 'idle' }, notice: { kind: 'unavailable', code: ack.code } });
  };

  const answer = async (accepted: boolean): Promise<void> => {
    const view = store.getState().view;
    const transport = deps.transport();
    if (view.kind !== 'pending' || !view.mustAnswer || transport === null) return;
    set({ view: { ...view, mustAnswer: false } });
    await transport
      .request(CLIENT_EVENTS.CALL_RECORDING_CONSENT, { callId: view.callId, recordingId: view.recordingId, accepted }, ACK_TIMEOUT_MS)
      .catch(() => null);
  };

  const stop = async (): Promise<void> => {
    const view = store.getState().view;
    if (view.kind !== 'pending' && view.kind !== 'recording') return;
    set({ view: { kind: 'idle' }, notice: { kind: 'stopped', reason: 'stopped', wasRecording: view.kind === 'recording' } });
    await deps
      .transport()
      ?.request(CLIENT_EVENTS.CALL_RECORDING_STOP, { callId: view.callId, recordingId: view.recordingId }, ACK_TIMEOUT_MS)
      .catch(() => null);
  };

  let running: { readonly recordingId: string; readonly handle: Promise<CallRecorderHandle> } | null = null;

  const finish = (active: NonNullable<typeof running>): void => {
    void active.handle
      .then((handle) => handle.stop())
      .catch((): CallRecordingOutcome => 'save-failed')
      .then((outcome) => {
        if (outcome === 'empty' || store.getState().view.kind !== 'idle') return;
        set({ notice: { kind: outcome } });
      });
  };

  const drive = (): void => {
    const view = store.getState().view;
    const wanted = view.kind === 'recording' && view.mine ? view.recordingId : null;
    if (running !== null && running.recordingId !== wanted) {
      const active = running;
      running = null;
      finish(active);
    }
    if (wanted === null || running !== null || view.kind !== 'recording') return;
    const target = { callId: view.callId, recordingId: wanted };
    running = { recordingId: wanted, handle: deps.loadRecorder().then((start) => start(target)) };
  };

  const followCall = (): void => {
    const view = store.getState().view;
    if (view.kind === 'idle' || view.callId === liveCallId()) return;
    set({ view: { kind: 'idle' }, notice: null });
  };

  const dismiss = (): void => set({ notice: null });

  const detachStore = store.subscribe(drive);
  const detachCalls = deps.calls.subscribe(followCall);

  return {
    receive,
    request,
    answer,
    stop,
    dismiss,
    detach: () => {
      detachStore();
      detachCalls();
    },
  };
}

export type CallRecordingController = ReturnType<typeof createCallRecording>;
