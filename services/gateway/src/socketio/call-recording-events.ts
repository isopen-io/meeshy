import type { z } from 'zod';
import { CLIENT_EVENTS, ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import {
  CALL_RECORDING_CONSENT_TIMEOUT_MS,
  type CallRecordingAck,
} from '@meeshy/shared/types/call-recording';
import type { MeeshyIOServer, MeeshySocket } from './typed-socket';
import type { CallRecordingService, RecordingBroadcast, RecordingOutcome } from '../services/calls/callRecording';
import {
  socketCallRecordingConsentSchema,
  socketCallRecordingRequestSchema,
  socketCallRecordingStopSchema,
} from '../validation/call-recording-schemas';
import { SOCKET_RATE_LIMITS, type SocketRateLimiter } from '../utils/socket-rate-limiter';
import { logger } from '../utils/logger';
import { guardedTimeout } from '../utils/guarded-timer';
import type { CallCaptureJournal } from '../services/calls/callCaptureJournal';

/**
 * Les trois verbes du consentement à l'enregistrement (#8064) — demander,
 * répondre, arrêter — et la diffusion de leurs effets dans la room de l'appel.
 *
 * Chaque entrée est authentifiée, limitée en débit et validée par Zod avant
 * d'atteindre `CallRecordingService`, qui seul décide. Une entrée invalide,
 * anonyme ou trop fréquente reçoit un refus dans son accusé et ne produit
 * aucune diffusion : rien ne démarre par défaut.
 */

export type CallRecordingAuthority = Pick<CallRecordingService, 'request' | 'consent' | 'stop' | 'arrival' | 'expire'>;

/** #16665 — le journal de l'appel note le début et la fin de l'enregistrement, là où ils se diffusent. */
export type CallRecordingJournal = Pick<CallCaptureJournal, 'callRecording'>;

export type CallRecordingEventDeps = {
  readonly io: MeeshyIOServer;
  readonly authority: CallRecordingAuthority;
  readonly journal: CallRecordingJournal;
  readonly rateLimiter: Pick<SocketRateLimiter, 'checkLimit'>;
  readonly schedule?: (task: () => void, delayMs: number) => void;
};

type Ack = (response: CallRecordingAck) => void;

const defaultSchedule = (task: () => void, delayMs: number): void => {
  guardedTimeout({ name: 'call-recording-task', afterMs: delayMs, logger, run: task }).unref();
};

const journalMoment = (broadcast: RecordingBroadcast): Parameters<CallRecordingJournal['callRecording']>[0] | null => {
  if (broadcast.event === 'started') return { callId: broadcast.payload.callId, userId: broadcast.payload.recorderId, kind: 'call-recording-started' };
  if (broadcast.event === 'stopped' && broadcast.payload.wasRecording) return { callId: broadcast.payload.callId, userId: broadcast.payload.byUserId, kind: 'call-recording-stopped' };
  return null;
};

export function broadcastRecording(io: MeeshyIOServer, journal: CallRecordingJournal, broadcasts: readonly RecordingBroadcast[]): void {
  broadcasts.forEach((broadcast) => {
    const moment = journalMoment(broadcast);
    if (moment !== null) {
      journal.callRecording(moment).catch((error: unknown) => logger.error('call-recording: journal write failed', { callId: moment.callId, error }));
    }
    const room = io.to(ROOMS.call(broadcast.payload.callId));
    switch (broadcast.event) {
      case 'requested':
        room.emit(SERVER_EVENTS.CALL_RECORDING_REQUESTED, broadcast.payload);
        return;
      case 'started':
        room.emit(SERVER_EVENTS.CALL_RECORDING_STARTED, broadcast.payload);
        return;
      case 'stopped':
        room.emit(SERVER_EVENTS.CALL_RECORDING_STOPPED, broadcast.payload);
        return;
    }
  });
}

export async function announceRecordingArrival(
  deps: Pick<CallRecordingEventDeps, 'io' | 'authority' | 'journal'>,
  callId: string,
  userId: string,
): Promise<void> {
  try {
    broadcastRecording(deps.io, deps.journal, await deps.authority.arrival(callId, userId));
  } catch (error) {
    logger.error('call-recording: arrival check failed', { callId, userId, error });
  }
}

export function registerCallRecordingEvents(
  deps: CallRecordingEventDeps,
  socket: MeeshySocket,
  getUserId: (socketId: string) => string | undefined,
): void {
  const schedule = deps.schedule ?? defaultSchedule;

  const handle = <S extends z.ZodTypeAny>(
    schema: S,
    run: (userId: string, input: z.infer<S>) => Promise<RecordingOutcome>,
  ) => async (raw: unknown, ack?: Ack): Promise<void> => {
    const reply = (response: CallRecordingAck) => {
      if (typeof ack === 'function') ack(response);
    };
    try {
      const userId = getUserId(socket.id);
      if (!userId) return reply({ success: false, code: 'NOT_AUTHENTICATED' });
      const allowed = await deps.rateLimiter.checkLimit(userId, SOCKET_RATE_LIMITS.CALL_RECORDING);
      if (!allowed) return reply({ success: false, code: 'RATE_LIMITED' });
      const parsed = schema.safeParse(raw);
      if (!parsed.success) return reply({ success: false, code: 'VALIDATION_ERROR' });
      const outcome = await run(userId, parsed.data);
      broadcastRecording(deps.io, deps.journal, outcome.broadcasts);
      reply(outcome.ack);
    } catch (error) {
      logger.error('call-recording: handler failed', { error });
      reply({ success: false, code: 'INTERNAL_ERROR' });
    }
  };

  const scheduleExpiry = (outcome: RecordingOutcome): void => {
    if (!outcome.ack.success) return;
    const { recordingId } = outcome.ack;
    schedule(() => {
      deps.authority
        .expire(recordingId)
        .then((broadcasts) => broadcastRecording(deps.io, deps.journal, broadcasts))
        .catch((error: unknown) => logger.error('call-recording: expiry failed', { recordingId, error }));
    }, CALL_RECORDING_CONSENT_TIMEOUT_MS + 500);
  };

  socket.on(
    CLIENT_EVENTS.CALL_RECORDING_REQUEST,
    handle(socketCallRecordingRequestSchema, async (userId, input) => {
      const outcome = await deps.authority.request(userId, input);
      scheduleExpiry(outcome);
      return outcome;
    }),
  );
  socket.on(
    CLIENT_EVENTS.CALL_RECORDING_CONSENT,
    handle(socketCallRecordingConsentSchema, (userId, input) => deps.authority.consent(userId, input)),
  );
  socket.on(
    CLIENT_EVENTS.CALL_RECORDING_STOP,
    handle(socketCallRecordingStopSchema, (userId, input) => deps.authority.stop(userId, input)),
  );
}
