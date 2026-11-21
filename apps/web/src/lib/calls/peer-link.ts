/**
 * **UN LIEN PAIR-À-PAIR** (#6382) — une `RTCPeerConnection` vers UN membre de
 * l'appel. Un appel direct en tient une, un appel de groupe une par membre
 * (maillage, `mode: 'p2p'` : la passerelle relaie, elle ne mixe rien).
 *
 * Quatre règles, reprises d'iOS (`CallManager.swift` § 3.5) pour que le web
 * parle la même langue que l'app :
 *
 * - **négociation parfaite (W3C)** : le plus petit identifiant est POLI et
 *   cède en cas de collision d'offres, l'autre l'emporte ;
 * - **époque de négociation** (`negotiationId`) : chaque offre émise ouvre une
 *   époque, la réponse et les candidats la reprennent, et un signal d'une
 *   époque plus ancienne que la plus haute vue est écarté ;
 * - **aucun codec injecté dans le SDP** : Opus + RED passent par
 *   `setCodecPreferences` (ADR-4 iOS — un RED injecté dans le SDP a rendu
 *   l'audio muet après ICE). Seuls les paramètres `fmtp` d'Opus de la
 *   description ENVOYÉE sont réglés (`shapeSdp`, #8697). La vidéo suit
 *   H264 > VP8 > VP9 (#11319) sur chaque ligne vidéo, qu'elle vienne de
 *   l'offre, de la réponse ou d'une caméra allumée en cours d'appel ; un
 *   navigateur sans `setCodecPreferences` ni `getCapabilities` (Firefox avant
 *   128, WebView ancienne) garde sa négociation par défaut, sans erreur ;
 * - **connexion comme iOS** (`P2PWebRTCClient.swift`) : max-bundle, RTCP
 *   multiplexé, pool ICE de 4 (`peerConfiguration`).
 *
 * La reprise ICE : `disconnected` attend 3 s avant de relancer, `failed`
 * relance tout de suite, puis 2 → 16 s entre deux tentatives, 5 au plus.
 * Une offre de reprise est VEILLÉE (#19776) : sans lien reconnecté 5 s plus
 * tard, elle repart — même si aucun état ne bouge, ce qui arrive quand la
 * signalisation l'a perdue (socket morte après un changement de réseau) ;
 * une offre restée en `have-local-offer` est annulée avant d'être refaite.
 * Les reprises épuisées, un relais TURN est imposé pour une dernière.
 */

import { videoCodecProbe, type VideoCodecFamily } from './call-codec-probe';

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
  /** Le canal de données `transcription` (#8048) : créé avant l'offre par l'offrant (m=application), reçu par l'autre — comme iOS. */
  readonly onChannel?: (channel: RTCDataChannel) => void;
  /** Le lien d'aperçu de l'appelé (#8480) : il ne fait que RECEVOIR, aucune piste ne s'y attache jamais. */
  readonly receiveOnly?: boolean;
  /** Le réglage de la description ENVOYÉE (#8697, `call-opus-sdp.ts`) ; la description locale reste celle du navigateur. */
  readonly shapeSdp?: (sdp: string) => string;
  /** Les codecs que l'appareil encode en matériel (#19777) ; la sonde de la page par défaut, jamais attendue. */
  readonly videoCodecEfficiency?: () => ReadonlySet<VideoCodecFamily> | null;
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
  /** Le réseau a changé (#19776) : une reprise ICE tout de suite, veillée, sans annoncer de reconnexion. */
  readonly restartIce: () => void;
  readonly connection: () => RTCPeerConnection;
  readonly close: () => void;
};

export const ICE_DISCONNECT_GRACE_MS = 3_000;
export const ICE_RESTART_MAX_ATTEMPTS = 5;
export const ICE_RESTART_WATCHDOG_MS = 5_000;
const RESTART_BACKOFF_BASE_MS = 2_000;
const RESTART_BACKOFF_MAX_MS = 16_000;

export function isPolitePeer(localUserId: string, remoteUserId: string): boolean {
  return localUserId !== '' && remoteUserId !== '' && localUserId !== remoteUserId && localUserId < remoteUserId;
}

export function isStaleEpoch(incoming: number, highWaterMark: number): boolean {
  return incoming < highWaterMark;
}

const ICE_CANDIDATE_POOL_SIZE = 4;
const H264 = 'video/h264';
const VIDEO_CODEC_ORDER: readonly string[] = [H264, 'video/vp8', 'video/vp9'];
const VIDEO_RETRANSMISSION = 'video/rtx';
/** `profile_idc` du `profile-level-id` : High (0x64, constrained high compris), Main (0x4d), Baseline (0x42). */
const H264_PROFILES: readonly { readonly idc: string; readonly family: VideoCodecFamily }[] = [
  { idc: '64', family: 'h264-high' },
  { idc: '4d', family: 'h264-main' },
  { idc: '42', family: 'h264-baseline' },
];
const PROFILE_LEVEL_ID = /profile-level-id=([0-9a-f]{2})/i;

