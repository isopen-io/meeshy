import type { CallReactionEmoji } from '@meeshy/shared/types/call-control-law';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import {
  decodeAck,
  decodeCallId,
  decodeForceLeave,
  decodeEnded,
  decodeError,
  decodeIceRefresh,
  decodeIceServers,
  decodeInitiated,
  decodeMediaToggled,
  decodeParticipantJoined,
  decodeParticipantLeft,
  decodeSessionMembers,
  decodeSessionInitiator,
  decodeSignal,
  mapServerEndReason,
  type DecodedInitiated,
  type DecodedPerson,
} from './call-decode';
import { analyticsPayload, createTelemetry, markCaptions, markConnected, markEffects, markNegotiating, markNetworkChange, markReconnecting, qualityReport, withCodec, withSample } from './call-analytics';
import { mediaFailureOf, stopStream, type Facing } from './call-media';
import {
  callStore,
  isCallLive,
  meshPhase,
  patchMember,
  withMember,
  withoutMember,
  type ActiveCall,
  type CallEndReason,
  type CallMedia,
  type CallStoreApi,
  type WaitingCall,
} from './call-store';
import type { CaptionsContext, CaptionsPort } from './call-captions-controller';
import { PASSTHROUGH_EFFECTS, type CameraEffectsPort } from './camera-effects';
import { feedbackActions, feedbackPromptFor, type CallFeedbackIssue, type CallFeedbackRating } from './call-feedback';
import { peerAlert } from './call-peer-alerts';
import type { QualityLoop, QualityLoopDeps } from './call-quality-loop';
import type { playCue, primeTones, startTone, stopTone } from './call-tones';
import { listenCallEvents, type CallTransport } from './call-transport';
import { callNoticeStore, callReactionStore, type CallNoticeStoreApi, type CallReactionStoreApi } from './call-control-state';
import { createEngineControls } from './engine-controls';
import { createEnginePreview } from './engine-preview';
import { loadDefaultEngineDeps } from './engine-defaults';
import { baseCall, emptySession } from './engine-session';
import type { LinkState, OutgoingSignal, PeerLink, PeerLinkDeps } from './peer-link';

/**
 * **LE MOTEUR D'APPEL DU WEB** (#6382, #3721) — la machine de
 * `CallManager.swift` portée au navigateur, contre la signalisation que la
 * passerelle sert déjà (`CallEventsHandler.ts`). Chargé à la demande
 * (`call-actions.ts`, ou `call-transport.ts` quand un appel arrive) : WebRTC
 * ne coûte rien à qui n'appelle pas.
 *
 * **Qui offre à qui.** Le membre DÉJÀ dans l'appel envoie l'offre au nouveau
 * venu quand `call:participant-joined` le lui annonce ; le nouveau venu ne
 * fait que répondre. C'est la convention d'iOS (`CallManager.swift:5086`), et
 * c'est elle qui rend le maillage d'un appel de groupe déterministe : chaque
 * paire a exactement un offrant, sans collision au départ.
 *
 * Minuteries, reprises d'iOS : 45 s de sonnerie sortante sans réponse
 * (`outgoingRingTimeoutSeconds`), 10 s pour qu'un accusé revienne, un
 * battement toutes les 10 s pendant l'appel (la passerelle ferme un appel
 * sans battement), l'écran de fin tenu 2,5 s.
 */

export const OUTGOING_RING_TIMEOUT_MS = 45_000;
export const INCOMING_RING_SAFETY_MS = 70_000;
export const ACK_TIMEOUT_MS = 10_000;
export const HEARTBEAT_INTERVAL_MS = 10_000;
export const ENDED_SCREEN_MS = 2_500;
export const ENDED_RETRY_SCREEN_MS = 8_000;
export const QUALITY_INTERVAL_MS = 2_000;
export const QUALITY_REPORT_MS = 5_000;

export type StartCallRequest = {
  readonly conversationId: string;
  readonly media: CallMedia;
  readonly title: string;
  readonly avatar: string | null;
  readonly isGroup: boolean;
};

export type JoinCallRequest = StartCallRequest & { readonly callId: string | null };

export type CallEngineDeps = {
  readonly store: CallStoreApi;
  readonly transport: () => CallTransport | null;
  readonly viewerId: () => string;
  readonly fetchActiveCallId: (conversationId: string) => Promise<string | null>;
  readonly acquireMedia: (options: { readonly video: boolean; readonly facing: Facing }) => Promise<MediaStream>;
  readonly acquireCamera: (facing: Facing) => Promise<MediaStreamTrack>;
  /** La piste de l'écran choisi (#8063) — rejette quand l'utilisateur annule le choix. */
  readonly acquireDisplay: () => Promise<MediaStreamTrack>;
  readonly createLink: (deps: PeerLinkDeps) => PeerLink;
  readonly createStream: (tracks: readonly MediaStreamTrack[]) => MediaStream;
  readonly now: () => number;
  readonly schedule: (fn: () => void, ms: number) => unknown;
  readonly cancel: (handle: unknown) => void;
  readonly repeat: (fn: () => void, ms: number) => unknown;
  readonly stopRepeat: (handle: unknown) => void;
  readonly tones: { readonly start: typeof startTone; readonly stop: typeof stopTone; readonly cue: typeof playCue; readonly prime: typeof primeTones };
  readonly ringLabel: () => string;
  readonly createQualityLoop: (deps: QualityLoopDeps) => QualityLoop;
  /** Chaque changement de réseau (`online`, `navigator.connection`) — rend le désabonnement. */
  readonly watchNetwork: (onChange: () => void) => () => void;
  readonly platform: () => string;
  readonly deviceModel: () => string;
  /** Le tirage de l'échantillon de la note d'après-appel (#8072) ; `Math.random` par défaut. */
  readonly random?: () => number;
  /** Les sous-titres d'un appel (#8048) — un chunk à part, chargé au premier besoin. */
  readonly createCaptions: (ctx: CaptionsContext) => CaptionsPort;
  /** Les effets de ma vidéo (#8442) — la caméra passe par eux avant de partir. */
  readonly cameraEffects?: CameraEffectsPort;
  /** Ce que montrent les contrôles d'un appel (#8433, #8438, #8439) — les magasins de l'application par défaut. */
  readonly controlState?: { readonly reactions: CallReactionStoreApi; readonly notices: CallNoticeStoreApi };
};

