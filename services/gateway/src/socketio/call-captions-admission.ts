/**
 * **AUCUNE PAROLE D'UN APPEL CHIFFRÉ DE BOUT EN BOUT N'ATTEINT LA PASSERELLE**
 * (#13720, directives #9224, #9229).
 *
 * `call:transcription-segment` porte le texte de ce qu'un participant vient de
 * dire : la passerelle le relaie, le fait traduire et le grave pour le journal
 * d'après l'appel (`GET /calls/:callId/transcript`). `call:transcription-active`
 * n'en porte aucun, mais il fait capturer le micro des pairs pour la passerelle.
 * Dans une conversation `e2ee`, le serveur ne voit jamais le clair : les deux
 * événements y sont refusés.
 *
 * Fail-closed : une conversation absente, un régime non servi, un mode inconnu
 * ou une lecture qui échoue refusent aussi. Seuls le clair (mode nul ou vide)
 * et les modes que le serveur lit déjà (`server`, `hybrid`) admettent — la même
 * lecture que la traduction partagée (`sharedTranslationServerReadsMessage`),
 * jamais une seconde liste.
 *
 * Le refus part par l'ACQUITTEMENT de l'événement, jamais par `call:error` :
 * iOS raccroche sur un code d'erreur qu'il ne connaît pas
 * (`CallErrorDisposition`) et Android lit tout `call:error` comme un échec de
 * connexion. Un client publié qui émet encore des segments perd ses
 * sous-titres, jamais son appel.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { AckOf, CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import { CALL_ERROR_CODES, CALL_TERMINAL_STATUSES } from '@meeshy/shared/types/video-call';
import { sharedTranslationServerReadsMessage } from '@meeshy/shared/utils/shared-translation-eligibility';
import { isEndToEndMode } from '../services/messaging/e2eePlaintextAdmission';
import { logger } from '../utils/logger';

export const E2EE_CAPTIONS_REFUSAL_MESSAGE =
  'Cette conversation est chiffrée de bout en bout : le serveur ne reçoit aucun sous-titre';

export type CallCaptionsRefusalReason = 'e2ee' | 'regime-unreadable';

export type CallCaptionsAdmission =
  | { readonly kind: 'admitted' }
  | { readonly kind: 'ended' }
  | { readonly kind: 'refused'; readonly reason: CallCaptionsRefusalReason };

/** L'état de l'appel et le régime de sa conversation, en UNE lecture. */
export const CALL_CAPTIONS_SESSION_SELECT = {
  status: true,
  conversation: { select: { encryptionMode: true } },
} as const;

export type CallCaptionsSessionRow = {
  readonly status: string;
  readonly conversation?: { readonly encryptionMode?: string | null } | null;
} | null;

const ADMITTED: CallCaptionsAdmission = { kind: 'admitted' };
const ENDED: CallCaptionsAdmission = { kind: 'ended' };
const refused = (reason: CallCaptionsRefusalReason): CallCaptionsAdmission => ({ kind: 'refused', reason });

const serverReadsConversation = (encryptionMode: string | null): boolean =>
  sharedTranslationServerReadsMessage({
    conversationEncryptionMode: encryptionMode,
    messageIsEncrypted: false,
    messageEncryptionMode: null,
  });

/**
 * Un appel introuvable ou terminé se tait (`ended`), comme avant ce lot. Un
 * appel vivant n'est admis que si le régime de sa conversation est SERVI et lu
 * par le serveur.
 */
export function callCaptionsAdmissionOf(row: CallCaptionsSessionRow): CallCaptionsAdmission {
  if (row === null || (CALL_TERMINAL_STATUSES as readonly string[]).includes(row.status)) return ENDED;
  const encryptionMode = row.conversation?.encryptionMode;
  if (encryptionMode === undefined) return refused('regime-unreadable');
  if (isEndToEndMode(encryptionMode)) return refused('e2ee');
  return serverReadsConversation(encryptionMode) ? ADMITTED : refused('regime-unreadable');
}

/** Lit l'appel et le régime ; une lecture qui échoue refuse (fail-closed), elle ne lève jamais. */
export async function readCallCaptionsAdmission(
  prisma: PrismaClient,
  callId: string,
): Promise<CallCaptionsAdmission> {
  try {
    const row = await prisma.callSession.findUnique({ where: { id: callId }, select: CALL_CAPTIONS_SESSION_SELECT });
    return callCaptionsAdmissionOf(row);
  } catch {
    return refused('regime-unreadable');
  }
}

/**
 * La porte des deux gestionnaires : vrai seulement quand l'appel admet les
 * sous-titres. Un appel terminé se tait ; un refus est journalisé (sans aucun
 * texte) et répondu à l'émetteur par son acquittement, s'il en a passé un.
 */
export async function admitCallCaptions(
  prisma: PrismaClient,
  request: {
    readonly callId: string;
    readonly userId: string;
    readonly event: string;
    readonly ack?: AckOf<typeof CLIENT_EVENTS.CALL_TRANSCRIPTION_SEGMENT | typeof CLIENT_EVENTS.CALL_TRANSCRIPTION_ACTIVE>;
  },
): Promise<boolean> {
  const admission = await readCallCaptionsAdmission(prisma, request.callId);
  if (admission.kind !== 'refused') return admission.kind === 'admitted';
  logger.warn('Call captions refused', {
    callId: request.callId,
    userId: request.userId,
    event: request.event,
    reason: admission.reason,
    code: CALL_ERROR_CODES.E2EE_CAPTIONS_REFUSED,
  });
  if (typeof request.ack === 'function') {
    request.ack({
      success: false,
      error: E2EE_CAPTIONS_REFUSAL_MESSAGE,
      code: CALL_ERROR_CODES.E2EE_CAPTIONS_REFUSED,
    });
  }
  return false;
}
