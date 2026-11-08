import { afterEach, describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import type { SocketClient } from '@/lib/net/socket';

import { NO_LIVE_FRAME, callLiveFrameStore } from './call-live-frame-store';
import { bridgeCallEvents } from './call-socket-bridge';
import { callStore, type ActiveCall } from './call-store';
import { resetCallTransportForTests } from './call-transport';

/**
 * LE PONT BRANCHE LA SESSION DU CADRE SUR `call:frame-selected` (#16943) —
 * par `import()`, sans attendre le moteur d'appel ; le pont détaché, plus rien n'arrive.
 */

const CALL = '6650c0ffee0000000000c411';

const duo: ActiveCall = {
  callId: CALL,
  conversationId: 'c-1',
  media: 'video',
  direction: 'outgoing',
  isGroup: false,
  title: 'Awa',
  avatar: null,
  callerName: null,
  initiatorId: null,
  invitedBy: null,
  phase: { kind: 'connected' },
  connectedAt: 0,
  endedDurationSec: null,
  micMuted: false,
  cameraOn: true,
  facing: 'user',
  screenSharing: false,
  members: { 'u-awa': { userId: 'u-awa', name: 'Awa', avatar: null, micMuted: false, cameraOn: true, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected' } },
  display: 'full',
  localStream: null,
  remoteStreams: {},
  captions: [],
  captionsMode: 'off',
  captionPeers: [],
  transcription: 'idle',
  quality: null,
  preview: null,
  previewed: false,
};

const fakeSocket = () => {
  const handlers = new Map<string, Array<(payload: unknown) => void>>();
  const socket: SocketClient = {
    connected: false,
    connect: () => undefined,
    disconnect: () => undefined,
    on: (event, handler) => void handlers.set(event, [...(handlers.get(event) ?? []), handler as (payload: unknown) => void]),
    off: (event, handler) => void handlers.set(event, (handlers.get(event) ?? []).filter((entry) => entry !== handler)),
    emit: () => undefined,
  };
  return { socket, fire: (event: string, payload: unknown) => (handlers.get(event) ?? []).forEach((handler) => handler(payload)) };
};

/** La session se branche par `import()` : on la laisse arriver, et se brancher ou se débrancher. */
const settled = async (): Promise<void> => {
  await import('./call-live-frame-live');
  await new Promise((resolve) => setTimeout(resolve, 0));
};

afterEach(() => {
  resetCallTransportForTests();
  callStore.setState({ call: null });
  callLiveFrameStore.setState(NO_LIVE_FRAME, true);
});

describe('le pont du cadre en direct', () => {
  test('une proposition reçue pose sa carte ; le pont détaché, plus rien n’arrive', async () => {
    callStore.setState({ call: duo });
    const { socket, fire } = fakeSocket();
    const detach = bridgeCallEvents(socket);
    await settled();
    fire(SERVER_EVENTS.CALL_FRAME_SELECTED, { callId: CALL, userId: 'u-awa', frameId: 'jovial.confettis', texts: { name: 'Awa' }, at: '2026-11-08T12:00:00.000Z' });
    await settled();
    expect(callLiveFrameStore.getState().proposal).toEqual({ frameId: 'jovial.confettis', from: 'Awa' });
    detach();
    await settled();
    callLiveFrameStore.setState(NO_LIVE_FRAME, true);
    fire(SERVER_EVENTS.CALL_FRAME_SELECTED, { callId: CALL, userId: 'u-awa', frameId: 'jovial.autre', at: '2026-11-08T12:00:01.000Z' });
    await settled();
    expect(callLiveFrameStore.getState().proposal).toBeNull();
  });
});
