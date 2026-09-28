/**
 * FAIRE SONNER — extrait de `CallEventsHandler.ts` (#8433, budget de taille).
 *
 * Deux portes font sonner quelqu'un : `call:initiate` (les membres de la
 * conversation) et `call:invite-participant` (une personne invitée dans un
 * appel déjà en cours). Elles partagent ce module pour que la sonnerie soit la
 * MÊME des deux côtés : `call:initiated` sur chaque socket personnelle, puis
 * un push VoIP / APNs / FCM à qui n'a pas de socket au premier plan. Une
 * invitation qui sonnerait autrement qu'un appel entrant serait une deuxième
 * sonnerie à maintenir, et la première à diverger.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { CALL_EVENTS } from '@meeshy/shared/types/video-call';
import type { CallInitiatedEvent } from '@meeshy/shared/types/video-call';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import { resolveParticipantAvatar } from '@meeshy/shared/utils/participant-helpers';
import type { MeeshyIOServer } from './typed-socket';
import type { CallService } from '../services/CallService';
import type { PushNotificationService } from '../services/PushNotificationService';
import { buildIncomingCallPushes } from '../services/call-incoming-push';
import { resolveDeviceCountries, resolveNotificationLangs, resolveVoipCapableUsers } from './call-recipients';
import { logger } from '../utils/logger';

/**
 * GW6(c) — a socket's `appForeground=true` is only trusted while the socket
 * is FRESH (last inbound packet within this window). A zombie socket (app
 * crashed / network died without presence:app-state=false) stays flagged
 * foreground until the Socket.IO ping timeout (~45s) — during that window a
 * ring would be lost. Window > pingInterval (25s) + jitter so a healthy
 * idle-foreground client (which only pongs every 25s) is never
 * misclassified — a false-stale would force a CallKit banner over the
 * in-app UI (client dedups by callId, but avoid it by construction).
 */
export const FOREGROUND_SOCKET_STALENESS_MS = 32_000;

export function isFreshForegroundSocket(
  socketData: { appForeground?: boolean; lastSeenAt?: number } | undefined
): boolean {
  if (socketData?.appForeground !== true) return false;
  const lastSeenAt = socketData.lastSeenAt;
  if (typeof lastSeenAt !== 'number') return true;
  return Date.now() - lastSeenAt <= FOREGROUND_SOCKET_STALENESS_MS;
}

type RingingSession = Awaited<ReturnType<CallService['getCallSession']>>;

/**
 * L'événement `call:initiated` d'une session.
 *
 * CRITIQUE — `mode` est l'architecture WebRTC (`'p2p' | 'sfu'`), PAS le type
 * média. Le type média (`'audio' | 'video'`) est stocké dans
 * `callSession.metadata.type` (cf. CallService.initiateCall). Sans ce champ
 * explicite, l'iOS recevait `mode: 'p2p'` et décidait toujours
 * `isVideo = false` → CallKit affichait l'incoming call en audio même quand
 * l'appelant voulait un appel vidéo.
 */
export function buildCallInitiatedEvent(callSession: RingingSession, conversationId: string): CallInitiatedEvent {
  const callType: 'audio' | 'video' = (callSession.metadata as { type?: string } | null)?.type === 'video' ? 'video' : 'audio';
  return {
    callId: callSession.id,
    conversationId,
    mode: callSession.mode,
    type: callType,
    initiator: {
      userId: callSession.initiator.id,
      username: callSession.initiator.username,
      displayName: callSession.initiator.displayName || undefined,
      avatar: callSession.initiator.avatar
    },
    // Group-calls gap analysis W6 — lets a ringing callee's UI tell
    // "Alice is calling you" (direct) apart from "Alice is calling the
    // Design Team" (group) without a separate conversation lookup.
    // `conversation` is already selected by `callSessionInclude`
    // (CallService.ts); the fallback only matters for a test double
    // that omits it, never for a real Prisma-backed session.
    conversationType: callSession.conversation?.type ?? 'direct',
    conversationTitle: callSession.conversation?.title ?? null,
    participants: callSession.participants.map(p => ({
      id: p.id,
      callSessionId: p.callSessionId,
      userId: p.participant?.userId || p.participantId,
      role: p.role,
      joinedAt: p.joinedAt,
      leftAt: p.leftAt,
      isAudioEnabled: p.isAudioEnabled,
      isVideoEnabled: p.isVideoEnabled,
      username: p.participant?.user?.username || p.participant?.displayName,
      displayName: p.participant?.displayName || p.participant?.user?.displayName,
      avatar: resolveParticipantAvatar(p.participant)
    }))
  };
}

export type CallRingDeps = {
  readonly io: MeeshyIOServer;
  readonly prisma: PrismaClient;
  readonly callService: Pick<CallService, 'generateIceServers'>;
};

export type CallRingSockets = {
  readonly notifiedSocketsCount: number;
  readonly foregroundUserIds: ReadonlySet<string>;
};

/**
 * `call:initiated` sur chaque socket de chaque appelé, avec SES identifiants
 * TURN.
 *
 * Audit P2-GW-1 — was `io.fetchSockets()` which scans EVERY connected
 * socket on the server (O(N), prohibitive at 10k+ connections). Each
 * callee user auto-joins `ROOMS.user(userId)` at auth (AuthHandler
 * L121/L181), so a per-user `io.in(ROOMS.user(memberId)).fetchSockets()`
 * is O(M) where M = the callee's online device count (typically 1–3).
 */
