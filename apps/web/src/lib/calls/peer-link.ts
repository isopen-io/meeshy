/**
 * **UN LIEN PAIR-À-PAIR** (#6382) — une `RTCPeerConnection` vers UN membre de
 * l'appel. Un appel direct en tient une, un appel de groupe une par membre
 * (maillage, `mode: 'p2p'` : la passerelle relaie, elle ne mixe rien).
 *
 * Trois règles, reprises d'iOS (`CallManager.swift` § 3.5) pour que le web
 * parle la même langue que l'app :
 *
 * - **négociation parfaite (W3C)** : le plus petit identifiant est POLI et
 *   cède en cas de collision d'offres, l'autre l'emporte ;
 * - **époque de négociation** (`negotiationId`) : chaque offre émise ouvre une
 *   époque, la réponse et les candidats la reprennent, et un signal d'une
 *   époque plus ancienne que la plus haute vue est écarté ;
 * - **pas de munging SDP** : Opus + RED passent par `setCodecPreferences`
 *   (ADR-4 iOS — un RED injecté dans le SDP a rendu l'audio muet après ICE).
 *
 * La reprise ICE : `disconnected` attend 3 s avant de relancer, `failed`
 * relance tout de suite, puis 2 → 16 s entre deux tentatives, 5 au plus.
 */

export type LinkState = 'connecting' | 'connected' | 'reconnecting' | 'failed';

export type OutgoingSignal =
  | { readonly type: 'offer' | 'answer'; readonly sdp: string; readonly negotiationId: number }
  | { readonly type: 'ice-candidate'; readonly candidate: string; readonly sdpMid?: string; readonly sdpMLineIndex?: number; readonly negotiationId: number };

export type PeerLinkDeps = {
  readonly localUserId: string;
  readonly remoteUserId: string;
  readonly iceServers: readonly RTCIceServer[];
  readonly localStream: MediaStream;
  readonly send: (signal: OutgoingSignal) => void;
  readonly onRemoteStream: (stream: MediaStream) => void;
  readonly onState: (state: LinkState) => void;
  readonly createConnection?: (config: RTCConfiguration) => RTCPeerConnection;
  readonly createStream?: () => MediaStream;
  readonly schedule?: (fn: () => void, ms: number) => unknown;
  readonly cancel?: (handle: unknown) => void;
};

export type PeerLink = {
  /** L'offre initiale — le membre DÉJÀ dans l'appel l'envoie au nouveau venu. */
  readonly offer: () => Promise<void>;
  readonly receiveDescription: (description: { readonly type: 'offer' | 'answer'; readonly sdp: string }, epoch: number) => Promise<void>;
  readonly receiveCandidate: (candidate: RTCIceCandidateInit, epoch: number) => Promise<void>;
  /** `null` coupe la caméra sans renégocier ; une piste l'active (renégocie si la ligne vidéo ne sortait pas). */
  readonly setVideoTrack: (track: MediaStreamTrack | null) => Promise<void>;
  readonly setAudioTrack: (track: MediaStreamTrack | null) => Promise<void>;
  readonly setIceServers: (servers: readonly RTCIceServer[]) => void;
  readonly connection: () => RTCPeerConnection;
  readonly close: () => void;
};

export const ICE_DISCONNECT_GRACE_MS = 3_000;
export const ICE_RESTART_MAX_ATTEMPTS = 5;
const RESTART_BACKOFF_BASE_MS = 2_000;
const RESTART_BACKOFF_MAX_MS = 16_000;

export function isPolitePeer(localUserId: string, remoteUserId: string): boolean {
  return localUserId !== '' && remoteUserId !== '' && localUserId !== remoteUserId && localUserId < remoteUserId;
}

export function isStaleEpoch(incoming: number, highWaterMark: number): boolean {
  return incoming < highWaterMark;
}

export function restartBackoffMs(attempt: number): number {
  return attempt <= 1 ? 0 : Math.min(RESTART_BACKOFF_BASE_MS * 2 ** (attempt - 2), RESTART_BACKOFF_MAX_MS);
}