export type CallEngine = {
  readonly start: (request: StartCallRequest) => Promise<void>;
  readonly join: (request: JoinCallRequest) => Promise<void>;
  readonly accept: (options?: { readonly audioOnly?: boolean }) => Promise<void>;
  readonly decline: () => void;
  readonly hangup: () => void;
  readonly toggleMic: () => void;
  readonly toggleCamera: () => Promise<void>;
  readonly switchCamera: () => Promise<void>;
  /** Partager l'écran, ou arrêter le partage (#8063). */
  readonly toggleScreen: () => Promise<void>;
  /** Un périphérique choisi en cours d'appel (#8046) : la piste, déjà acquise, remplace l'actuelle. */
  readonly replaceInput: (kind: 'camera' | 'microphone', track: MediaStreamTrack) => Promise<void>;
  readonly setDisplay: (display: ActiveCall['display']) => void;
  readonly toggleCaptions: () => void;
  /** Un effet a changé (#8442) : la caméra envoyée le suit, piste remplacée sur chaque lien si besoin. */
  readonly refreshEffects: () => Promise<void>;
  readonly answerWaiting: () => Promise<void>;
  readonly declineWaiting: () => void;
  readonly retry: () => Promise<void>;
  readonly dismiss: () => void;
  /** La note d'après-appel (#8072) : part par `call:quality-feedback` et ferme la demande. */
  readonly rate: (rating: CallFeedbackRating, issues: readonly CallFeedbackIssue[]) => void;
  readonly skipRating: () => void;
  /** L'appelé active le son de l'aperçu (#8627) : la sonnerie se tait. */
  readonly hearPreview: () => void;
  /** Faire sonner un ami dans l'appel en cours (#8433). */
  readonly invite: (person: DecodedPerson) => Promise<void>;
  /** Couper le micro d'un participant, quand on modère l'appel (#8438). */
  readonly muteParticipant: (userId: string) => Promise<void>;
  /** Envoyer une réaction (#8439) ; `false` quand le débit ou l'état l'interdit. */
  readonly react: (emoji: CallReactionEmoji) => boolean;
  readonly handle: (event: string, payload: unknown) => void;
  readonly reauthenticated: () => void;
  readonly pageHidden: () => void;
  readonly dispose: () => void;
};

