import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { apiDeps } from '@/lib/api/deps';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import type { SocketClient } from '@/lib/net/socket';

import { createCallLiveFrame } from './call-live-frame';
import { callLiveFrameStore } from './call-live-frame-store';
import { callStore } from './call-store';
import { currentCallTransport } from './call-transport';

/**
 * **LE CADRE EN DIRECT DE L'APPLICATION** (#16943) — l'instance que le pont de
 * connexion (`call-socket-bridge.ts`) branche sur le socket par `import()`, que l'écran d'appel
 * et le mode Montage lisent. Légère : le peintre des cadres reste dans son
 * chunk, chargé quand un cadre se montre.
 */
export const callLiveFrame = createCallLiveFrame({
  store: callLiveFrameStore,
  calls: callStore,
  transport: currentCallTransport,
  myName: () => resolveViewer({ source: apiDeps.source, session: sessionStore.getState().session }).displayName,
});

export const CALL_LIVE_FRAME_SERVER_EVENTS: readonly string[] = [SERVER_EVENTS.CALL_FRAME_SELECTED];

/** La session suit l'appel et lit seule `call:frame-selected` ; rend ce qui la débranche. */
export function attachCallLiveFrame(socket: SocketClient): () => void {
  callLiveFrame.start();
  const handlers = CALL_LIVE_FRAME_SERVER_EVENTS.map((event) => {
    const handler = (payload: unknown): void => callLiveFrame.receive(event, payload);
    socket.on(event, handler);
    return [event, handler] as const;
  });
  return () => {
    for (const [event, handler] of handlers) socket.off(event, handler);
    callLiveFrame.stop();
  };
}
