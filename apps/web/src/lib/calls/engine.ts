import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import {
  decodeAck,
  decodeCallId,
  decodeEnded,
  decodeError,
  decodeIceRefresh,
  decodeIceServers,
  decodeInitiated,
  decodeMediaToggled,
  decodeParticipantJoined,
  decodeParticipantLeft,
  decodeSessionMembers,
  decodeSignal,
  decodeTranslatedSegment,
  mapServerEndReason,
  type DecodedInitiated,
  type DecodedPerson,
} from './call-decode';
import { acquireCallMedia, acquireCamera, mediaFailureOf, stopStream, type Facing } from './call-media';
import {
  callStore,
  isCallLive,
  meshPhase,
  patchMember,
  withCaption,
  withMember,
  withoutMember,
  type ActiveCall,
  type CallEndReason,
  type CallMedia,
  type CallStoreApi,
  type WaitingCall,
} from './call-store';
import { playCue, primeTones, startTone, stopTone } from './call-tones';
import { currentCallTransport, listenCallEvents, type CallTransport } from './call-transport';
import { createPeerLink, type LinkState, type OutgoingSignal, type PeerLink, type PeerLinkDeps } from './peer-link';

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
const QUALITY_INTERVAL_MS = 5_000;

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
  readonly createLink: (deps: PeerLinkDeps) => PeerLink;
  readonly createStream: (tracks: readonly MediaStreamTrack[]) => MediaStream;
  readonly now: () => number;
  readonly schedule: (fn: () => void, ms: number) => unknown;
  readonly cancel: (handle: unknown) => void;
  readonly repeat: (fn: () => void, ms: number) => unknown;
  readonly stopRepeat: (handle: unknown) => void;
  readonly tones: { readonly start: typeof startTone; readonly stop: typeof stopTone; readonly cue: typeof playCue; readonly prime: typeof primeTones };
  readonly ringLabel: () => string;
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
  readonly setDisplay: (display: ActiveCall['display']) => void;
  readonly toggleCaptions: () => void;
  readonly answerWaiting: () => Promise<void>;
  readonly declineWaiting: () => void;
  readonly retry: () => Promise<void>;
  readonly dismiss: () => void;
  readonly handle: (event: string, payload: unknown) => void;
  readonly reauthenticated: () => void;
  readonly pageHidden: () => void;
  readonly dispose: () => void;
};

type Session = {
  iceServers: readonly RTCIceServer[];
  links: Map<string, PeerLink>;
  participantIds: Map<string, string>;
  ringTimer: unknown;
  heartbeat: unknown;
  qualityTimer: unknown;
  lastQualityReport: number;
  retry: StartCallRequest | null;
};

const emptySession = (): Session => ({
  iceServers: [],
  links: new Map(),
  participantIds: new Map(),
  ringTimer: null,
  heartbeat: null,
  qualityTimer: null,
  lastQualityReport: 0,
  retry: null,
});

function baseCall(request: StartCallRequest, direction: ActiveCall['direction'], phase: ActiveCall['phase']): ActiveCall {
  return {
    callId: null,
    conversationId: request.conversationId,
    media: request.media,
    direction,
    isGroup: request.isGroup,
    title: request.title,
    avatar: request.avatar,
    callerName: null,
    phase,
    connectedAt: null,
    endedDurationSec: null,
    micMuted: false,
    cameraOn: request.media === 'video',
    facing: 'user',
    members: {},
    display: 'full',
    localStream: null,
    remoteStreams: {},
    captions: [],
    captionsOn: false,
    quality: null,
  };
}