/** La configuration de la connexion, celle d'iOS (`P2PWebRTCClient.swift`) : un seul transport par pair, RTCP multiplexé, pool ICE pré-chauffé. */
export function peerConfiguration(iceServers: readonly RTCIceServer[]): RTCConfiguration {
  return { iceServers: [...iceServers], bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require', iceCandidatePoolSize: ICE_CANDIDATE_POOL_SIZE };
}

const h264Profile = (codec: RTCRtpCodec): number => {
  const idc = PROFILE_LEVEL_ID.exec(codec.sdpFmtpLine ?? '')?.[1]?.toLowerCase();
  const index = H264_PROFILES.findIndex((profile) => profile.idc === idc);
  return index === -1 ? H264_PROFILES.length : index;
};

const familyOf = (codec: RTCRtpCodec): VideoCodecFamily | null => {
  const mime = codec.mimeType.toLowerCase();
  if (mime === 'video/vp8') return 'vp8';
  if (mime === 'video/vp9') return 'vp9';
  return mime === H264 ? (H264_PROFILES[h264Profile(codec)]?.family ?? null) : null;
};

/**
 * H264 > VP8 > VP9 (`P2PWebRTCClient+CodecPreferences.swift`), AV1, RED et
 * ULPFEC exclus comme sur iOS, RTX gardé : sans lui la retransmission vidéo se
 * tait. Dans H264, High puis Main avant la baseline (#19777). Un codec que la
 * sonde dit encodé en matériel passe devant les autres DE SON RANG — H264
 * restant toujours en tête : les pairs natifs l'encodent en matériel.
 */
export function orderVideoCodecs(codecs: readonly RTCRtpCodec[], efficient: ReadonlySet<VideoCodecFamily> | null = null): RTCRtpCodec[] {
  const group = (codec: RTCRtpCodec): number => {
    const mime = codec.mimeType.toLowerCase();
    if (mime === VIDEO_RETRANSMISSION) return 2;
    if (mime === H264) return 0;
    return VIDEO_CODEC_ORDER.includes(mime) ? 1 : -1;
  };
  const hardware = (codec: RTCRtpCodec): number => {
    const family = familyOf(codec);
    return efficient === null || efficient.size === 0 || (family !== null && efficient.has(family)) ? 0 : 1;
  };
  const within = (codec: RTCRtpCodec): number => (codec.mimeType.toLowerCase() === H264 ? h264Profile(codec) : VIDEO_CODEC_ORDER.indexOf(codec.mimeType.toLowerCase()));
  const key = (codec: RTCRtpCodec): readonly number[] => [group(codec), hardware(codec), within(codec)];
  const compare = (a: RTCRtpCodec, b: RTCRtpCodec): number => {
    const [left, right] = [key(a), key(b)];
    return left.reduce((order, value, index) => (order !== 0 ? order : value - (right[index] ?? 0)), 0);
  };
  return codecs.filter((codec) => group(codec) !== -1).sort(compare);
}

function preferVideoCodecs(transceiver: RTCRtpTransceiver, efficient: ReadonlySet<VideoCodecFamily> | null): void {
  if (typeof transceiver.setCodecPreferences !== 'function') return;
  const capabilities = typeof RTCRtpReceiver === 'undefined' ? null : RTCRtpReceiver.getCapabilities?.('video');
  const preferred = orderVideoCodecs(capabilities?.codecs ?? [], efficient);
  if (preferred.length === 0) return;
  try {
    transceiver.setCodecPreferences(preferred);
  } catch {
    /* Navigateur sans préférence de codec : la négociation par défaut tient. */
  }
}

const RELAY_URL = /^turns?:/i;

/** Un relais TURN est-il connu ? Sans lui, imposer `relay` ne rassemblerait aucun candidat. */
export function hasRelay(servers: readonly RTCIceServer[]): boolean {
  return servers.some((server) => (Array.isArray(server.urls) ? server.urls : [server.urls]).some((url) => RELAY_URL.test(url)));
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

const pageCodecEfficiency = (): ReadonlySet<VideoCodecFamily> | null => {
  videoCodecProbe.prime();
  return videoCodecProbe.current();
};

export function createPeerLink(deps: PeerLinkDeps): PeerLink {
  const schedule = deps.schedule ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const cancel = deps.cancel ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const createConnection = deps.createConnection ?? ((config: RTCConfiguration) => new RTCPeerConnection(config));
  const polite = isPolitePeer(deps.localUserId, deps.remoteUserId);
  const codecEfficiency = deps.videoCodecEfficiency ?? pageCodecEfficiency;

  const pc = createConnection(peerConfiguration(deps.iceServers));
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
  let watchdogTimer: unknown = null;
  let relayForced = false;
  let servers: readonly RTCIceServer[] = deps.iceServers;
  let pendingCandidates: readonly RTCIceCandidateInit[] = [];
  let audioTransceiver: RTCRtpTransceiver | null = null;
  let videoTransceiver: RTCRtpTransceiver | null = null;

  const audioTrack = (): MediaStreamTrack | null => deps.localStream.getAudioTracks()[0] ?? null;
  const videoTrack = (): MediaStreamTrack | null => deps.localStream.getVideoTracks()[0] ?? null;

  const sendDescription = (): void => {
    const description = pc.localDescription;
    if (description === null || (description.type !== 'offer' && description.type !== 'answer')) return;
    deps.send({ type: description.type, sdp: deps.shapeSdp?.(description.sdp) ?? description.sdp, negotiationId: epoch });
  };

  const makeOffer = async (options?: { readonly iceRestart?: boolean }): Promise<void> => {
    if (closed || makingOffer) return;
    try {
      makingOffer = true;
      epoch += 1;
      if (options?.iceRestart === true) {
        if (pc.signalingState === 'have-local-offer') await pc.setLocalDescription({ type: 'rollback' });
        await pc.setLocalDescription(await pc.createOffer({ iceRestart: true }));
      } else await pc.setLocalDescription();
      sendDescription();
    } finally {
      makingOffer = false;
    }
  };

  const clearTimer = (timer: unknown): null => {
    if (timer !== null) cancel(timer);
    return null;
  };

  /** La dernière chance : tout passer par le relais TURN (UDP bloqué, NAT symétrique des deux côtés). */
  const forceRelay = (): boolean => {
    if (relayForced || !hasRelay(servers)) return false;
    try {
      pc.setConfiguration({ ...pc.getConfiguration(), iceTransportPolicy: 'relay' });
    } catch {
      return false;
    }
    relayForced = true;
    return true;
  };

  const sendRestart = async (): Promise<void> => {
    watchdogTimer = clearTimer(watchdogTimer);
    if (closed) return;
    watchdogTimer = schedule(watch, ICE_RESTART_WATCHDOG_MS);
    await makeOffer({ iceRestart: true });
  };

  /** La veille d'une offre de reprise : reconnecté, rien ; ICE vivant mais offre sans réponse, on l'annule ; sinon on relance. */
  const watch = (): void => {
    watchdogTimer = null;
    if (closed) return;
    if (pc.connectionState !== 'connected') {
      restart();
      return;
    }
    if (pc.signalingState === 'have-local-offer' && !makingOffer) void pc.setLocalDescription({ type: 'rollback' }).catch(() => undefined);
  };

  const restart = (): void => {
    restartTimer = clearTimer(restartTimer);
    graceTimer = clearTimer(graceTimer);
    watchdogTimer = clearTimer(watchdogTimer);
    if (closed) return;
    restartAttempt += 1;
    const lastChance = restartAttempt > ICE_RESTART_MAX_ATTEMPTS;
    if (lastChance && !forceRelay()) {
      deps.onState('failed');
      return;
    }
    deps.onState('reconnecting');
    restartTimer = schedule(() => {
      restartTimer = null;
      void sendRestart().catch(() => undefined);
    }, lastChance ? 0 : restartBackoffMs(restartAttempt));
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

  pc.ondatachannel = (event) => {
    if (event.channel.label === 'transcription') deps.onChannel?.(event.channel);
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
    if (deps.receiveOnly === true) {
      for (const transceiver of pc.getTransceivers()) transceiver.direction = 'recvonly';
      return;
    }
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
      preferVideoCodecs(videoTransceiver, codecEfficiency());
      if (deps.onChannel !== undefined && typeof pc.createDataChannel === 'function') deps.onChannel(pc.createDataChannel('transcription', { ordered: true }));
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
      if (videoTransceiver !== null) preferVideoCodecs(videoTransceiver, codecEfficiency());
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
      if (closed || deps.receiveOnly === true) return;
      if (videoTransceiver === null) {
        if (track === null) return;
        videoTransceiver = pc.addTransceiver(track, { direction: 'sendrecv', streams: [deps.localStream] });
        preferVideoCodecs(videoTransceiver, codecEfficiency());
        return;
      }
      await videoTransceiver.sender.replaceTrack(track);
      if (track !== null && videoTransceiver.direction !== 'sendrecv') videoTransceiver.direction = 'sendrecv';
    },

    setAudioTrack: async (track) => {
      if (closed || audioTransceiver === null || deps.receiveOnly === true) return;
      await audioTransceiver.sender.replaceTrack(track);
    },

    setIceServers: (next) => {
      if (closed) return;
      servers = next;
      pc.setConfiguration({ ...pc.getConfiguration(), iceServers: [...next] });
    },

    restartIce: () => {
      if (closed || !everConnected) return;
      graceTimer = clearTimer(graceTimer);
      restartTimer = clearTimer(restartTimer);
      restartAttempt = 1;
      void sendRestart().catch(() => undefined);
    },

    connection: () => pc,

    close: () => {
      if (closed) return;
      closed = true;
      graceTimer = clearTimer(graceTimer);
      restartTimer = clearTimer(restartTimer);
      watchdogTimer = clearTimer(watchdogTimer);
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.ondatachannel = null;
      pc.onnegotiationneeded = null;
      pc.onconnectionstatechange = null;
      pc.onsignalingstatechange = null;
      pc.close();
    },
  };
}