export async function ringCalleeSockets(
  deps: CallRingDeps,
  input: { readonly callerUserId: string; readonly calleeUserIds: readonly string[]; readonly event: CallInitiatedEvent }
): Promise<CallRingSockets> {
  let notifiedSocketsCount = 0;
  const foregroundUserIds = new Set<string>();
  for (const memberId of input.calleeUserIds) {
    if (memberId === input.callerUserId) continue;
    const memberSockets = await deps.io.in(ROOMS.user(memberId)).fetchSockets();
    if (memberSockets.length === 0) continue;
    // CALL-FIX 2026-06-06 — a member is reachable via the in-app socket UI
    // ONLY if at least one of its sockets is FOREGROUND. A backgrounded
    // socket still receives this emit but iOS has suspended the app so it
    // can't act on it → that member also needs a VoIP push (below).
    // GW6(c) — appForeground is only trusted on a FRESH socket (see
    // isFreshForegroundSocket): a zombie foreground socket must not
    // suppress the VoIP push (iOS dedups by callId anyway).
    if (memberSockets.some((s) => isFreshForegroundSocket(s.data))) {
      foregroundUserIds.add(memberId);
    }
    const memberIceServers = deps.callService.generateIceServers(memberId);
    for (const memberSocket of memberSockets) {
      memberSocket.emit(CALL_EVENTS.INITIATED, { ...input.event, iceServers: memberIceServers });
      notifiedSocketsCount++;
      logger.debug('📤 Sent call:initiated to member socket', {
        socketId: memberSocket.id,
        userId: memberId,
        callId: input.event.callId
      });
    }
  }
  return { notifiedSocketsCount, foregroundUserIds };
}

export type CallRingPushInput = {
  readonly callId: string;
  readonly conversationId: string;
  readonly callerUserId: string;
  readonly callerName: string;
  readonly callerAvatar?: string;
  readonly isVideo: boolean;
  readonly calleeUserIds: readonly string[];
  readonly foregroundUserIds: ReadonlySet<string>;
};

/**
 * Le push d'appel entrant à chaque appelé qui n'est PAS confirmé au premier
 * plan.
 *
 * CALL-FIX 2026-06-06 — VoIP-push every callee that is NOT confirmed
 * FOREGROUND. That covers BOTH truly offline members (no socket) AND
 * backgrounded members (socket still TCP-connected for ~45s but the app is
 * suspended and can't ring from the socket event). Only a foreground member
 * relies on the in-app socket UI and must NOT get a VoIP push (which would
 * force a CallKit banner over the in-app UI).
 */
export async function pushIncomingCall(
  deps: Pick<CallRingDeps, 'prisma' | 'callService'> & { readonly pushService: PushNotificationService },
  input: CallRingPushInput
): Promise<readonly string[]> {
  const offlineUserIds = input.calleeUserIds.filter(
    uid => uid !== input.callerUserId && !input.foregroundUserIds.has(uid)
  );

  // Prisme linguistique (audit 2026-07-11 #11) : titre/corps du push VoIP à
  // la langue résolue de CHAQUE callee. La résolution ne bloque jamais le
  // push (fallback 'fr').
  const offlineLangs = await resolveNotificationLangs(deps.prisma, offlineUserIds);

  // Guideline 5 (MIIT) — Apple requires CallKit to be inactive in China, and
  // PushKit contractually forces reportNewIncomingCall on every 'voip' push.
  // iOS skips VoIP-push registration entirely for China-region devices, so
  // route those callees' incoming-call push through the standard 'apns'
  // alert type instead. Unknown/null deviceCountry keeps 'voip'.
  const offlineCountries = await resolveDeviceCountries(deps.prisma, offlineUserIds);

  // GW6(b) — callees without an active voip token get a standard apns alert
  // instead (same payload, `.incomingCallAlert` routing).
  const voipCapableUsers = await resolveVoipCapableUsers(deps.prisma, offlineUserIds);

  for (const offlineUserId of offlineUserIds) {
    // Per-user TURN credentials so the answerer's RTCPeerConnection has TURN
    // at construction time. Apple via voip/apns, Android and web via FCM
    // (#8043) — see buildIncomingCallPushes.
    const pushes = buildIncomingCallPushes({
      calleeUserId: offlineUserId,
      callId: input.callId,
      conversationId: input.conversationId,
      callerUserId: input.callerUserId,
      callerName: input.callerName,
      callerAvatar: input.callerAvatar,
      isVideo: input.isVideo,
      language: offlineLangs.get(offlineUserId),
      iceServersJson: JSON.stringify(deps.callService.generateIceServers(offlineUserId)),
      isChinaDevice: offlineCountries.get(offlineUserId) === 'CN',
      voipCapable: voipCapableUsers.has(offlineUserId),
    });
    for (const push of pushes) {
      deps.pushService.sendToUser(push).catch(err => {
        logger.error('Failed to send incoming-call push', { userId: offlineUserId, types: push.types, error: err });
      });
    }
  }

  if (offlineUserIds.length > 0) {
    logger.info('📲 VoIP push sent to offline members', {
      callId: input.callId,
      offlineUserIds,
    });
  }
  return offlineUserIds;
}
