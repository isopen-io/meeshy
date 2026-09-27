import { describe, expect, test } from 'bun:test';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { createCallRecording, createCallRecordingStore, type CallRecorderHandle, type CallRecordingOutcome } from './call-recording';
import { createCallStore, type ActiveCall } from './call-store';

/**
 * L'ENREGISTREMENT D'UN APPEL, CÔTÉ WEB (#8064) — le contrôleur contre un vrai
 * magasin d'appel, un socket et un enregistreur simulés : ce qu'il ÉMET, ce que
 * l'écran LIT, et quand l'enregistreur tourne. La passerelle est l'autorité :
 * rien ne s'enregistre avant `call:recording-started`, et tout s'arrête à
 * `call:recording-stopped`, à la fin de l'appel ou au premier geste « Arrêter ».
 */

const ME = 'u-me';
const PEER = 'u-peer';
const CALL = 'call-1';
const REC = 'rec-1';

const activeCall = (overrides: Partial<ActiveCall> = {}): ActiveCall => ({
  callId: CALL,
  conversationId: 'c-1',
  media: 'audio',
  direction: 'outgoing',
  isGroup: false,
  title: 'Nadia',
  avatar: null,
  callerName: null,
  phase: { kind: 'connected' },
  connectedAt: 0,
  endedDurationSec: null,
  micMuted: false,
  cameraOn: false,
  facing: 'user',
  screenSharing: false,
  members: {},
  display: 'full',
  localStream: null,
  remoteStreams: {},
  captions: [],
  captionsMode: 'off',
  captionPeers: [],
  transcription: 'idle',
  quality: null,
  ...overrides,
});

const requested = (requesterId: string, requiredUserIds: readonly string[] = [requesterId === ME ? PEER : ME]) => ({
  callId: CALL,
  recordingId: REC,
  requesterId,
  requiredUserIds,
  expiresAt: '2026-09-27T10:00:30.000Z',
});

const started = (recorderId: string) => ({ callId: CALL, recordingId: REC, recorderId, startedAt: '2026-09-27T10:00:05.000Z' });

const stopped = (reason: string, wasRecording: boolean) => ({ callId: CALL, recordingId: REC, reason, byUserId: PEER, wasRecording });

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function harness(options: { readonly ack?: unknown; readonly outcome?: CallRecordingOutcome } = {}) {
  const calls = createCallStore();
  calls.setState({ call: activeCall() });
  const store = createCallRecordingStore();
  const sent: Array<{ readonly event: string; readonly payload: unknown }> = [];
  const recorders: Array<{ readonly callId: string; readonly recordingId: string; stops: number }> = [];
  const recording = createCallRecording({
    store,
    calls,
    viewerId: () => ME,
    transport: () => ({
      connected: () => true,
      emit: (event, payload) => void sent.push({ event, payload }),
      request: async (event, payload) => {
        sent.push({ event, payload });
        return options.ack ?? { success: true, recordingId: REC };
      },
    }),
    loadRecorder: async () => (target) => {
      const entry = { ...target, stops: 0 };
      recorders.push(entry);
      const handle: CallRecorderHandle = {
        stop: async () => {
          entry.stops += 1;
          return options.outcome ?? 'saved';
        },
      };
      return handle;
    },
  });
  return { calls, store, sent, recorders, recording, view: () => store.getState().view, notice: () => store.getState().notice };
}

describe('la demande — rien ne s’enregistre sans l’accord de tous', () => {
  test('demander émet `call:recording-request` et attend l’accord, sans rien enregistrer', async () => {
    const h = harness();
    await h.recording.request();
    expect(h.sent[0]).toEqual({ event: CLIENT_EVENTS.CALL_RECORDING_REQUEST, payload: { callId: CALL } });
    h.recording.receive(SERVER_EVENTS.CALL_RECORDING_REQUESTED, requested(ME));
    expect(h.view()).toMatchObject({ kind: 'pending', mine: true, mustAnswer: false });
    await flush();
    expect(h.recorders).toEqual([]);
  });

  test('une demande refusée par la passerelle revient au repos et le dit', async () => {
    const h = harness({ ack: { success: false, code: 'NO_PEER_TO_CONSENT' } });
    await h.recording.request();
    expect(h.view()).toEqual({ kind: 'idle' });
    expect(h.notice()).toEqual({ kind: 'unavailable', code: 'NO_PEER_TO_CONSENT' });
  });

  test('sans appel identifié, rien ne part', async () => {
    const h = harness();
    h.calls.setState({ call: activeCall({ callId: null }) });
    await h.recording.request();
    expect(h.sent).toEqual([]);
  });

  test('le pair qui doit consentir voit la question ; accepter émet son accord', async () => {
    const h = harness();
    h.recording.receive(SERVER_EVENTS.CALL_RECORDING_REQUESTED, requested(PEER));
    expect(h.view()).toMatchObject({ kind: 'pending', mine: false, mustAnswer: true, requesterId: PEER });
    await h.recording.answer(true);
    expect(h.sent).toEqual([{ event: CLIENT_EVENTS.CALL_RECORDING_CONSENT, payload: { callId: CALL, recordingId: REC, accepted: true } }]);
    expect(h.view()).toMatchObject({ kind: 'pending', mustAnswer: false });
  });

  test('refuser émet le refus ; la passerelle arrête et chacun le lit', async () => {
    const h = harness();
    h.recording.receive(SERVER_EVENTS.CALL_RECORDING_REQUESTED, requested(PEER));
    await h.recording.answer(false);
    expect(h.sent[0]?.payload).toEqual({ callId: CALL, recordingId: REC, accepted: false });
    h.recording.receive(SERVER_EVENTS.CALL_RECORDING_STOPPED, stopped('refused', false));
    expect(h.view()).toEqual({ kind: 'idle' });
    expect(h.notice()).toEqual({ kind: 'stopped', reason: 'refused', wasRecording: false });
  });

  test('une charge mal formée ou d’un autre appel ne change rien (fail-closed)', () => {
    const h = harness();
    h.recording.receive(SERVER_EVENTS.CALL_RECORDING_REQUESTED, { callId: CALL });
    h.recording.receive(SERVER_EVENTS.CALL_RECORDING_STARTED, { ...started(ME), callId: 'other-call' });
    h.recording.receive(SERVER_EVENTS.CALL_RECORDING_STOPPED, { ...stopped('stopped', true), reason: 'nope' });
    expect(h.view()).toEqual({ kind: 'idle' });
  });
});

