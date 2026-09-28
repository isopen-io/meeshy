import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { decodeSignal } from './call-decode';
import type { ActiveCall } from './call-store';
import type { LinkState, OutgoingSignal, PeerLink, PeerLinkDeps } from './peer-link';

/**
 * **L'APERÇU AVANT DÉCROCHÉ, DANS LE MOTEUR** (#8480) — composé par
 * `engine.ts`, qui reste seul à écrire l'appel.
 *
 * - **Appelé** : dès que l'appel 1:1 sonne, il demande l'aperçu
 *   (`call:preview-request`). L'offre de l'APPELANT, et de lui seul, ouvre un
 *   lien en RÉCEPTION SEULE : ni micro ni caméra n'y sont attachés, ils ne
 *   partent qu'au décroché, par le vrai lien. Ce qu'il reçoit est `preview`,
 *   que l'écran de sonnerie montre — muet tant qu'on n'active pas le son.
 * - **Appelant** : une demande pour SON appel qui sonne ouvre un lien qui
 *   offre son média local, les mêmes pistes que l'appel : un micro coupé
 *   pendant la sonnerie ne s'entend donc pas. `previewed` dit à l'écran que
 *   l'appelé le voit.
 *
 * Tout passe par `call:preview-signal`, jamais par `call:signal`, où une
 * réponse décrocherait l'appel. L'aperçu survit au décroché jusqu'à la
 * connexion du vrai lien (`settle`), pour que l'image ne clignote pas.
 */

export type EnginePreviewDeps = {
  readonly read: () => ActiveCall | null;
  readonly update: (fn: (call: ActiveCall) => ActiveCall) => void;
  readonly emit: (event: string, payload: unknown) => void;
  readonly viewerId: () => string;
  readonly createLink: (deps: PeerLinkDeps) => PeerLink;
  readonly createStream: (tracks: readonly MediaStreamTrack[]) => MediaStream;
  readonly localStream: () => MediaStream | null;
  readonly iceServers: () => readonly RTCIceServer[];
};

export type EnginePreview = {
  /** L'appel entrant sonne : demander l'aperçu. */
  readonly ringing: () => void;
  readonly receive: (event: string, payload: unknown) => void;
  /** La caméra de l'appelant a changé pendant la sonnerie. */
  readonly setVideoTrack: (track: MediaStreamTrack | null) => void;
  /** Le vrai lien est connecté, ou l'appel s'arrête : l'aperçu n'a plus lieu d'être. */
  readonly close: () => void;
};

type Open = { readonly link: PeerLink; readonly callId: string; readonly peer: string };

const str = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

function decodeRequested(payload: unknown): { readonly callId: string; readonly userId: string } | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const record = payload as Record<string, unknown>;
  const callId = str(record.callId);
  const userId = str(record.userId);
  return callId === null || userId === null ? null : { callId, userId };
}

export function createEnginePreview(deps: EnginePreviewDeps): EnginePreview {
  let open: Open | null = null;

  const close = (): void => {
    if (open === null) return;
    open.link.close();
    open = null;
    deps.update((call) => (call.preview === null && !call.previewed ? call : { ...call, preview: null, previewed: false }));
  };

  const connect = (callId: string, peer: string, localStream: MediaStream, receiveOnly: boolean): PeerLink => {
    close();
    const onState = (state: LinkState): void => {
      if (open?.link !== link) return;
      if (state === 'failed') close();
      else if (!receiveOnly) deps.update((call) => ({ ...call, previewed: state === 'connected' }));
    };
    const link = deps.createLink({
      localUserId: deps.viewerId(),
      remoteUserId: peer,
      iceServers: deps.iceServers(),
      localStream,
      receiveOnly,
      send: (signal: OutgoingSignal) => {
        if (open?.link === link) deps.emit(CLIENT_EVENTS.CALL_PREVIEW_SIGNAL, { callId, signal: { ...signal, from: deps.viewerId(), to: peer } });
      },
      onRemoteStream: (remote) => {
        if (open?.link === link && receiveOnly) deps.update((call) => ({ ...call, preview: deps.createStream(remote.getTracks()) }));
      },
      onState,
    });
    open = { link, callId, peer };
    return link;
  };

  const ringingCall = (call: ActiveCall | null, callId: string): call is ActiveCall => call !== null && call.callId === callId && !call.isGroup;

  const onRequested = (payload: unknown): void => {
    const requested = decodeRequested(payload);
    const call = deps.read();
    const stream = deps.localStream();
    if (requested === null || stream === null || !ringingCall(call, requested.callId)) return;
    if (call.direction !== 'outgoing' || call.phase.kind !== 'outgoing' || requested.userId === deps.viewerId()) return;
    void connect(requested.callId, requested.userId, stream, false).offer().catch(close);
  };

  const onSignal = async (payload: unknown): Promise<void> => {
    const signal = decodeSignal(payload);
    const call = deps.read();
    if (signal === null || signal.to !== deps.viewerId() || !ringingCall(call, signal.callId)) return;
    const callee = call.direction === 'incoming' && signal.from === call.initiatorId;
    const current = open !== null && open.callId === signal.callId && open.peer === signal.from ? open.link : null;
    const opening = current === null && callee && call.phase.kind === 'incoming' && signal.kind === 'description' && signal.type === 'offer';
    const link = opening ? connect(signal.callId, signal.from, deps.createStream([]), true) : current;
    if (link === null) return;
    try {
      if (signal.kind === 'description') await link.receiveDescription({ type: signal.type, sdp: signal.sdp }, signal.epoch);
      else await link.receiveCandidate({ candidate: signal.candidate, sdpMid: signal.sdpMid, sdpMLineIndex: signal.sdpMLineIndex }, signal.epoch);
    } catch {
      /* Un aperçu refusé par le navigateur n'est qu'un aperçu en moins : l'appel sonne toujours. */
    }
  };

  return {
    ringing: () => {
      const call = deps.read();
      if (call === null || call.callId === null || call.isGroup || call.phase.kind !== 'incoming') return;
      deps.emit(CLIENT_EVENTS.CALL_PREVIEW_REQUEST, { callId: call.callId });
    },
    receive: (event, payload) => {
      if (event === SERVER_EVENTS.CALL_PREVIEW_REQUESTED) onRequested(payload);
      else if (event === SERVER_EVENTS.CALL_PREVIEW_SIGNAL) void onSignal(payload);
    },
    setVideoTrack: (track) => void open?.link.setVideoTrack(track).catch(() => undefined),
    close,
  };
}
