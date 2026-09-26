import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

/**
 * **UN PAIR QUI DÉCROCHE, POUR LES GATES** (#8063) — le bouchon de socket
 * (`fixtures-realtime.ts`) accuse les appels mais personne n'y répond : un
 * appel de gate sonne jusqu'à son délai, et rien de ce qui n'existe qu'une
 * fois CONNECTÉ (le partage d'écran) ne s'y mesure. Ce pair répond, dans la
 * page même, par une vraie `RTCPeerConnection` : il rejoint l'appel, répond à
 * l'offre, échange ses candidats, et peut à son tour partager un écran
 * dessiné (un canevas) — le chemin du RECEVEUR.
 *
 * Il ne s'arme que sur demande (`CALL_PEER_FLAG` de `fixtures-call-ack.ts`,
 * posé par le gate avant le chargement) : les autres gates d'appel
 * gardent un appel qui SONNE. Chargé par `import()` depuis le bouchon, donc
 * absent de tout build `gateway` et de tout chemin qui n'appelle pas.
 */

export const CALL_PEER_USER_ID = 'u-fixture-call-peer';
export const CALL_PEER_PARTICIPANT_ID = 'p-fixture-call-peer';
export const CALL_PEER_NAME = 'Nadia Benali';
const JOIN_DELAY_MS = 300;

type Fire = (event: string, payload: unknown) => void;

type SignalOut = { readonly type: string; readonly sdp?: string; readonly candidate?: string; readonly sdpMid?: string | null; readonly sdpMLineIndex?: number | null; readonly negotiationId?: number; readonly from?: string; readonly to?: string };

export type FixtureCallPeerDeps = {
  readonly fire: Fire;
  readonly createConnection: () => RTCPeerConnection;
  readonly createScreenTrack: () => MediaStreamTrack;
  readonly schedule: (fn: () => void, ms: number) => void;
};

export type FixtureCallPeerProbe = {
  /** Chaque annonce reçue du client : `call:toggle-screen`, `call:toggle-video`, `call:toggle-audio`. */
  readonly toggles: ReadonlyArray<{ readonly event: string; readonly enabled: boolean }>;
  /** Images vidéo décodées par le pair : > 0 quand l'écran partagé lui ARRIVE. */
  readonly videoFrames: () => Promise<number>;
  readonly share: () => void;
  readonly stopShare: () => void;
};

