/**
 * Ce que l'app cliente RAPPORTE sur elle-même pendant un appel — extrait de
 * `CallEventsHandler.ts` (#7632, budget de taille).
 *
 * Une responsabilité, et elle n'est pas celle du reste du handler : les quatre
 * événements ci-dessous ne font ni naître, ni joindre, ni terminer un appel.
 * Ils portent l'état de l'APPLICATION qui participe — son premier plan, sa
 * capture d'écran, sa télémétrie de fin. Le reste de `CallEventsHandler`
 * gouverne l'APPEL ; ce module gouverne ce que le client dit de lui.
 *
 * ─── LA DOCTRINE QUI LES RÉUNIT TOUS LES QUATRE ─────────────────────────────
 *
 * **Le `participantId` du client n'est JAMAIS cru sur parole.** Les quatre
 * gestionnaires le RÉSOLVENT côté serveur depuis le `userId` authentifié, et
 * chacun paie une raison différente de le faire :
 *
 *  - `backgrounded` / `foregrounded` : sans cette résolution, un participant
 *    pouvait déclarer le `participantId` de son PAIR en arrière-plan, et
 *    fausser chez lui la tolérance de heartbeat et le mode de sonnerie
 *    (socket ou push VoIP) ;
 *  - `screen-capture-detected` : correctif de sécurité du 2026-07-03 — dans un
 *    appel à deux, chacun pouvait FORGER ou SUPPRIMER l'alerte de
 *    confidentialité de l'autre ;
 *  - `analytics` : l'autorisation est passée par trois états. Non gardée, puis
 *    portée à l'appartenance de CONVERSATION — ce qui laissait encore tout
 *    membre soumettre de la télémétrie pour un appel qu'il n'avait jamais
 *    rejoint, puisque ce contrôle ne regarde aucune ligne `CallParticipant`.
 *
 * ─── ET POURQUOI `analytics` RÉSOUT AUTREMENT QUE LES TROIS AUTRES ──────────
 *
 * Il appelle `resolveEverCallParticipantId`, pas `resolveActiveCallParticipantId` :
 * la télémétrie part APRÈS que l'émetteur a raccroché, donc l'exigence
 * `leftAt: null` des résolveurs « actifs » rejetterait l'expéditeur LÉGITIME.
 * La garde reste réelle — une ligne `CallParticipant` pour CET appel est
 * exigée, quel que soit `leftAt`.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { CallService } from '../services/CallService';
import type { MeeshySocket as Socket } from './typed-socket';
import { CALL_EVENTS, CALL_ERROR_CODES } from '@meeshy/shared/types/video-call';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import { validateSocketEvent, isValidationFailure } from '../middleware/validation';
import {
  socketCallBackgroundedSchema,
  socketCallForegroundedSchema,
  socketCallScreenCaptureDetectedSchema,
  socketCallAnalyticsSchema
} from '../validation/call-schemas';
import { checkSocketRateLimit, SOCKET_RATE_LIMITS, getSocketRateLimiter } from '../utils/socket-rate-limiter';
import { logger } from '../utils/logger';
import type { CallError, CallScreenCaptureEvent, CallAnalyticsEvent } from '@meeshy/shared/types/video-call';

/**
 * Ce que ces gestionnaires empruntent à l'instance.
 *
 * Les trois résolveurs voyagent en FONCTIONS et non en données : ils lisent la
 * base à chaque appel, et les capturer autrement figerait une réponse d'il y a
 * une seconde — un participant qui vient de partir resterait « actif ».
 */
export type CallClientReportDeps = {
  readonly prisma: PrismaClient;
  readonly callService: CallService;
  readonly rateLimiter: ReturnType<typeof getSocketRateLimiter>;
  readonly resolveActiveCallParticipant: (
    userId: string,
    callId: string
  ) => Promise<{ participantId: string; userId: string } | null>;
  readonly resolveActiveCallParticipantId: (userId: string, callId: string) => Promise<string | null>;
  readonly resolveEverCallParticipantId: (userId: string, callId: string) => Promise<string | null>;
};

/**
 * Le contexte d'authentification de la session socket, tenu par
 * `setupCallEvents` : `getUserId` interroge la table vivante du manager,
 * `rememberAuth` alimente le cache dont le gestionnaire `disconnect` dépend
 * (audit P1-28 — le manager peut avoir purgé sa table avant notre nettoyage).
 */
export type CallSocketAuth = {
  readonly getUserId: (socketId: string) => string | undefined;
  readonly rememberAuth: (userId: string) => void;
};

/** Le refus de validation, identique sur les quatre gestionnaires. */
function emitValidationError(socket: Socket, error: string, details: unknown, callId?: string): void {
  socket.emit(CALL_EVENTS.ERROR, {
    code: CALL_ERROR_CODES.VALIDATION_ERROR,
    message: error,
    details: details ? { issues: details } : undefined,
    callId
  } as CallError);
}

/**
 * Enregistre les quatre gestionnaires de rapport client sur ce socket.
 *
 * Appelé une fois par socket depuis `setupCallEvents`.
 */