function preferOpusRed(transceiver: RTCRtpTransceiver): void {
  if (typeof transceiver.setCodecPreferences !== 'function') return;
  const capabilities = typeof RTCRtpReceiver === 'undefined' ? null : RTCRtpReceiver.getCapabilities?.('audio');
  const codecs = capabilities?.codecs ?? [];
  const preferred = [
    ...codecs.filter((codec) => codec.mimeType.toLowerCase() === 'audio/opus'),
    ...codecs.filter((codec) => codec.mimeType.toLowerCase() === 'audio/red'),
    ...codecs.filter((codec) => !['audio/opus', 'audio/red'].includes(codec.mimeType.toLowerCase())),
  ];
  if (preferred.length === 0) return;
  try {
    transceiver.setCodecPreferences(preferred);
  } catch {
    /* Navigateur sans préférence de codec : la négociation par défaut tient. */
  }
}

const kindOf = (transceiver: RTCRtpTransceiver): string | null => transceiver.receiver.track?.kind ?? transceiver.sender.track?.kind ?? null;

export function createPeerLink(deps: PeerLinkDeps): PeerLink {
  const schedule = deps.schedule ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const cancel = deps.cancel ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const createConnection = deps.createConnection ?? ((config: RTCConfiguration) => new RTCPeerConnection(config));
  const polite = isPolitePeer(deps.localUserId, deps.remoteUserId);

  const pc = createConnection({ iceServers: [...deps.iceServers] });
  const remote = (deps.createStream ?? (() => new MediaStream()))();

  let epoch = 0;
  let makingOffer = false;
  let ignoreOffer = false;
  let autoNegotiate = false;
  let closed = false;
  let everConnected = false;
  let restartAttempt = 0;
  let graceTimer: unknown = null;
  let restartTimer: unknown = null;
  let pendingCandidates: readonly RTCIceCandidateInit[] = [];
  let audioTransceiver: RTCRtpTransceiver | null = null;
  let videoTransceiver: RTCRtpTransceiver | null = null;

  const audioTrack = (): MediaStreamTrack | null => deps.localStream.getAudioTracks()[0] ?? null;
  const videoTrack = (): MediaStreamTrack | null => deps.localStream.getVideoTracks()[0] ?? null;

  const sendDescription = (): void => {
    const description = pc.localDescription;
    if (description === null || (description.type !== 'offer' && description.type !== 'answer')) return;
    deps.send({ type: description.type, sdp: description.sdp, negotiationId: epoch });
  };

  const makeOffer = async (options?: { readonly iceRestart?: boolean }): Promise<void> => {
    if (closed || makingOffer) return;
    try {
      makingOffer = true;
      epoch += 1;
      if (options?.iceRestart === true) await pc.setLocalDescription(await pc.createOffer({ iceRestart: true }));
      else await pc.setLocalDescription();
      sendDescription();
    } finally {
      makingOffer = false;
    }
  };

  const clearTimer = (timer: unknown): null => {
    if (timer !== null) cancel(timer);
    return null;
  };

  const restart = (): void => {
    restartTimer = clearTimer(restartTimer);
    if (closed) return;
    restartAttempt += 1;
    if (restartAttempt > ICE_RESTART_MAX_ATTEMPTS) {
      deps.onState('failed');
      return;
    }
    deps.onState('reconnecting');
    restartTimer = schedule(() => {
      restartTimer = null;
      void makeOffer({ iceRestart: true }).catch(() => undefined);
    }, restartBackoffMs(restartAttempt));
  };

  pc.onicecandidate = (event) => {
    const candidate = event.candidate;
    if (candidate === null || candidate.candidate === '') return;
    deps.send({
      type: 'ice-candidate',
      candidate: candidate.candidate,
      ...(candidate.sdpMid === null ? {} : { sdpMid: candidate.sdpMid }),
      ...(candidate.sdpMLineIndex === null ? {} : { sdpMLineIndex: candidate.sdpMLineIndex }),
      negotiationId: epoch,
    });
  };

  pc.ontrack = (event) => {
    if (!remote.getTracks().includes(event.track)) remote.addTrack(event.track);
    deps.onRemoteStream(remote);
  };

  pc.onnegotiationneeded = () => {
    if (!autoNegotiate) return;
    void makeOffer().catch(() => undefined);
  };

  pc.onconnectionstatechange = () => {
    if (closed) return;
    const state = pc.connectionState;
    if (state === 'connected') {
      graceTimer = clearTimer(graceTimer);
      restartTimer = clearTimer(restartTimer);
      restartAttempt = 0;
      everConnected = true;
      autoNegotiate = true;
      deps.onState('connected');
      return;
    }
    if (state === 'disconnected') {
      deps.onState(everConnected ? 'reconnecting' : 'connecting');
      if (graceTimer === null) {
        graceTimer = schedule(() => {
          graceTimer = null;
          if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') restart();
        }, ICE_DISCONNECT_GRACE_MS);
      }
      return;
    }
    if (state === 'failed') {
      graceTimer = clearTimer(graceTimer);
      restart();
    }
  };

  pc.onsignalingstatechange = () => {
    if (pc.signalingState === 'stable' && pc.remoteDescription !== null) autoNegotiate = true;
  };

  const drainCandidates = async (): Promise<void> => {
    const queued = pendingCandidates;
    pendingCandidates = [];
    for (const candidate of queued) await pc.addIceCandidate(candidate).catch(() => undefined);
  };

  /** Le côté qui RÉPOND s'accroche aux lignes de l'offre plutôt que d'en ajouter. */
  const bindAnswererTracks = async (): Promise<void> => {
    for (const transceiver of pc.getTransceivers()) {
      const kind = kindOf(transceiver);
      if (kind === 'audio' && audioTransceiver === null) {
        audioTransceiver = transceiver;
        const track = audioTrack();
        if (track !== null) await transceiver.sender.replaceTrack(track);
        transceiver.direction = 'sendrecv';
      }
      if (kind === 'video' && videoTransceiver === null) {
        videoTransceiver = transceiver;
        const track = videoTrack();
        if (track !== null) {
          await transceiver.sender.replaceTrack(track);
          transceiver.direction = 'sendrecv';
        }
      }
    }
    if (audioTransceiver === null) {
      const track = audioTrack();
      if (track !== null) audioTransceiver = pc.addTransceiver(track, { direction: 'sendrecv', streams: [deps.localStream] });
    }
  };

  return {
    offer: async () => {
      const audio = audioTrack();
      audioTransceiver = pc.addTransceiver(audio ?? 'audio', { direction: 'sendrecv', streams: [deps.localStream] });
      preferOpusRed(audioTransceiver);
      const video = videoTrack();
      videoTransceiver = pc.addTransceiver(video ?? 'video', { direction: video === null ? 'recvonly' : 'sendrecv', streams: [deps.localStream] });
      deps.onState('connecting');
      await makeOffer();
    },

    receiveDescription: async (description, incomingEpoch) => {
      if (closed || isStaleEpoch(incomingEpoch, epoch)) return;
      epoch = Math.max(epoch, incomingEpoch);
      const collision = description.type === 'offer' && (makingOffer || pc.signalingState !== 'stable');
      ignoreOffer = !polite && collision;
      if (ignoreOffer) return;
      await pc.setRemoteDescription(description);
      await drainCandidates();
      if (description.type !== 'offer') return;
      if (audioTransceiver === null || videoTransceiver === null) await bindAnswererTracks();
      if (audioTransceiver !== null) preferOpusRed(audioTransceiver);
      if (!everConnected) deps.onState('connecting');
      await pc.setLocalDescription();
      sendDescription();
    },

    receiveCandidate: async (candidate, incomingEpoch) => {
      if (closed || isStaleEpoch(incomingEpoch, epoch)) return;
      if (pc.remoteDescription === null) {
        pendingCandidates = [...pendingCandidates, candidate];
        return;
      }
      try {
        await pc.addIceCandidate(candidate);
      } catch (error) {
        if (!ignoreOffer) throw error;
      }
    },

    setVideoTrack: async (track) => {
      if (closed) return;
      if (videoTransceiver === null) {
        if (track === null) return;
        videoTransceiver = pc.addTransceiver(track, { direction: 'sendrecv', streams: [deps.localStream] });
        return;
      }
      await videoTransceiver.sender.replaceTrack(track);
      if (track !== null && videoTransceiver.direction !== 'sendrecv') videoTransceiver.direction = 'sendrecv';
    },

    setAudioTrack: async (track) => {
      if (closed || audioTransceiver === null) return;
      await audioTransceiver.sender.replaceTrack(track);
    },

    setIceServers: (servers) => {
      if (closed) return;
      pc.setConfiguration({ ...pc.getConfiguration(), iceServers: [...servers] });
    },

    connection: () => pc,

    close: () => {
      if (closed) return;
      closed = true;
      graceTimer = clearTimer(graceTimer);
      restartTimer = clearTimer(restartTimer);
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onnegotiationneeded = null;
      pc.onconnectionstatechange = null;
      pc.onsignalingstatechange = null;
      pc.close();
    },
  };
}
