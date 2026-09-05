import type { MeeshySocket as Socket } from './typed-socket';
import type { CallService } from '../services/CallService';
import { CALL_EVENTS, CALL_ERROR_CODES } from '@meeshy/shared/types/video-call';
import type { CallError, CallMediaToggleClientEvent, CallMediaToggleEvent } from '@meeshy/shared/types/video-call';
import { validateSocketEvent, isValidationFailure } from '../middleware/validation';
import { socketMediaToggleSchema } from '../validation/call-schemas';
import { checkSocketRateLimit, SOCKET_RATE_LIMITS, type SocketRateLimiter } from '../utils/socket-rate-limiter';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import { logger } from '../utils/logger';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * CE DONT LE BASCULEMENT MÉDIA A BESOIN, et rien de plus. Quatre membres du
 * gestionnaire, passés explicitement plutôt que capturés par `this` : la liste
 * DIT la surface réelle de cette opération, là où une méthode de classe la
 * laissait deviner.
 */
export type MediaToggleDeps = {
  readonly callService: CallService;
  readonly rateLimiter: SocketRateLimiter;
  readonly mapMediaToggleError: (error: unknown, fallbackMessage: string) => CallError;
  readonly resolveActiveCallParticipant: (userId: string, callId: string) => Promise<any>;
};

/**
 * LE CORPS PARTAGÉ de `call:toggle-audio` et `call:toggle-video` — les deux
 * gestionnaires étaient des copies de ~90 lignes ne différant que par le
 * littéral `mediaType`, si bien que tout correctif futur (authentification,
 * limitation de débit, validation, résolution du participant) devait être
 * appliqué DEUX fois et pouvait diverger en silence entre l'audio et la vidéo.
 * Les commentaires CVE-002 (limitation) et CVE-006 (validation) ci-dessous
 * valent identiquement pour les deux médias.
 *
 * Sorti de `CallEventsHandler` le 2026-09-05 : le fichier était repassé
 * au-dessus de sa dette (#4426) après #4599, et ce corps est la plus grande
 * unité qui ne dépende que de QUATRE membres — assez peu pour que la liste des
 * dépendances reste lisible, contrairement aux deux autres candidates (six et
 * sept membres).
 */
export async function handleMediaToggle(
  deps: MediaToggleDeps,
  socket: Socket,
  getUserId: (socketId: string) => string | undefined,
  data: CallMediaToggleClientEvent,
  mediaType: 'audio' | 'video'
): Promise<void> {
  try {
    const userId = getUserId(socket.id);
    if (!userId) {
      socket.emit(CALL_EVENTS.ERROR, {
        code: 'NOT_AUTHENTICATED',
        message: 'User not authenticated',
        callId: data?.callId
      } as CallError);
      return;
    }

    // CVE-002: Rate limiting check
    const rateLimitPassed = await checkSocketRateLimit(
      socket,
      userId,
      SOCKET_RATE_LIMITS.MEDIA_TOGGLE,
      deps.rateLimiter,
      CALL_EVENTS.ERROR
    );
    if (!rateLimitPassed) return;

    // CVE-006: Validate input data
    const validation = validateSocketEvent(socketMediaToggleSchema, data);
    if (isValidationFailure(validation)) {
      const { error: validationError, details: validationDetails } = validation;
      socket.emit(CALL_EVENTS.ERROR, {
        code: CALL_ERROR_CODES.VALIDATION_ERROR,
        message: validationError,
        details: validationDetails ? { issues: validationDetails } : undefined,
        callId: data?.callId
      } as CallError);
      return;
    }

    logger.info(`📞 Socket: call:toggle-${mediaType}`, {
      socketId: socket.id,
      userId,
      callId: data.callId,
      enabled: data.enabled
    });

    // Audit P2-GW-5 — `updateParticipantMedia` queries on
    // `participantId` (Participant.id ObjectId), NOT userId. Passing
    // userId here matched nothing and the toggle silently failed.
    // Resolve to the real participantId before calling the service.
    const resolved = await deps.resolveActiveCallParticipant(userId, data.callId);
    if (!resolved) {
      socket.emit(CALL_EVENTS.ERROR, {
        code: CALL_ERROR_CODES.NOT_A_PARTICIPANT,
        message: 'You are not a participant in this call',
        callId: data?.callId
      } as CallError);
      return;
    }
    const { participantId } = resolved;
    await deps.callService.updateParticipantMedia(
      data.callId,
      participantId,
      mediaType,
      data.enabled
    );

    // P0-3 — broadcast to the OTHER participants only. The sender already
    // updated its own state locally and must NOT receive its own echo:
    // iOS treats any received call:media-toggled as the REMOTE peer's state
    // (drives the muted indicator / avatar placeholder). `socket.to`
    // excludes the sender; `io.to` would include it.
    //
    // Vague 140 — `participantId` alone (CallParticipant.participantId, the
    // FK to Participant.id) never matches a web roster entry's `.id`
    // (CallParticipant.id, its own PK) NOR its `.userId`/`.participantId`
    // lookup fields (the latter is never populated client-side) for a
    // registered peer — `updateParticipant` silently no-op'd on every
    // remote mute/camera toggle, leaving the peer's indicator permanently
    // stale. Include `userId`, same fix/rationale as `call:quality-alert`/
    // `call:screen-capture-alert` (Vague 132).
    const toggleEvent: CallMediaToggleEvent = {
      callId: data.callId,
      participantId,
      userId: resolved.userId,
      mediaType,
      enabled: data.enabled
    };

    socket.to(ROOMS.call(data.callId)).emit(
      CALL_EVENTS.MEDIA_TOGGLED,
      toggleEvent
    );

    logger.info(`✅ Socket: ${mediaType === 'audio' ? 'Audio' : 'Video'} toggled`, {
      callId: data.callId,
      userId,
      enabled: data.enabled
    });
  } catch (error) {
    logger.error(`❌ Socket: Error toggling ${mediaType}`, error);

    socket.emit(CALL_EVENTS.ERROR, { ...deps.mapMediaToggleError(error, `Failed to toggle ${mediaType}`), callId: data?.callId } as CallError);
  }
}