describe('l’enregistrement — seul l’enregistreur capte, tout le monde le voit', () => {
  test('`call:recording-started` pose l’indicateur chez tous, et lance l’enregistreur chez lui seul', async () => {
    const mine = harness();
    mine.recording.receive(SERVER_EVENTS.CALL_RECORDING_REQUESTED, requested(ME));
    mine.recording.receive(SERVER_EVENTS.CALL_RECORDING_STARTED, started(ME));
    await flush();
    expect(mine.view()).toMatchObject({ kind: 'recording', mine: true });
    expect(mine.recorders.map(({ callId, recordingId }) => ({ callId, recordingId }))).toEqual([{ callId: CALL, recordingId: REC }]);

    const theirs = harness();
    theirs.recording.receive(SERVER_EVENTS.CALL_RECORDING_STARTED, started(PEER));
    await flush();
    expect(theirs.view()).toMatchObject({ kind: 'recording', mine: false, recorderId: PEER });
    expect(theirs.recorders).toEqual([]);
  });

  test('l’arrêt décidé par la passerelle (arrivée d’un participant) arrête l’enregistreur, qui dépose le fichier', async () => {
    const h = harness();
    h.recording.receive(SERVER_EVENTS.CALL_RECORDING_STARTED, started(ME));
    await flush();
    h.recording.receive(SERVER_EVENTS.CALL_RECORDING_STOPPED, stopped('participant-joined', true));
    await flush();
    expect(h.recorders[0]?.stops).toBe(1);
    expect(h.view()).toEqual({ kind: 'idle' });
    expect(h.notice()).toEqual({ kind: 'saved' });
  });

  test('« Arrêter » coupe tout de suite, puis prévient la passerelle', async () => {
    const h = harness();
    h.recording.receive(SERVER_EVENTS.CALL_RECORDING_STARTED, started(ME));
    await flush();
    await h.recording.stop();
    await flush();
    expect(h.recorders[0]?.stops).toBe(1);
    expect(h.sent).toEqual([{ event: CLIENT_EVENTS.CALL_RECORDING_STOP, payload: { callId: CALL, recordingId: REC } }]);
  });

  test('un participant qui retire son accord arrête l’enregistrement d’un autre', async () => {
    const h = harness();
    h.recording.receive(SERVER_EVENTS.CALL_RECORDING_STARTED, started(PEER));
    await h.recording.stop();
    expect(h.sent[0]?.event).toBe(CLIENT_EVENTS.CALL_RECORDING_STOP);
    expect(h.view()).toEqual({ kind: 'idle' });
  });

  test('la fin de l’appel arrête l’enregistreur, même sans événement de la passerelle', async () => {
    const h = harness();
    h.recording.receive(SERVER_EVENTS.CALL_RECORDING_STARTED, started(ME));
    await flush();
    h.calls.setState({ call: null });
    await flush();
    expect(h.recorders[0]?.stops).toBe(1);
    expect(h.view()).toEqual({ kind: 'idle' });
  });

  test('un dépôt qui échoue le dit', async () => {
    const h = harness({ outcome: 'save-failed' });
    h.recording.receive(SERVER_EVENTS.CALL_RECORDING_STARTED, started(ME));
    await flush();
    h.recording.receive(SERVER_EVENTS.CALL_RECORDING_STOPPED, stopped('stopped', true));
    await flush();
    expect(h.notice()).toEqual({ kind: 'save-failed' });
  });

  test('un arrêt arrivé avant le chargement de l’enregistreur l’arrête quand même', async () => {
    const h = harness();
    h.recording.receive(SERVER_EVENTS.CALL_RECORDING_STARTED, started(ME));
    h.recording.receive(SERVER_EVENTS.CALL_RECORDING_STOPPED, stopped('stopped', true));
    await flush();
    await flush();
    expect(h.recorders[0]?.stops).toBe(1);
  });
});
