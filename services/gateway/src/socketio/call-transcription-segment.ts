/**
 * `call:transcription-segment` après la validation et le débit — extrait de
 * `CallEventsHandler.ts` (#16575, budget de taille).
 *
 * Trois lectures gouvernent un segment : QUI parle (participant actif de CET
 * appel), si l'appel ADMET les sous-titres (jamais en e2ee, #13720), et QUI
 * écoute dans quelle langue. Aucune ne dépend d'une autre : elles partent
 * ensemble, et le segment final attend la plus lente au lieu de leur somme
 * (~9 requêtes Prisma-Mongo enchaînées avant ce lot).
 *
 * Les DÉCISIONS restent prises dans l'ordre d'avant — locuteur, admission,
 * relais — et aucune lecture ne rejette (`resolveActiveCallSpeaker`,
 * `readCallCaptionsAdmission` et `readCallListeners` replient leurs échecs),
 * si bien que `Promise.all` ne peut pas lever et qu'un refus abandonne la
 * lecture des auditeurs sans promesse orpheline. La lecture des auditeurs ne
 * porte que des langues : rien n'en sort tant que les deux gardes n'ont pas
 * admis le segment.
 */
import { CALL_EVENTS, CALL_ERROR_CODES } from '@meeshy/shared/types/video-call';
import type { CallError, CallTranscriptionSegmentEvent } from '@meeshy/shared/types/video-call';
import { ROOMS, type AckOf, type CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { MeeshySocket as Socket } from './typed-socket';
import { resolveActiveCallSpeaker, type CallParticipantResolverDeps } from './call-participants';
import { readCallCaptionsAdmission, settleCallCaptionsAdmission } from './call-captions-admission';
import {
  type CallTranscriptionRelayDeps,
  type CallListenersRead,
  persistTranscriptionSegment,
  readCallListeners,
  translateAndEmitSegment,
} from './call-transcription-relay';
import { buildTranslatedSegment } from './utils/call-translated-segment';
import { logger } from '../utils/logger';

export type CallTranscriptionSegmentDeps = CallTranscriptionRelayDeps & CallParticipantResolverDeps;

export async function relayTranscriptionSegment(
  deps: CallTranscriptionSegmentDeps,
  socket: Socket,
  request: {
    readonly userId: string;
    readonly data: CallTranscriptionSegmentEvent;
    readonly ack?: AckOf<typeof CLIENT_EVENTS.CALL_TRANSCRIPTION_SEGMENT>;
  }
): Promise<void> {
  const { userId, data, ack } = request;
  const translates = data.segment.isFinal && deps.zmqClient() !== null;
  const noListenerRead: Promise<CallListenersRead | undefined> = Promise.resolve(undefined);

  const [speaker, admission, listeners] = await Promise.all([
    resolveActiveCallSpeaker(deps, userId, data.callId),
    readCallCaptionsAdmission(deps.prisma, data.callId),
    translates ? readCallListeners(deps.prisma, data.callId) : noListenerRead,
  ]);

  // Authorization — only an ACTIVE PARTICIPANT OF THIS CALL may inject
  // transcription text into it (not merely a member of its conversation).
  if (!speaker) {
    socket.emit(CALL_EVENTS.ERROR, {
      code: CALL_ERROR_CODES.NOT_A_PARTICIPANT,
      message: 'You are not a participant in this call',
      callId: data?.callId
    } as CallError);
    return;
  }

  // #13720 — AVANT tout relais, traduction ou écriture : une parole d'un
  // appel e2ee (ou au régime illisible) n'atteint rien.
  if (!settleCallCaptionsAdmission(admission, { callId: data.callId, userId, event: CALL_EVENTS.TRANSCRIPTION_SEGMENT, ack })) return;

  // Journal metadata normalized once so every downstream emission stamps the
  // SAME capturedAtMs — the clients' journal ordering key. Legacy clients
  // that don't send it get reception time.
  const segmentEvent: CallTranscriptionSegmentEvent = {
    callId: data.callId,
    segment: {
      ...data.segment,
      capturedAtMs: data.segment.capturedAtMs ?? Date.now()
    }
  };
  const stampedSpeaker = { userId, displayName: speaker.displayName };

  // Persistance serveur du journal (décision produit 2026-08-13) : seuls les
  // segments FINAUX sont stockés, jamais les partiels. Ne rejette jamais.
  const persistedTranscriptionId = data.segment.isFinal
    ? persistTranscriptionSegment(deps, segmentEvent, speaker.participantId)
    : null;

  if (translates) {
    await translateAndEmitSegment(deps, socket, segmentEvent, stampedSpeaker, persistedTranscriptionId, listeners);
  } else {
    // Security fix 2026-08-13: stamp the authenticated `userId`, never the
    // client-supplied `data.segment.speakerId`.
    socket.to(ROOMS.call(data.callId)).emit(
      CALL_EVENTS.TRANSLATED_SEGMENT,
      buildTranslatedSegment(segmentEvent, stampedSpeaker, data.segment.language)
    );
  }

  logger.debug('Transcription segment relayed', {
    callId: data.callId,
    speakerId: userId,
    isFinal: data.segment.isFinal
  });
}