export function registerCallClientReportEvents(
  deps: CallClientReportDeps,
  socket: Socket,
  auth: CallSocketAuth
): void {
  const { getUserId, rememberAuth } = auth;

  // ─── call:backgrounded ───────────────────────────────────────────────────
  // The iOS app signals it is going to background while a call is active.
  // We flip socket.data.appForeground so the ringing logic knows to use VoIP
  // push for future incoming calls instead of socket delivery.
  socket.on(CALL_EVENTS.BACKGROUNDED, async (data: { callId: string; participantId: string }) => {
    try {
      const userId = getUserId(socket.id);
      if (!userId) return;
      rememberAuth(userId);

      const rateLimitPassed = await checkSocketRateLimit(
        socket,
        userId,
        SOCKET_RATE_LIMITS.CALL_BACKGROUNDED,
        deps.rateLimiter,
        CALL_EVENTS.ERROR
      );
      if (!rateLimitPassed) return;

      const validation = validateSocketEvent(socketCallBackgroundedSchema, data);
      if (isValidationFailure(validation)) {
        emitValidationError(socket, validation.error, validation.details, data?.callId);
        return;
      }

      // Resolve the caller's own participantId rather than trusting the
      // client-supplied one — otherwise a participant could flag a peer's
      // participantId as backgrounded and skew that peer's heartbeat
      // tolerance / ringing delivery (socket vs VoIP push). Must be an
      // active participant of THIS call, not merely its conversation.
      const backgroundedParticipantId = await deps.resolveActiveCallParticipantId(userId, data.callId);
      if (!backgroundedParticipantId) return;

      socket.data.appForeground = false;
      deps.callService.recordParticipantBackgrounded(data.callId, backgroundedParticipantId);

      logger.debug('📞 Socket: call:backgrounded', {
        callId: data.callId,
        participantId: backgroundedParticipantId,
        userId,
      });
    } catch (error) {
      logger.error('Error handling call:backgrounded', { error });
    }
  });

  // ─── call:foregrounded ───────────────────────────────────────────────────
  // The iOS app has returned to foreground. Reset the flag so future ringing
  // can be delivered via socket again.
  socket.on(CALL_EVENTS.FOREGROUNDED, async (data: { callId: string; participantId: string }) => {
    try {
      const userId = getUserId(socket.id);
      if (!userId) return;
      rememberAuth(userId);

      const rateLimitPassed = await checkSocketRateLimit(
        socket,
        userId,
        SOCKET_RATE_LIMITS.CALL_FOREGROUNDED,
        deps.rateLimiter,
        CALL_EVENTS.ERROR
      );
      if (!rateLimitPassed) return;

      const validation = validateSocketEvent(socketCallForegroundedSchema, data);
      if (isValidationFailure(validation)) {
        emitValidationError(socket, validation.error, validation.details, data?.callId);
        return;
      }

      // Same rationale as call:backgrounded — resolve the caller's own
      // participantId instead of trusting the client-supplied one.
      const foregroundedParticipantId = await deps.resolveActiveCallParticipantId(userId, data.callId);
      if (!foregroundedParticipantId) return;

      socket.data.appForeground = true;
      deps.callService.clearParticipantBackgrounded(data.callId, foregroundedParticipantId);

      logger.debug('📞 Socket: call:foregrounded', {
        callId: data.callId,
        participantId: foregroundedParticipantId,
        userId,
      });
    } catch (error) {
      logger.error('Error handling call:foregrounded', { error });
    }
  });

  // ─── call:screen-capture-detected ────────────────────────────────────────
  // A participant started or stopped screen capture. Relay to everyone else
  // in the call room so they can display/dismiss the capture warning.
  socket.on(CALL_EVENTS.SCREEN_CAPTURE_DETECTED, async (data: CallScreenCaptureEvent) => {
    try {
      const userId = getUserId(socket.id);
      if (!userId) return;
      rememberAuth(userId);

      const rateLimitPassed = await checkSocketRateLimit(
        socket,
        userId,
        SOCKET_RATE_LIMITS.CALL_SCREEN_CAPTURE,
        deps.rateLimiter,
        CALL_EVENTS.ERROR
      );
      if (!rateLimitPassed) return;

      const validation = validateSocketEvent(socketCallScreenCaptureDetectedSchema, data);
      if (isValidationFailure(validation)) {
        emitValidationError(socket, validation.error, validation.details, data?.callId);
        return;
      }

      if (!socket.rooms.has(ROOMS.call(data.callId))) {
        return;
      }

      // Security fix 2026-07-03: resolve the caller's own participantId
      // server-side rather than trusting the client-supplied one — same
      // rationale as call:backgrounded/call:foregrounded. Otherwise either
      // participant in a call could impersonate the other, forging or
      // suppressing that peer's screen-capture privacy alert.
      const screenCaptureReporter = await deps.resolveActiveCallParticipant(userId, data.callId);
      if (!screenCaptureReporter) return;

      const alertEvent: CallScreenCaptureEvent = {
        callId: data.callId,
        participantId: screenCaptureReporter.participantId,
        // Vague 132 — same mismatch as call:quality-alert: without this, a
        // registered peer's roster lookup (keyed by User.id) can never
        // match `participantId` alone (a Participant.id).
        userId: screenCaptureReporter.userId,
        isCapturing: data.isCapturing,
      };
      socket.to(ROOMS.call(data.callId)).emit(CALL_EVENTS.SCREEN_CAPTURE_ALERT, alertEvent);

      logger.info('📞 Socket: call:screen-capture-detected relayed', {
        callId: data.callId,
        participantId: screenCaptureReporter.participantId,
        isCapturing: data.isCapturing,
        userId,
      });
    } catch (error) {
      logger.error('Error handling call:screen-capture-detected', { error });
    }
  });

  // ─── call:analytics ──────────────────────────────────────────────────────
  // Fire-and-forget lifecycle telemetry emitted once at call end by iOS.
  // Validated and logged; no response sent back to the client.
  // Cycle 107 — la forme vient du contrat (`CallAnalyticsEvent`), plus d'une
  // transcription de dix-neuf champs dans cette signature. L'événement était
  // écouté, validé et agrégé sans figurer dans `ClientToServerEvents` : c'est
  // le cast d'`io` qui le rendait possible, et c'est le seul défaut de ce lot
  // que la porte typée aurait attrapé toute seule.
  socket.on(CALL_EVENTS.ANALYTICS, async (data: CallAnalyticsEvent) => {
    try {
      const userId = getUserId(socket.id);
      if (!userId) return;
      rememberAuth(userId);

      const rateLimitPassed = await checkSocketRateLimit(
        socket,
        userId,
        SOCKET_RATE_LIMITS.CALL_ANALYTICS,
        deps.rateLimiter,
        CALL_EVENTS.ERROR
      );
      if (!rateLimitPassed) return;

      const validation = validateSocketEvent(socketCallAnalyticsSchema, data);
      if (isValidationFailure(validation)) {
        emitValidationError(socket, validation.error, validation.details, data?.callId);
        return;
      }

      // Authorization — was previously unchecked, letting any authenticated
      // user submit telemetry against an arbitrary callId, then scoped to
      // conversation membership via `resolveParticipantIdFromCall` — which
      // still let ANY member of the conversation submit fabricated
      // telemetry for a call they never joined, since it never looks at
      // CallParticipant rows at all. `resolveEverCallParticipantId` checks
      // the caller actually has a CallParticipant row for THIS call
      // (regardless of `leftAt`, since analytics fires after the sender
      // has already left — `resolveActiveCallParticipantId`'s `leftAt:
      // null` requirement would reject the legitimate sender).
      const analyticsParticipantId = await deps.resolveEverCallParticipantId(userId, data.callId);
      if (!analyticsParticipantId) return;

      logger.info('📞 Socket: call:analytics received', {
        callId: data.callId,
        platform: data.platform,
        durationSeconds: data.durationSeconds,
        setupTimeMs: data.setupTimeMs,
        negotiationTimeMs: data.negotiationTimeMs ?? -1,
        reconnectionCount: data.reconnectionCount,
        networkTransitions: data.networkTransitions,
        averageRtt: data.averageRtt,
        averagePacketLoss: data.averagePacketLoss,
        maxPacketLoss: data.maxPacketLoss,
        codec: data.codec,
        isVideo: data.isVideo,
        endReason: data.endReason,
        qualityDistribution: data.qualityDistribution,
        userId,
      });

      // Persist the VALIDATED payload on this participant's CallParticipant
      // row so reliability can be tracked on real calls (reconnectionCount,
      // qualityDistribution, negotiationTimeMs…) — log-only telemetry is
      // invisible to dashboards. Per-participant row: both ends emit at
      // hangup within the same second and must never clobber each other.
      // Best-effort — telemetry loss must stay invisible to the client.
      //
      // Scoped to the most-recently-joined row for this participantId, not
      // a blanket updateMany: a participant who left and rejoined mid-call
      // (churn) has MULTIPLE CallParticipant rows sharing the same
      // participantId, and a broad updateMany stamped this same final
      // analytics blob onto every prior row too — corrupting per-session
      // telemetry for any dashboard built off this field.
      try {
        const targetParticipant = await deps.prisma.callParticipant.findFirst({
          where: { callSessionId: data.callId, participantId: analyticsParticipantId },
          orderBy: { joinedAt: 'desc' },
          select: { id: true }
        });
        if (targetParticipant) {
          await deps.prisma.callParticipant.update({
            where: { id: targetParticipant.id },
            data: { analytics: validation.data }
          });
        }
      } catch (persistError) {
        logger.error('call:analytics persistence failed (telemetry lost, client unaffected)', {
          callId: data.callId, participantId: analyticsParticipantId, error: persistError
        });
      }
    } catch (error) {
      logger.error('Error handling call:analytics', { error });
    }
  });
}
