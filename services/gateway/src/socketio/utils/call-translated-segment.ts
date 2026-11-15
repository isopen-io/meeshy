import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';
import type {
  CallTranscriptionSegmentEvent,
  CallTranslatedSegmentEvent
} from '@meeshy/shared/types/video-call';

/**
 * Construit la charge `call:subtitle-segment` relayée aux auditeurs — le SEUL
 * site qui met en forme un segment traduit d'appel.
 *
 * Les étiquettes émises sont CANONIQUES (SSOT `normalizeLanguageForDedup`),
 * jamais la locale verbatim du client (`en-US`) : le schéma socket accepte un
 * code brut de 2–10 caractères, et les auditeurs résolvent leurs langues sous
 * forme canonique — un segment traduit ne porte jamais une source brute à côté
 * d'une cible canonique. Idempotent sur une valeur déjà canonique.
 */
export function buildTranslatedSegment(
  data: CallTranscriptionSegmentEvent,
  speaker: { userId: string; displayName: string | null },
  targetLanguage: string,
  translatedText?: string
): CallTranslatedSegmentEvent {
  return {
    callId: data.callId,
    segment: {
      ...(data.segment.id !== undefined ? { id: data.segment.id } : {}),
      text: data.segment.text,
      ...(translatedText !== undefined ? { translatedText } : {}),
      speakerId: speaker.userId,
      ...(speaker.displayName !== null ? { speakerDisplayName: speaker.displayName } : {}),
      startMs: data.segment.startMs,
      endMs: data.segment.endMs,
      isFinal: data.segment.isFinal,
      sourceLanguage: normalizeLanguageForDedup(data.segment.language),
      targetLanguage: normalizeLanguageForDedup(targetLanguage),
      confidence: data.segment.confidence,
      capturedAtMs: data.segment.capturedAtMs ?? Date.now()
    }
  };
}