export function createCallEngine(deps: CallEngineDeps): CallEngine {
  const { store } = deps;
  let session = emptySession();
  let localStream: MediaStream | null = null;
  let endedTimer: unknown = null;
  let incomingTimer: unknown = null;
  let generation = 0;
  let screenPicking = false;

  const read = (): ActiveCall | null => store.getState().call;
  const write = (call: ActiveCall | null): void => store.setState({ call });
  const update = (fn: (call: ActiveCall) => ActiveCall): void => {
    const call = read();
    if (call !== null) write(fn(call));
  };
  const emit = (event: string, payload: unknown): void => deps.transport()?.emit(event, payload);
  const request = async (event: string, payload: unknown): Promise<unknown> => {
    const transport = deps.transport();
    if (transport === null) return null;
    try {
      return await transport.request(event, payload, ACK_TIMEOUT_MS);
    } catch {
      return null;
    }
  };

  const clear = (handle: unknown): null => {
    if (handle !== null) deps.cancel(handle);
    return null;
  };

  const stopTimers = (): void => {
    session.ringTimer = clear(session.ringTimer);
    if (session.heartbeat !== null) deps.stopRepeat(session.heartbeat);
    session.heartbeat = null;
    if (session.qualityTimer !== null) deps.stopRepeat(session.qualityTimer);
    session.qualityTimer = null;
    session.loop = null;
    session.unwatchNetwork?.();
    session.unwatchNetwork = null;
    for (const timer of session.alertTimers.values()) deps.cancel(timer);
    session.alertTimers.clear();
    session.captions?.stop(false);
    incomingTimer = clear(incomingTimer);
    controls.reset();
  };

  const effects = deps.cameraEffects ?? PASSTHROUGH_EFFECTS;
  const noteEffects = (): void => void (session.telemetry = markEffects(session.telemetry, effects.used()));
  const withEffects = async (camera: MediaStreamTrack): Promise<MediaStreamTrack> => {
    const sent = await effects.wrap(camera);
    noteEffects();
    return sent;
  };
  const swapTrack = (stream: MediaStream, from: MediaStreamTrack, to: MediaStreamTrack): void => {
    if (from === to) return;
    stream.removeTrack(from);
    stream.addTrack(to);
  };

  const teardownMedia = (): void => {
    preview.close();
    for (const link of session.links.values()) link.close();
    session.links.clear();
    for (const track of localStream?.getVideoTracks() ?? []) effects.release(track);
    stopStream(localStream);
    localStream = null;
  };

  const resetToIdle = (): void => {
    endedTimer = clear(endedTimer);
    stopTimers();
    teardownMedia();
    deps.tones.stop();
    session = emptySession();
    write(null);
  };

  /** Toute fin passe ici : sons coupés, liens fermés, écran de fin tenu un instant. */
  const finish = (reason: CallEndReason, detail: string | null = null, durationSec: number | null = null): void => {
    const call = read();
    if (call === null || call.phase.kind === 'ended') return;
    const retry = session.retry;
    if (call.callId !== null) emit(CLIENT_EVENTS.CALL_ANALYTICS, analyticsPayload(session.telemetry, { callId: call.callId, now: deps.now(), isVideo: call.media === 'video', endReason: reason, platform: deps.platform(), deviceModel: deps.deviceModel() }));
    stopTimers();
    teardownMedia();
    deps.tones.stop();
    if (call.phase.kind === 'connected' || call.phase.kind === 'reconnecting') deps.tones.cue('ended');
    const elapsed = durationSec ?? (call.connectedAt === null ? null : Math.max(0, Math.round((deps.now() - call.connectedAt) / 1000)));
    write({ ...call, phase: { kind: 'ended', reason, detail }, endedDurationSec: elapsed, localStream: null, remoteStreams: {}, screenSharing: false });
    const feedback = feedbackPromptFor({ call, reason, durationSec: elapsed, troubled: session.troubled, random: (deps.random ?? Math.random)() });
    if (feedback !== null) store.setState({ feedback });
    session = { ...emptySession(), retry };
    const retryable = retry !== null && (reason === 'failed' || reason === 'connectionLost' || reason === 'missed' || reason === 'busy');
    endedTimer = clear(endedTimer);
    endedTimer = deps.schedule(() => {
      endedTimer = null;
      if (read()?.phase.kind === 'ended') write(null);
    }, retryable ? ENDED_RETRY_SCREEN_MS : ENDED_SCREEN_MS);
  };

  const startHeartbeat = (callId: string): void => {
    if (session.heartbeat !== null) return;
    session.heartbeat = deps.repeat(() => emit(CLIENT_EVENTS.CALL_HEARTBEAT, { callId }), HEARTBEAT_INTERVAL_MS);
  };

  const refreshPhase = (): void => {
    const call = read();
    if (call === null || call.phase.kind === 'ended' || call.phase.kind === 'incoming') return;
    const mesh = meshPhase(call.members);
    if (mesh === null) return;
    if (mesh === 'connected' && call.phase.kind !== 'connected') {
      deps.tones.stop();
      if (call.connectedAt === null) deps.tones.cue('connected');
      session.ringTimer = clear(session.ringTimer);
      write({ ...call, phase: { kind: 'connected' }, connectedAt: call.connectedAt ?? deps.now() });
      preview.close();
      if (session.mutedWhileRinging && call.micMuted) toggleMic();
      session.mutedWhileRinging = false;
      session.telemetry = markConnected(session.telemetry, deps.now());
      startQuality();
      return;
    }
    if (mesh === 'reconnecting' && call.phase.kind === 'connected') {
      session.troubled = true;
      write({ ...call, phase: { kind: 'reconnecting' } });
      return;
    }
    if (mesh === 'connecting' && call.phase.kind === 'outgoing') {
      deps.tones.stop();
      session.ringTimer = clear(session.ringTimer);
      write({ ...call, phase: { kind: 'connecting' } });
    }
  };

  const remember = (person: DecodedPerson, participantId: string | null, flags?: { readonly micMuted?: boolean; readonly cameraOn?: boolean }): void => {
    if (person.userId === deps.viewerId()) return;
    if (participantId !== null) session.participantIds.set(participantId, person.userId);
    update((call) => {
      const current = call.members[person.userId];
      return withMember(call, {
        userId: person.userId,
        name: person.name !== '' ? person.name : (current?.name ?? ''),
        avatar: person.avatar ?? current?.avatar ?? null,
        micMuted: flags?.micMuted ?? current?.micMuted ?? false,
        cameraOn: flags?.cameraOn ?? current?.cameraOn ?? false,
        screenSharing: current?.screenSharing ?? false,
        weakNetwork: current?.weakNetwork ?? false,
        capturing: current?.capturing ?? false,
        link: current?.link ?? 'waiting',
      });
    });
  };

  const onLinkState = (userId: string, state: LinkState): void => {
    const call = read();
    if (call === null || call.phase.kind === 'ended') return;
    if (state === 'failed') {
      const others = [...session.links.keys()].filter((id) => id !== userId);
      if (!call.isGroup || others.length === 0) {
        hangupWith('connectionLost');
        return;
      }
      session.links.get(userId)?.close();
      session.links.delete(userId);
      update((current) => withoutMember(current, userId));
      return;
    }
    const before = call.members[userId]?.link;
    update((current) => patchMember(current, userId, { link: state }));
    const callId = call.callId;
    if (callId !== null && state === 'reconnecting' && before === 'connected') {
      session.telemetry = markReconnecting(session.telemetry);
      emit(CLIENT_EVENTS.CALL_RECONNECTING, { callId, participantId: deps.viewerId(), attempt: 1 });
    }
    if (callId !== null && state === 'connected' && before === 'reconnecting') {
      emit(CLIENT_EVENTS.CALL_RECONNECTED, { callId, participantId: deps.viewerId() });
    }
    refreshPhase();
  };

  const linkTo = (userId: string): PeerLink | null => {
    const existing = session.links.get(userId);
    if (existing !== undefined) return existing;
    const call = read();
    const stream = localStream;
    if (call === null || call.callId === null || stream === null) return null;
    const callId = call.callId;
    const token = generation;
    const link = deps.createLink({
      localUserId: deps.viewerId(),
      remoteUserId: userId,
      iceServers: session.iceServers,
      localStream: stream,
      send: (signal: OutgoingSignal) => {
        if (token !== generation) return;
        emit(CLIENT_EVENTS.CALL_SIGNAL, { callId, signal: { ...signal, from: deps.viewerId(), to: userId } });
      },
      onRemoteStream: (remote) => {
        if (token !== generation) return;
        update((current) => ({ ...current, remoteStreams: { ...current.remoteStreams, [userId]: deps.createStream(remote.getTracks()) } }));
      },
      onState: (state) => {
        if (token === generation) onLinkState(userId, state);
      },
      onChannel: (channel) => (token === generation ? captions()?.attach(userId, channel) : undefined),
    });
    session.links.set(userId, link);
    return link;
  };

  const preview = createEnginePreview({ read, update, emit, viewerId: deps.viewerId, createLink: deps.createLink, createStream: deps.createStream, localStream: () => localStream, iceServers: () => session.iceServers, silenceRing: deps.tones.stop });

  const leaveServer = (reason?: string): void => {
    const callId = read()?.callId ?? null;
    if (callId === null) return;
    void request(CLIENT_EVENTS.CALL_END, reason === undefined ? { callId } : { callId, reason });
  };

  const hangupWith = (reason: CallEndReason): void => {
    leaveServer();
    finish(reason);
  };

  const startQuality = (): void => {
    if (session.qualityTimer !== null) return;
    session.loop = deps.createQualityLoop({
      links: () => [...session.links.entries()].map(([userId, link]) => [userId, link.connection()] as const),
      wantsVideo: () => (localStream?.getVideoTracks().length ?? 0) > 0,
      now: deps.now,
    });
    session.unwatchNetwork = deps.watchNetwork(() => void (session.telemetry = markNetworkChange(session.telemetry)));
    session.qualityTimer = deps.repeat(() => void sampleQuality(), QUALITY_INTERVAL_MS);
  };

  /** Un relevé : le niveau et la survie à l'écran, l'échantillon au rapport de fin, le rapport à la passerelle (5 s au plus). */
  const sampleQuality = async (): Promise<void> => {
    const loop = session.loop;
    const callId = read()?.callId ?? null;
    if (loop === null || callId === null) return;
    const tick = await loop.tick();
    if (tick === null || session.loop !== loop || read()?.callId !== callId) return;
    const { total, stage, codec } = tick;
    session.telemetry = withCodec(withSample(session.telemetry, total), codec);
    update((current) => ({ ...current, quality: { level: total.level, packetLoss: total.packetLoss, rtt: total.rtt, jitter: total.jitter, audioKbps: total.audioKbps, videoKbps: total.videoKbps, survival: stage } }));
    if (total.level === 'poor') session.troubled = true;
    if (deps.now() - session.lastQualityReport < QUALITY_REPORT_MS) return;
    session.lastQualityReport = deps.now();
    emit(CLIENT_EVENTS.CALL_QUALITY_REPORT, qualityReport(callId, total, deps.now()));
  };

  /** Le contrôleur des sous-titres de CET appel (#8048), construit au premier besoin : un segment, le bouton, un canal de données. */
  const captions = (): CaptionsPort | null => {
    const callId = read()?.callId ?? null;
    if (callId === null) return null;
    const shown = (): void => void (session.telemetry = markCaptions(session.telemetry));
    const bye = (): void => (read()?.callId === callId ? finish('remote') : undefined);
    session.captions ??= deps.createCaptions({ callId, read, update, emit, viewerId: deps.viewerId, now: deps.now, repeat: deps.repeat, stopRepeat: deps.stopRepeat, shown, bye });
    return session.captions;
  };

  const userOf = (userId: string | null, participantId: string | null): string | null => userId ?? (participantId === null ? null : (session.participantIds.get(participantId) ?? null));

  const onPeerAlert = (event: string, payload: unknown): void => {
    const alert = peerAlert(event, payload, userOf);
    if (alert === null || read()?.callId !== alert.callId) return;
    update((current) => patchMember(current, alert.userId, alert.patch));
    if (alert.clearAfterMs === null) return;
    clear(session.alertTimers.get(alert.userId) ?? null);
    session.alertTimers.set(
      alert.userId,
      deps.schedule(() => {
        session.alertTimers.delete(alert.userId);
        update((current) => patchMember(current, alert.userId, { weakNetwork: false }));
      }, alert.clearAfterMs),
    );
  };

  /* Le micro coupé AVANT que le média soit prêt (#8434) — pendant la demande
     d'autorisation, le décroché ou la rejointe : la piste naît coupée, et ce
     qu'on annonce au serveur le dit. */
  const micMuted = (): boolean => read()?.micMuted === true;
  const mediaSettings = (stream: MediaStream) => ({ audioEnabled: !micMuted(), videoEnabled: stream.getVideoTracks().length > 0 });

  const acquire = async (video: boolean, facing: Facing): Promise<MediaStream | null> => {
    try {
      const stream = await deps.acquireMedia({ video, facing });
      for (const track of stream.getAudioTracks()) track.enabled = !micMuted();
      for (const camera of stream.getVideoTracks()) swapTrack(stream, camera, await withEffects(camera));
      localStream = stream;
      return stream;
    } catch (error) {
      finish(mediaFailureOf(error) === 'permission' ? 'permission' : 'failed', 'media');
      return null;
    }
  };

  const afterJoinAck = (ack: ReturnType<typeof decodeAck>): boolean => {
    if (!ack.ok) {
      if (ack.code === 'CALL_ENDED') finish(mapServerEndReason(ack.endReason ?? 'completed'));
      else finish('failed', ack.code);
      return false;
    }
    session.iceServers = decodeIceServers(ack.data.iceServers) ?? session.iceServers;
    for (const member of decodeSessionMembers(ack.data.callSession)) remember(member, member.participantId, member.flags);
    const initiatorId = decodeSessionInitiator(ack.data.callSession);
    if (initiatorId !== null) update((call) => ({ ...call, initiatorId }));
    return true;
  };

  const joinExisting = async (request_: JoinCallRequest, callId: string): Promise<void> => {
    const token = generation;
    session.telemetry = markNegotiating(session.telemetry, deps.now());
    const stream = await acquire(request_.media === 'video', 'user');
    if (stream === null || token !== generation) return;
    update((call) => ({ ...call, callId, localStream: stream, cameraOn: stream.getVideoTracks().length > 0, phase: { kind: 'connecting' } }));
    const ack = decodeAck(await request(CLIENT_EVENTS.CALL_JOIN, { callId, settings: mediaSettings(stream) }));
    if (token !== generation) return;
    if (afterJoinAck(ack)) startHeartbeat(callId);
  };

  const start = async (callRequest: StartCallRequest): Promise<void> => {
    deps.tones.prime();
    if (isCallLive(read())) {
      store.setState({ notice: 'already-in-call' });
      return;
    }
    resetToIdle();
    generation += 1;
    const token = generation;
    session.retry = callRequest;
    session.telemetry = createTelemetry(deps.now());
    write(baseCall(callRequest, 'outgoing', { kind: 'outgoing' }));
    const stream = await acquire(callRequest.media === 'video', 'user');
    if (stream === null || token !== generation) return;
    update((call) => ({ ...call, localStream: stream, cameraOn: stream.getVideoTracks().length > 0 }));
    emit(CLIENT_EVENTS.CALL_FORCE_LEAVE, { conversationId: callRequest.conversationId });
    const ack = decodeAck(
      await request(CLIENT_EVENTS.CALL_INITIATE, {
        conversationId: callRequest.conversationId,
        type: callRequest.media,
        settings: mediaSettings(stream),
      }),
    );
    if (token !== generation || read()?.phase.kind === 'ended') return;
    if (!ack.ok) {
      if (ack.code === 'CALL_ALREADY_ACTIVE') {
        const activeId = await deps.fetchActiveCallId(callRequest.conversationId).catch(() => null);
        if (activeId !== null && token === generation) {
          const ackJoin = decodeAck(await request(CLIENT_EVENTS.CALL_JOIN, { callId: activeId, settings: mediaSettings(stream) }));
          if (token !== generation) return;
          update((call) => ({ ...call, callId: activeId, phase: { kind: 'connecting' } }));
          if (afterJoinAck(ackJoin)) startHeartbeat(activeId);
          return;
        }
      }
      finish('failed', ack.code);
      return;
    }
    const callId = typeof ack.data.callId === 'string' ? ack.data.callId : null;
    if (callId === null) {
      finish('failed', 'NO_CALL_ID');
      return;
    }
    session.iceServers = decodeIceServers(ack.data.iceServers) ?? [];
    update((call) => ({ ...call, callId, initiatorId: deps.viewerId() }));
    deps.tones.start('ringback');
    startHeartbeat(callId);
    session.ringTimer = deps.schedule(() => {
      session.ringTimer = null;
      const call = read();
      if (call?.callId === callId && (call.phase.kind === 'outgoing' || call.phase.kind === 'connecting') && meshPhase(call.members) !== 'connected') hangupWith('missed');
    }, OUTGOING_RING_TIMEOUT_MS);
  };

  const join = async (joinRequest: JoinCallRequest): Promise<void> => {
    deps.tones.prime();
    if (isCallLive(read())) {
      if (read()?.conversationId === joinRequest.conversationId) {
        update((call) => ({ ...call, display: 'full' }));
        return;
      }
      store.setState({ notice: 'already-in-call' });
      return;
    }
    resetToIdle();
    generation += 1;
    const token = generation;
    session.retry = joinRequest;
    session.telemetry = createTelemetry(deps.now());
    write(baseCall(joinRequest, 'outgoing', { kind: 'connecting' }));
    const callId = joinRequest.callId ?? (await deps.fetchActiveCallId(joinRequest.conversationId).catch(() => null));
    if (token !== generation) return;
    if (callId === null) {
      finish('remote', 'CALL_ENDED');
      return;
    }
    await joinExisting(joinRequest, callId);
  };

  const incoming = (event: DecodedInitiated): void => {
    const current = read();
    if (current?.callId === event.callId) return;
    const title = event.isGroup ? (event.conversationTitle ?? event.initiator.name) : event.initiator.name;
    if (isCallLive(current)) {
      const waiting = store.getState().waiting;
      if (waiting !== null && waiting.callId !== event.callId) void request(CLIENT_EVENTS.CALL_END, { callId: event.callId, reason: 'rejected' });
      if (waiting === null) {
        const next: WaitingCall = { callId: event.callId, conversationId: event.conversationId, media: event.media, callerName: event.initiator.name, callerAvatar: event.initiator.avatar, isGroup: event.isGroup, title };
        store.setState({ waiting: next });
      }
      return;
    }
    resetToIdle();
    generation += 1;
    session.iceServers = event.iceServers ?? [];
    session.telemetry = createTelemetry(deps.now());
    write({
      ...baseCall({ conversationId: event.conversationId, media: event.media, title, avatar: event.isGroup ? null : event.initiator.avatar, isGroup: event.isGroup }, 'incoming', { kind: 'incoming' }),
      callId: event.callId,
      callerName: event.invitedBy?.name ?? event.initiator.name,
      initiatorId: event.initiator.userId,
      invitedBy: event.invitedBy?.name ?? null,
    });
    remember(event.initiator, null, event.initiatorFlags);
    preview.ringing();
    deps.tones.start('ring', { titleLabel: deps.ringLabel() });
    incomingTimer = deps.schedule(() => {
      incomingTimer = null;
      if (read()?.callId === event.callId && read()?.phase.kind === 'incoming') resetToIdle();
    }, INCOMING_RING_SAFETY_MS);
  };

  const accept = async (options?: { readonly audioOnly?: boolean }): Promise<void> => {
    deps.tones.prime();
    const call = read();
    if (call === null || call.phase.kind !== 'incoming' || call.callId === null) return;
    const callId = call.callId;
    deps.tones.stop();
    incomingTimer = clear(incomingTimer);
    const token = generation;
    session.telemetry = markNegotiating(session.telemetry, deps.now());
    write({ ...call, phase: { kind: 'connecting' } });
    const video = call.media === 'video' && options?.audioOnly !== true;
    const stream = await acquire(video, 'user');
    if (stream === null) {
      void request(CLIENT_EVENTS.CALL_END, { callId, reason: 'rejected' });
      return;
    }
    if (token !== generation) return;
    update((current) => ({ ...current, localStream: stream, cameraOn: stream.getVideoTracks().length > 0 }));
    const ack = decodeAck(await request(CLIENT_EVENTS.CALL_JOIN, { callId, settings: mediaSettings(stream) }));
    if (token !== generation) return;
    if (afterJoinAck(ack)) startHeartbeat(callId);
  };

  const decline = (): void => {
    const call = read();
    if (call === null || call.callId === null) return;
    void request(CLIENT_EVENTS.CALL_END, { callId: call.callId, reason: 'rejected' });
    resetToIdle();
  };

  const onSignal = async (payload: unknown): Promise<void> => {
    const signal = decodeSignal(payload);
    const call = read();
    if (signal === null || call === null || call.callId !== signal.callId || call.phase.kind === 'ended' || call.phase.kind === 'incoming') return;
    if (signal.to !== deps.viewerId() || signal.from === deps.viewerId()) return;
    if (call.members[signal.from] === undefined) remember({ userId: signal.from, name: '', avatar: null }, null);
    const link = linkTo(signal.from);
    if (link === null) return;
    try {
      if (signal.kind === 'description') await link.receiveDescription({ type: signal.type, sdp: signal.sdp }, signal.epoch);
      else await link.receiveCandidate({ candidate: signal.candidate, sdpMid: signal.sdpMid, sdpMLineIndex: signal.sdpMLineIndex }, signal.epoch);
    } catch {
      /* Un signal refusé par le navigateur n'arrête pas l'appel : la reprise ICE s'en charge. */
    }
  };

  const onJoined = (payload: unknown): void => {
    const joined = decodeParticipantJoined(payload);
    const call = read();
    if (joined === null || call === null || call.callId !== joined.callId || call.phase.kind === 'ended' || call.phase.kind === 'incoming') return;
    if (joined.person.userId === deps.viewerId()) return;
    if (joined.iceServers !== null) session.iceServers = joined.iceServers;
    remember(joined.person, joined.participantId, { micMuted: !joined.audio, cameraOn: joined.video });
    session.telemetry = markNegotiating(session.telemetry, deps.now());
    const existing = session.links.get(joined.person.userId);
    if (existing !== undefined) {
      existing.close();
      session.links.delete(joined.person.userId);
    }
    const link = linkTo(joined.person.userId);
    update((current) => patchMember(current, joined.person.userId, { link: 'connecting' }));
    if (read()?.screenSharing === true) announceScreen(true);
    refreshPhase();
    void link?.offer().catch(() => onLinkState(joined.person.userId, 'failed'));
  };

  const onLeft = (payload: unknown): void => {
    const left = decodeParticipantLeft(payload);
    const call = read();
    if (left === null || call === null || call.callId !== left.callId) return;
    const userId = left.userId ?? (left.participantId === null ? null : (session.participantIds.get(left.participantId) ?? null));
    if (userId === null || userId === deps.viewerId()) return;
    session.links.get(userId)?.close();
    session.links.delete(userId);
    update((current) => withoutMember(current, userId));
    const after = read();
    if (after !== null && !after.isGroup && after.phase.kind !== 'ended' && after.phase.kind !== 'outgoing') finish('remote');
  };

  const handle = (event: string, payload: unknown): void => {
    switch (event) {
      case SERVER_EVENTS.CALL_INITIATED: {
        const initiated = decodeInitiated(payload);
        if (initiated !== null && initiated.initiator.userId !== deps.viewerId()) incoming(initiated);
        return;
      }
      case SERVER_EVENTS.CALL_SIGNAL:
        void onSignal(payload);
        return;
      case SERVER_EVENTS.CALL_PARTICIPANT_JOINED:
        onJoined(payload);
        return;
      case SERVER_EVENTS.CALL_PARTICIPANT_LEFT:
        onLeft(payload);
        return;
      case SERVER_EVENTS.CALL_ENDED: {
        const ended = decodeEnded(payload);
        if (ended === null) return;
        if (store.getState().waiting?.callId === ended.callId) store.setState({ waiting: null });
        const call = read();
        if (call === null || call.callId !== ended.callId) return;
        if (call.phase.kind === 'incoming') {
          resetToIdle();
          return;
        }
        const reason = ended.endedBy === deps.viewerId() ? 'local' : mapServerEndReason(ended.reason);
        finish(reason, null, ended.durationSec > 0 ? ended.durationSec : null);
        return;
      }
      case SERVER_EVENTS.CALL_MISSED:
      case SERVER_EVENTS.CALL_ALREADY_ANSWERED: {
        const callId = decodeCallId(payload);
        if (callId === null) return;
        if (store.getState().waiting?.callId === callId) store.setState({ waiting: null });
        const call = read();
        if (call?.callId !== callId) return;
        if (call.phase.kind === 'incoming') resetToIdle();
        else if (event === SERVER_EVENTS.CALL_MISSED && call.phase.kind === 'outgoing') finish('missed');
        return;
      }
      case SERVER_EVENTS.CALL_FORCE_LEAVE: {
        const forced = decodeForceLeave(payload);
        if (forced !== null && read()?.callId === forced.callId) finish(forced.removed ? 'removed' : 'remote');
        return;
      }
      case SERVER_EVENTS.CALL_ERROR: {
        const error = decodeError(payload);
        const call = read();
        if (error === null || call === null || error.callId !== call.callId) return;
        if (call.phase.kind === 'outgoing' || call.phase.kind === 'connecting') finish('failed', error.code);
        return;
      }
      case SERVER_EVENTS.CALL_MEDIA_TOGGLED: {
        const toggled = decodeMediaToggled(payload);
        const call = read();
        if (toggled === null || call === null || call.callId !== toggled.callId) return;
        const userId = userOf(toggled.userId, toggled.participantId);
        if (userId === null) return;
        const patch = toggled.mediaType === 'audio' ? { micMuted: !toggled.enabled } : toggled.mediaType === 'screen' ? { screenSharing: toggled.enabled } : { cameraOn: toggled.enabled };
        update((current) => patchMember(current, userId, patch));
        return;
      }
      case SERVER_EVENTS.CALL_ICE_SERVERS_REFRESHED: {
        const refresh = decodeIceRefresh(payload);
        if (refresh === null || read()?.callId !== refresh.callId) return;
        session.iceServers = refresh.iceServers;
        for (const link of session.links.values()) link.setIceServers(refresh.iceServers);
        return;
      }
      case SERVER_EVENTS.CALL_TRANSLATED_SEGMENT:
      case SERVER_EVENTS.CALL_TRANSCRIPTION_ACTIVE:
        captions()?.receive(event, payload);
        return;
      case SERVER_EVENTS.CALL_QUALITY_ALERT:
      case SERVER_EVENTS.CALL_SCREEN_CAPTURE_ALERT:
        onPeerAlert(event, payload);
        return;
      case SERVER_EVENTS.CALL_PARTICIPANT_INVITED:
      case SERVER_EVENTS.CALL_MUTED_BY_MODERATOR:
      case SERVER_EVENTS.CALL_REACTION_RECEIVED:
        controls.receive(event, payload);
        return;
      case SERVER_EVENTS.CALL_PREVIEW_REQUESTED:
      case SERVER_EVENTS.CALL_PREVIEW_SIGNAL:
        preview.receive(event, payload);
        return;
      default:
        return;
    }
  };

  const toggleMic = (): void => {
    const call = read();
    if (call === null || !isCallLive(call)) return;
    const muted = !call.micMuted;
    for (const track of localStream?.getAudioTracks() ?? []) track.enabled = !muted;
    write({ ...call, micMuted: muted });
    if (call.phase.kind === 'outgoing') session.mutedWhileRinging = muted;
    session.captions?.micChanged();
    if (call.callId !== null) emit(CLIENT_EVENTS.CALL_TOGGLE_AUDIO, { callId: call.callId, enabled: !muted });
  };

  const controlState = deps.controlState ?? { reactions: callReactionStore, notices: callNoticeStore };
  const controls = createEngineControls({ read, update, request, viewerId: deps.viewerId, now: deps.now, schedule: deps.schedule, cancel: deps.cancel, muteSelf: toggleMic, ...controlState });

  const setCamera = async (track: MediaStreamTrack | null, cameraOn: boolean = track !== null): Promise<void> => {
    const stream = localStream;
    if (stream === null) return;
    const sent = track !== null && cameraOn ? await withEffects(track) : track;
    for (const old of stream.getVideoTracks()) {
      stream.removeTrack(old);
      effects.release(old);
    }
    if (sent !== null) stream.addTrack(sent);
    await Promise.all([...session.links.values()].map((link) => link.setVideoTrack(sent).catch(() => undefined)));
    preview.setVideoTrack(sent);
    update((call) => ({ ...call, cameraOn, localStream: deps.createStream(stream.getTracks()) }));
  };

  const refreshEffects = async (): Promise<void> => {
    const call = read();
    const stream = localStream;
    const current = stream?.getVideoTracks()[0];
    if (call === null || stream === null || current === undefined || !call.cameraOn || call.screenSharing) return;
    const next = await effects.refresh(current);
    noteEffects();
    if (next === current) return;
    if (localStream !== stream || !stream.getVideoTracks().includes(current)) {
      effects.release(next);
      return;
    }
    swapTrack(stream, current, next);
    await Promise.all([...session.links.values()].map((link) => link.setVideoTrack(next).catch(() => undefined)));
    update((latest) => ({ ...latest, localStream: deps.createStream(stream.getTracks()) }));
  };

  const toggleCamera = async (): Promise<void> => {
    const call = read();
    if (call === null || !isCallLive(call) || call.phase.kind === 'incoming' || call.screenSharing) return;
    if (call.cameraOn) {
      await setCamera(null);
    } else {
      const track = await deps.acquireCamera(call.facing).catch(() => null);
      if (track === null) return;
      await setCamera(track);
      if (call.media === 'audio') update((current) => ({ ...current, media: 'video' }));
    }
    const after = read();
    if (after?.callId != null) emit(CLIENT_EVENTS.CALL_TOGGLE_VIDEO, { callId: after.callId, enabled: after.cameraOn });
  };

  const switchCamera = async (): Promise<void> => {
    const call = read();
    if (call === null || !call.cameraOn) return;
    const facing: Facing = call.facing === 'user' ? 'environment' : 'user';
    const track = await deps.acquireCamera(facing).catch(() => null);
    if (track === null) return;
    await setCamera(track);
    update((current) => ({ ...current, facing }));
  };

  const sharable = (call: ActiveCall | null): call is ActiveCall => call !== null && (call.phase.kind === 'connected' || call.phase.kind === 'reconnecting');

  const announceScreen = (enabled: boolean): void => {
    const callId = read()?.callId ?? null;
    if (callId !== null) emit(CLIENT_EVENTS.CALL_TOGGLE_SCREEN, { callId, enabled });
  };

  /**
   * L'écran remplace la piste vidéo émise sur chaque lien — `replaceTrack`, ou
   * une renégociation quand la ligne vidéo ne faisait que recevoir (appel
   * vocal). La caméra, si elle tournait, est relâchée : elle revient à l'arrêt.
   */
  const startScreen = async (call: ActiveCall): Promise<void> => {
    if (screenPicking) return;
    screenPicking = true;
    const display = await deps.acquireDisplay().catch(() => null);
    screenPicking = false;
    if (display === null) return;
    const current = read();
    if (!sharable(current) || current.callId !== call.callId || current.screenSharing) {
      display.stop();
      return;
    }
    session.cameraBeforeShare = current.cameraOn;
    display.onended = () => void stopScreen();
    await setCamera(display, false);
    update((next) => ({ ...next, screenSharing: true }));
    announceScreen(true);
  };

  /** L'arrêt — le bouton, ou « Arrêter le partage » du navigateur (fin de la piste). */
  const stopScreen = async (): Promise<void> => {
    const call = read();
    if (call === null || !call.screenSharing) return;
    for (const track of localStream?.getVideoTracks() ?? []) track.onended = null;
    const restore = session.cameraBeforeShare;
    session.cameraBeforeShare = false;
    update((next) => ({ ...next, screenSharing: false }));
    const camera = restore ? await deps.acquireCamera(call.facing).catch(() => null) : null;
    if (read()?.callId !== call.callId) {
      camera?.stop();
      return;
    }
    await setCamera(camera);
    announceScreen(false);
    if (restore && camera === null) emit(CLIENT_EVENTS.CALL_TOGGLE_VIDEO, { callId: call.callId, enabled: false });
  };

  const toggleScreen = async (): Promise<void> => {
    const call = read();
    if (call?.screenSharing === true) {
      await stopScreen();
      return;
    }
    if (sharable(call)) await startScreen(call);
  };

  const replaceMicrophone = async (track: MediaStreamTrack, muted: boolean): Promise<void> => {
    const stream = localStream;
    if (stream === null) return;
    for (const old of stream.getAudioTracks()) {
      stream.removeTrack(old);
      old.stop();
    }
    track.enabled = !muted;
    stream.addTrack(track);
    await Promise.all([...session.links.values()].map((link) => link.setAudioTrack(track).catch(() => undefined)));
    update((call) => ({ ...call, localStream: deps.createStream(stream.getTracks()) }));
  };

  const replaceInput = async (kind: 'camera' | 'microphone', track: MediaStreamTrack): Promise<void> => {
    const call = read();
    const usable = call !== null && isCallLive(call) && call.phase.kind !== 'incoming' && localStream !== null && (kind === 'microphone' || call.cameraOn);
    if (!usable) {
      track.stop();
      return;
    }
    if (kind === 'microphone') {
      await replaceMicrophone(track, call.micMuted);
      return;
    }
    await setCamera(track);
    update((current) => ({ ...current, facing: 'user' }));
  };

  const answerWaiting = async (): Promise<void> => {
    const waiting = store.getState().waiting;
    if (waiting === null) return;
    store.setState({ waiting: null });
    leaveServer();
    resetToIdle();
    generation += 1;
    const token = generation;
    session.telemetry = createTelemetry(deps.now());
    write({
      ...baseCall({ conversationId: waiting.conversationId, media: waiting.media, title: waiting.title, avatar: waiting.callerAvatar, isGroup: waiting.isGroup }, 'incoming', { kind: 'connecting' }),
      callId: waiting.callId,
      callerName: waiting.callerName,
    });
    await joinExisting({ conversationId: waiting.conversationId, media: waiting.media, title: waiting.title, avatar: waiting.callerAvatar, isGroup: waiting.isGroup, callId: waiting.callId }, waiting.callId);
    if (token !== generation) return;
  };

  const declineWaiting = (): void => {
    const waiting = store.getState().waiting;
    if (waiting === null) return;
    store.setState({ waiting: null });
    void request(CLIENT_EVENTS.CALL_END, { callId: waiting.callId, reason: 'rejected' });
  };

  const onPageHide = (): void => {
    const call = read();
    if (call?.callId != null && call.phase.kind !== 'incoming' && isCallLive(call)) emit(CLIENT_EVENTS.CALL_END, { callId: call.callId });
  };

  const unlisten = listenCallEvents(handle, () => {
    const call = read();
    if (call === null || call.callId === null || !isCallLive(call) || call.phase.kind === 'incoming') return;
    const callId = call.callId;
    void request(CLIENT_EVENTS.CALL_JOIN, { callId, settings: { audioEnabled: !call.micMuted, videoEnabled: call.cameraOn } }).then((raw) => {
      const ack = decodeAck(raw);
      if (read()?.callId !== callId) return;
      if (!ack.ok && ack.code === 'CALL_ENDED') finish(mapServerEndReason(ack.endReason ?? 'completed'));
      if (ack.ok) session.iceServers = decodeIceServers(ack.data.iceServers) ?? session.iceServers;
    });
  });

  return {
    start,
    join,
    accept,
    decline,
    hangup: () => {
      const call = read();
      if (call === null) return;
      if (call.phase.kind === 'incoming') {
        decline();
        return;
      }
      if (call.phase.kind === 'ended') {
        resetToIdle();
        return;
      }
      session.captions?.stop(true);
      generation += 1;
      hangupWith('local');
    },
    toggleMic,
    toggleCamera,
    switchCamera,
    toggleScreen,
    replaceInput,
    setDisplay: (display) => update((call) => ({ ...call, display })),
    toggleCaptions: () => captions()?.toggle(),
    refreshEffects,
    answerWaiting,
    declineWaiting,
    retry: async () => {
      const retry = session.retry;
      if (retry === null) return;
      resetToIdle();
      await start(retry);
    },
    ...feedbackActions({ store, emit }),
    hearPreview: preview.hear,
    invite: controls.invite,
    muteParticipant: controls.muteParticipant,
    react: controls.react,
    dismiss: () => {
      if (read()?.phase.kind === 'ended') resetToIdle();
      store.setState({ notice: null });
    },
    handle,
    reauthenticated: () => undefined,
    pageHidden: onPageHide,
    dispose: () => {
      unlisten();
      resetToIdle();
    },
  };
}

let singleton: CallEngine | null = null;

/** Le moteur du navigateur — construit une fois, au premier besoin. */
export async function defaultCallEngine(): Promise<CallEngine> {
  if (singleton !== null) return singleton;
  const deps = loadDefaultEngineDeps();
  const engine = createCallEngine({ ...deps, store: callStore });
  singleton = engine;
  if (typeof window !== 'undefined') window.addEventListener('pagehide', engine.pageHidden);
  return engine;
}