export function createCallEngine(deps: CallEngineDeps): CallEngine {
  const { store } = deps;
  let session = emptySession();
  let localStream: MediaStream | null = null;
  let endedTimer: unknown = null;
  let incomingTimer: unknown = null;
  let generation = 0;

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
    incomingTimer = clear(incomingTimer);
  };

  const teardownMedia = (): void => {
    for (const link of session.links.values()) link.close();
    session.links.clear();
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
    stopTimers();
    teardownMedia();
    deps.tones.stop();
    if (call.phase.kind === 'connected' || call.phase.kind === 'reconnecting') deps.tones.cue('ended');
    const elapsed = durationSec ?? (call.connectedAt === null ? null : Math.max(0, Math.round((deps.now() - call.connectedAt) / 1000)));
    write({ ...call, phase: { kind: 'ended', reason, detail }, endedDurationSec: elapsed, localStream: null, remoteStreams: {} });
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
      startQuality();
      return;
    }
    if (mesh === 'reconnecting' && call.phase.kind === 'connected') {
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
    });
    session.links.set(userId, link);
    return link;
  };

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
    session.qualityTimer = deps.repeat(() => void sampleQuality(), QUALITY_INTERVAL_MS);
  };

  const sampleQuality = async (): Promise<void> => {
    const call = read();
    const link = [...session.links.values()][0];
    if (call === null || call.callId === null || link === undefined) return;
    const pc = link.connection();
    if (typeof pc.getStats !== 'function') return;
    const report = await pc.getStats().catch(() => null);
    if (report === null) return;
    let rtt = 0;
    let lost = 0;
    let received = 0;
    report.forEach((entry: Record<string, unknown>) => {
      if (entry.type === 'candidate-pair' && entry.nominated === true && typeof entry.currentRoundTripTime === 'number') rtt = entry.currentRoundTripTime * 1000;
      if (entry.type === 'inbound-rtp') {
        lost += typeof entry.packetsLost === 'number' ? entry.packetsLost : 0;
        received += typeof entry.packetsReceived === 'number' ? entry.packetsReceived : 0;
      }
    });
    const packetLoss = received + lost === 0 ? 0 : (lost / (received + lost)) * 100;
    const quality = rtt > 400 || packetLoss > 8 ? 'poor' : rtt > 250 || packetLoss > 3 ? 'fair' : 'good';
    update((current) => (current.quality === quality ? current : { ...current, quality }));
    if (deps.now() - session.lastQualityReport < 10_000) return;
    session.lastQualityReport = deps.now();
    const level = quality === 'good' ? 'good' : quality === 'fair' ? 'fair' : 'poor';
    emit(CLIENT_EVENTS.CALL_QUALITY_REPORT, { callId: call.callId, stats: { packetLoss: Math.min(100, packetLoss), rtt: Math.round(rtt), level, timestamp: deps.now() } });
  };

  const acquire = async (video: boolean, facing: Facing): Promise<MediaStream | null> => {
    try {
      const stream = await deps.acquireMedia({ video, facing });
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
    for (const member of decodeSessionMembers(ack.data.callSession)) remember(member, member.participantId);
    return true;
  };

  const joinExisting = async (request_: JoinCallRequest, callId: string): Promise<void> => {
    const token = generation;
    const stream = await acquire(request_.media === 'video', 'user');
    if (stream === null || token !== generation) return;
    update((call) => ({ ...call, callId, localStream: stream, cameraOn: stream.getVideoTracks().length > 0, phase: { kind: 'connecting' } }));
    const ack = decodeAck(await request(CLIENT_EVENTS.CALL_JOIN, { callId, settings: { audioEnabled: true, videoEnabled: stream.getVideoTracks().length > 0 } }));
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
    write(baseCall(callRequest, 'outgoing', { kind: 'outgoing' }));
    const stream = await acquire(callRequest.media === 'video', 'user');
    if (stream === null || token !== generation) return;
    update((call) => ({ ...call, localStream: stream, cameraOn: stream.getVideoTracks().length > 0 }));
    emit(CLIENT_EVENTS.CALL_FORCE_LEAVE, { conversationId: callRequest.conversationId });
    const ack = decodeAck(
      await request(CLIENT_EVENTS.CALL_INITIATE, {
        conversationId: callRequest.conversationId,
        type: callRequest.media,
        settings: { audioEnabled: true, videoEnabled: stream.getVideoTracks().length > 0 },
      }),
    );
    if (token !== generation || read()?.phase.kind === 'ended') return;
    if (!ack.ok) {
      if (ack.code === 'CALL_ALREADY_ACTIVE') {
        const activeId = await deps.fetchActiveCallId(callRequest.conversationId).catch(() => null);
        if (activeId !== null && token === generation) {
          const ackJoin = decodeAck(await request(CLIENT_EVENTS.CALL_JOIN, { callId: activeId, settings: { audioEnabled: true, videoEnabled: stream.getVideoTracks().length > 0 } }));
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
    update((call) => ({ ...call, callId }));
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
    write({
      ...baseCall({ conversationId: event.conversationId, media: event.media, title, avatar: event.isGroup ? null : event.initiator.avatar, isGroup: event.isGroup }, 'incoming', { kind: 'incoming' }),
      callId: event.callId,
      callerName: event.initiator.name,
    });
    remember(event.initiator, null);
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
    write({ ...call, phase: { kind: 'connecting' } });
    const video = call.media === 'video' && options?.audioOnly !== true;
    const stream = await acquire(video, 'user');
    if (stream === null) {
      void request(CLIENT_EVENTS.CALL_END, { callId, reason: 'rejected' });
      return;
    }
    if (token !== generation) return;
    update((current) => ({ ...current, localStream: stream, cameraOn: stream.getVideoTracks().length > 0 }));
    const ack = decodeAck(await request(CLIENT_EVENTS.CALL_JOIN, { callId, settings: { audioEnabled: true, videoEnabled: stream.getVideoTracks().length > 0 } }));
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
    const existing = session.links.get(joined.person.userId);
    if (existing !== undefined) {
      existing.close();
      session.links.delete(joined.person.userId);
    }
    const link = linkTo(joined.person.userId);
    update((current) => patchMember(current, joined.person.userId, { link: 'connecting' }));
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
        const callId = decodeCallId(payload);
        if (callId !== null && read()?.callId === callId) finish('remote');
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
        const userId = toggled.userId ?? (toggled.participantId === null ? null : (session.participantIds.get(toggled.participantId) ?? null));
        if (userId === null) return;
        update((current) => patchMember(current, userId, toggled.mediaType === 'audio' ? { micMuted: !toggled.enabled } : { cameraOn: toggled.enabled }));
        return;
      }
      case SERVER_EVENTS.CALL_ICE_SERVERS_REFRESHED: {
        const refresh = decodeIceRefresh(payload);
        if (refresh === null || read()?.callId !== refresh.callId) return;
        session.iceServers = refresh.iceServers;
        for (const link of session.links.values()) link.setIceServers(refresh.iceServers);
        return;
      }
      case SERVER_EVENTS.CALL_TRANSLATED_SEGMENT: {
        const segment = decodeTranslatedSegment(payload);
        const call = read();
        if (segment === null || call === null || call.callId !== segment.callId) return;
        const speakerName = segment.speakerName ?? call.members[segment.speakerId]?.name ?? '';
        update((current) => ({
          ...current,
          captions: withCaption(current.captions, { id: segment.id, speakerId: segment.speakerId, speakerName, text: segment.text, original: segment.original, isFinal: segment.isFinal, at: deps.now() }),
        }));
        return;
      }
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
    if (call.callId !== null) emit(CLIENT_EVENTS.CALL_TOGGLE_AUDIO, { callId: call.callId, enabled: !muted });
  };

  const setCamera = async (track: MediaStreamTrack | null): Promise<void> => {
    const stream = localStream;
    if (stream === null) return;
    for (const old of stream.getVideoTracks()) {
      stream.removeTrack(old);
      old.stop();
    }
    if (track !== null) stream.addTrack(track);
    await Promise.all([...session.links.values()].map((link) => link.setVideoTrack(track).catch(() => undefined)));
    update((call) => ({ ...call, cameraOn: track !== null, localStream: deps.createStream(stream.getTracks()) }));
  };

  const toggleCamera = async (): Promise<void> => {
    const call = read();
    if (call === null || !isCallLive(call) || call.phase.kind === 'incoming') return;
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

  const answerWaiting = async (): Promise<void> => {
    const waiting = store.getState().waiting;
    if (waiting === null) return;
    store.setState({ waiting: null });
    leaveServer();
    resetToIdle();
    generation += 1;
    const token = generation;
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
      generation += 1;
      hangupWith('local');
    },
    toggleMic,
    toggleCamera,
    switchCamera,
    setDisplay: (display) => update((call) => ({ ...call, display })),
    toggleCaptions: () => update((call) => ({ ...call, captionsOn: !call.captionsOn })),
    answerWaiting,
    declineWaiting,
    retry: async () => {
      const retry = session.retry;
      if (retry === null) return;
      resetToIdle();
      await start(retry);
    },
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

/** Rend la liste des pistes d'un flux — dans un navigateur, un `MediaStream` neuf pour que l'écran relise. */
function defaultCreateStream(tracks: readonly MediaStreamTrack[]): MediaStream {
  return new MediaStream([...tracks]);
}

let singleton: CallEngine | null = null;

export async function loadDefaultEngineDeps(): Promise<Omit<CallEngineDeps, 'store'>> {
  const [{ apiDeps }, { sessionStore }, { resolveViewer }, { fetchActiveCallId }, { translate }, { currentInterfaceLanguage }] = await Promise.all([
    import('@/lib/api/deps'),
    import('@/lib/api/session'),
    import('@/lib/api/viewer'),
    import('./active-call'),
    import('@/lib/i18n-catalog'),
    import('@/lib/interface-language'),
  ]);
  return {
    transport: currentCallTransport,
    viewerId: () => resolveViewer({ source: apiDeps.source, session: sessionStore.getState().session }).id ?? '',
    fetchActiveCallId: (conversationId) => fetchActiveCallId(apiDeps, conversationId),
    acquireMedia: (options) => acquireCallMedia(options),
    acquireCamera: (facing) => acquireCamera({ facing }),
    createLink: createPeerLink,
    createStream: defaultCreateStream,
    now: Date.now,
    schedule: (fn, ms) => setTimeout(fn, ms),
    cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    repeat: (fn, ms) => setInterval(fn, ms),
    stopRepeat: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
    tones: { start: startTone, stop: stopTone, cue: playCue, prime: primeTones },
    ringLabel: () => translate(currentInterfaceLanguage(), 'call.incoming.title.tab'),
  };
}

/** Le moteur du navigateur — construit une fois, au premier besoin. */
export async function defaultCallEngine(): Promise<CallEngine> {
  if (singleton !== null) return singleton;
  const deps = await loadDefaultEngineDeps();
  if (singleton !== null) return singleton;
  const engine = createCallEngine({ ...deps, store: callStore });
  singleton = engine;
  if (typeof window !== 'undefined') window.addEventListener('pagehide', engine.pageHidden);
  return engine;
}