export type FixtureCallPeer = {
  readonly initiated: (callId: string) => void;
  readonly emitted: (event: string, payload: unknown) => void;
  readonly probe: FixtureCallPeerProbe;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export function createFixtureCallPeer(deps: FixtureCallPeerDeps): FixtureCallPeer {
  let callId: string | null = null;
  let viewerId: string | null = null;
  let pc: RTCPeerConnection | null = null;
  let epoch = 0;
  let screen: MediaStreamTrack | null = null;
  const toggles: Array<{ readonly event: string; readonly enabled: boolean }> = [];

  const signal = (payload: SignalOut): void => {
    if (callId === null || viewerId === null) return;
    deps.fire(SERVER_EVENTS.CALL_SIGNAL, { callId, signal: { ...payload, from: CALL_PEER_USER_ID, to: viewerId, negotiationId: epoch } });
  };

  const connection = (): RTCPeerConnection => {
    if (pc !== null) return pc;
    const created = deps.createConnection();
    created.onicecandidate = (event) => {
      const candidate = event.candidate;
      if (candidate === null || candidate.candidate === '') return;
      signal({ type: 'ice-candidate', candidate: candidate.candidate, sdpMid: candidate.sdpMid, sdpMLineIndex: candidate.sdpMLineIndex });
    };
    created.onnegotiationneeded = () => {
      if (created.signalingState !== 'stable' || created.remoteDescription === null) return;
      epoch += 1;
      void created
        .setLocalDescription()
        .then(() => signal({ type: 'offer', sdp: created.localDescription?.sdp ?? '' }))
        .catch(() => undefined);
    };
    pc = created;
    return created;
  };

  const received = async (raw: unknown): Promise<void> => {
    if (!isRecord(raw) || !isRecord(raw.signal)) return;
    const incoming = raw.signal;
    if (incoming.to !== CALL_PEER_USER_ID || typeof incoming.from !== 'string') return;
    viewerId = incoming.from;
    epoch = Math.max(epoch, typeof incoming.negotiationId === 'number' ? incoming.negotiationId : 0);
    const peer = connection();
    if (incoming.type === 'ice-candidate' && typeof incoming.candidate === 'string') {
      await peer.addIceCandidate({ candidate: incoming.candidate, sdpMid: typeof incoming.sdpMid === 'string' ? incoming.sdpMid : null, sdpMLineIndex: typeof incoming.sdpMLineIndex === 'number' ? incoming.sdpMLineIndex : null });
      return;
    }
    if (typeof incoming.sdp !== 'string') return;
    if (incoming.type === 'answer') {
      await peer.setRemoteDescription({ type: 'answer', sdp: incoming.sdp });
      return;
    }
    await peer.setRemoteDescription({ type: 'offer', sdp: incoming.sdp });
    await peer.setLocalDescription();
    signal({ type: 'answer', sdp: peer.localDescription?.sdp ?? '' });
  };

  const videoSender = (): RTCRtpTransceiver | null => pc?.getTransceivers().find((transceiver) => transceiver.receiver.track.kind === 'video') ?? null;

  const announce = (enabled: boolean): void => {
    if (callId === null) return;
    deps.fire(SERVER_EVENTS.CALL_MEDIA_TOGGLED, { callId, participantId: CALL_PEER_PARTICIPANT_ID, userId: CALL_PEER_USER_ID, mediaType: 'screen', enabled });
  };

  const TOGGLES: ReadonlySet<string> = new Set([CLIENT_EVENTS.CALL_TOGGLE_SCREEN, CLIENT_EVENTS.CALL_TOGGLE_VIDEO, CLIENT_EVENTS.CALL_TOGGLE_AUDIO]);

  return {
    initiated: (id) => {
      if (callId === id) return;
      callId = id;
      deps.schedule(() => {
        deps.fire(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, {
          callId: id,
          participant: { id: CALL_PEER_PARTICIPANT_ID, userId: CALL_PEER_USER_ID, username: 'nadia', displayName: CALL_PEER_NAME, isAudioEnabled: true, isVideoEnabled: false },
        });
      }, JOIN_DELAY_MS);
    },
    emitted: (event, payload) => {
      if (event === CLIENT_EVENTS.CALL_SIGNAL) {
        void received(payload).catch(() => undefined);
        return;
      }
      if (TOGGLES.has(event) && isRecord(payload) && typeof payload.enabled === 'boolean') toggles.push({ event, enabled: payload.enabled });
    },
    probe: {
      toggles,
      videoFrames: async () => {
        const report = await pc?.getStats();
        let frames = 0;
        report?.forEach((entry: Record<string, unknown>) => {
          if (entry.type === 'inbound-rtp' && entry.kind === 'video' && typeof entry.framesDecoded === 'number') frames += entry.framesDecoded;
        });
        return frames;
      },
      share: () => {
        const transceiver = videoSender();
        if (transceiver === null || screen !== null) return;
        screen = deps.createScreenTrack();
        transceiver.direction = 'sendrecv';
        void transceiver.sender.replaceTrack(screen).then(() => announce(true));
      },
      stopShare: () => {
        const transceiver = videoSender();
        screen?.stop();
        screen = null;
        void transceiver?.sender.replaceTrack(null).then(() => announce(false));
      },
    },
  };
}

/** Un « écran » dessiné — un canevas animé, ce qu'un vrai écran enverrait. */
export function canvasScreenTrack(): MediaStreamTrack {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const context = canvas.getContext('2d');
  let tick = 0;
  const draw = (): void => {
    if (context === null) return;
    context.fillStyle = '#1e293b';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#f8fafc';
    context.font = 'bold 64px sans-serif';
    context.fillText(`Écran partagé ${tick}`, 80, 360);
    tick += 1;
  };
  draw();
  setInterval(draw, 100);
  const track = canvas.captureStream(10).getVideoTracks()[0];
  if (track === undefined) throw new Error('canvas-capture-missing');
  return track;
}
