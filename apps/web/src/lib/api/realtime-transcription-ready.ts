import type { QueryClient } from '@tanstack/react-query';

import type { TranscriptionReadyEventData } from '@meeshy/shared/types/socketio-events/audio';
import type { AudioTranscription } from '@meeshy/shared/types/attachment-transcription';
import { maskedAttachment } from '@meeshy/shared/utils/attachment-protection';

import { requestAttachmentTranscription } from './attachment-processing';
import type { ConversationsDeps } from './conversations';
import type { HttpTransport } from './http';
import { findCachedThreadMessage, patchThreadMessages } from './messages';
import type { Attachment, Message } from './types';

/** Garde de FORME, fail-closed : la charge nomme sa conversation, son message, sa pièce et un texte. */
export function isTranscriptionReady(payload: unknown): payload is TranscriptionReadyEventData {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  if (typeof p.conversationId !== 'string' || typeof p.messageId !== 'string' || typeof p.attachmentId !== 'string') return false;
  const t = p.transcription;
  return typeof t === 'object' && t !== null && typeof (t as Record<string, unknown>).text === 'string' && typeof (t as Record<string, unknown>).language === 'string';
}

/**
 * `audio:transcription-ready` (#10742) — LA TRANSCRIPTION DEMANDÉE ARRIVE SANS
 * RECHARGEMENT. « Transcrire » met le travail en file (`status: processing`) ;
 * le résultat revient par cet évènement, que la passerelle diffuse avec
 * `message:attachment-updated`. Ce dernier lit la pièce en base, qui peut ne pas
 * porter encore la transcription : celui-ci la porte lui-même, et la greffe sur
 * la BONNE pièce d'un message à plusieurs vocaux, adressée par son identifiant.
 *
 * Fail-closed, comme `applyMessageAttachmentUpdated` : fil fermé, message ou
 * pièce inconnus, pièce voilée ou déjà transcrite ⇒ rien. Jamais un ajout.
 */
export function applyTranscriptionReady(queryClient: QueryClient, data: TranscriptionReadyEventData): void {
  const { text, language, confidence, source, segments } = data.transcription;
  graftTranscription(queryClient, {
    conversationId: data.conversationId,
    messageId: data.messageId,
    attachmentId: data.attachmentId,
    transcription: {
      type: 'audio',
      transcribedText: text,
      language,
      confidence: confidence ?? 0,
      source: source === 'mobile' || source === 'ocr' || source === 'vision' ? source : 'whisper',
      ...(segments === undefined ? {} : { segments: [...segments] }),
    },
  });
}

/**
 * LA GREFFE D'UNE TRANSCRIPTION SUR SA PIÈCE — le site unique, que la
 * transcription arrive par le temps réel ou par la réponse de « Transcrire »
 * au menu (#11370). Mêmes refus : fil fermé, message ou pièce inconnus, pièce
 * voilée ou déjà transcrite ⇒ rien.
 */
export function graftTranscription(
  queryClient: QueryClient,
  data: { readonly conversationId: string; readonly messageId: string; readonly attachmentId: string; readonly transcription: AudioTranscription },
): void {
  const existing = findCachedThreadMessage(queryClient, data.conversationId, data.messageId);
  const attachments = existing?.attachments;
  if (existing === undefined || attachments === undefined) return;
  const target = attachments.find((a) => a.id === data.attachmentId);
  if (target === undefined || maskedAttachment(target) || target.transcription != null) return;
  const next: Message = {
    ...existing,
    attachments: attachments.map((a): Attachment => (a.id === data.attachmentId ? { ...a, transcription: data.transcription } : a)),
  };
  patchThreadMessages(queryClient, data.conversationId, (messages) => messages.map((m) => (m.id === data.messageId ? next : m)));
}

export type OnDemandTranscription = 'grafted' | 'queued' | 'failed';

/**
 * « TRANSCRIRE » DEPUIS LE MENU (#11370) — la demande, puis la greffe d'une
 * transcription déjà faite ; mise en file, elle arrivera par le temps réel
 * (`applyTranscriptionReady`). L'issue est rendue à l'appelant, qui la dit.
 */
export async function transcribeOnDemand(params: {
  readonly queryClient: QueryClient;
  readonly conversationId: string;
  readonly messageId: string;
  readonly attachmentId: string;
  readonly source: ConversationsDeps['source'];
  readonly transport: Pick<HttpTransport, 'request'>;
}): Promise<OnDemandTranscription> {
  const result = await requestAttachmentTranscription({ source: params.source, transport: params.transport, attachmentId: params.attachmentId });
  if (!result.ok) return 'failed';
  const { transcription } = result.data;
  if (transcription === null) return 'queued';
  graftTranscription(params.queryClient, { ...params, transcription });
  return 'grafted';
}
