import * as attachmentsEndpoints from '@meeshy/shared/api/endpoints/attachments';
import type { AttachmentTranslation } from '@meeshy/shared/types/attachment-audio';
import type { AudioTranscription, TranscriptionSegment, TranscriptionSourceType } from '@meeshy/shared/types/attachment-transcription';

import type { ConversationsDeps } from './conversations';
import { MEDIA_ON_DEMAND } from './fixtures-media';
import type { ApiResult } from './http';

/**
 * LES DEMANDES DU LECTEUR AUDIO PLEIN ÉCRAN (#9256) — miroir
 * d'`AttachmentService.requestTranscription` et `.translate`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Services/AttachmentService.swift`),
 * sur les MÊMES routes : `POST /attachments/:id/transcribe` (Whisper seul) et
 * `POST /attachments/:id/translate` (NLLB + TTS, `services/gateway/src/routes/
 * attachments/translation.ts`).
 *
 * La passerelle rend une transcription DÉJÀ faite sur-le-champ (`completed`) ;
 * sinon elle met le travail en file (`processing`) et le résultat arrive par
 * `message:attachment-updated`, que le temps réel greffe sur la pièce du fil
 * (`applyMessageAttachmentUpdated`). Une traduction arrive TOUJOURS par ce
 * canal : sa réponse ne porte pas la piste dans la forme de la pièce.
 */
export type OnDemandStatus = 'completed' | 'processing';

export type TranscriptionRequestOutcome = {
  readonly status: OnDemandStatus;
  readonly transcription: AudioTranscription | null;
};

export type TranslationRequestOutcome = {
  readonly status: OnDemandStatus;
  readonly translation: AttachmentTranslation | null;
};

const SOURCES: readonly TranscriptionSourceType[] = ['mobile', 'whisper', 'ocr', 'vision'];

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null;

const segmentOf = (value: unknown): TranscriptionSegment | null =>
  isRecord(value) && typeof value.startMs === 'number' && typeof value.endMs === 'number' && typeof value.text === 'string'
    ? { startMs: value.startMs, endMs: value.endMs, text: value.text }
    : null;

/** La transcription de la RÉPONSE, dans la forme de `Attachment.transcription` —
 * la passerelle nomme son texte `text`, la pièce le lit dans `transcribedText`
 * comme dans `text` (`servedTranscript`, `prism.ts`). */
function transcriptionOf(value: unknown): AudioTranscription | null {
  if (!isRecord(value)) return null;
  const text = typeof value.text === 'string' ? value.text : typeof value.transcribedText === 'string' ? value.transcribedText : '';
  if (text === '' || typeof value.language !== 'string') return null;
  const source = SOURCES.find((candidate) => candidate === value.source) ?? 'whisper';
  const segments = Array.isArray(value.segments) ? value.segments.map(segmentOf).filter((segment) => segment !== null) : undefined;
  return {
    type: 'audio',
    transcribedText: text,
    language: value.language,
    confidence: typeof value.confidence === 'number' ? value.confidence : 0,
    source,
    ...(segments !== undefined ? { segments } : {}),
  };
}

export async function requestAttachmentTranscription(
  params: ConversationsDeps & { readonly attachmentId: string },
): Promise<ApiResult<TranscriptionRequestOutcome>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const supplied = MEDIA_ON_DEMAND[params.attachmentId]?.transcription;
    const transcription = supplied?.type === 'audio' ? supplied : null;
    return { ok: true, data: { status: transcription === null ? 'processing' : 'completed', transcription } };
  }
  const result = await params.transport.request<unknown>({
    method: 'POST',
    path: attachmentsEndpoints.byAttachmentIdTranscribe(params.attachmentId),
    body: {},
  });
  if (!result.ok) return result;
  const transcription = isRecord(result.data) ? transcriptionOf(result.data.transcription) : null;
  return { ok: true, data: { status: transcription === null ? 'processing' : 'completed', transcription } };
}

export async function requestAttachmentTranslation(
  params: ConversationsDeps & { readonly attachmentId: string; readonly targetLanguage: string; readonly sourceLanguage?: string },
): Promise<ApiResult<TranslationRequestOutcome>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const translation = MEDIA_ON_DEMAND[params.attachmentId]?.translations[params.targetLanguage] ?? null;
    return { ok: true, data: { status: translation === null ? 'processing' : 'completed', translation } };
  }
  const result = await params.transport.request<unknown>({
    method: 'POST',
    path: attachmentsEndpoints.byAttachmentIdTranslate(params.attachmentId),
    body: {
      targetLanguages: [params.targetLanguage],
      ...(params.sourceLanguage !== undefined ? { sourceLanguage: params.sourceLanguage } : {}),
    },
  });
  if (!result.ok) return result;
  return { ok: true, data: { status: 'processing', translation: null } };
}
