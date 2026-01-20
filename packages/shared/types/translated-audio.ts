/**
 * Types pour les audios traduits
 * Aligné avec le schéma Prisma MessageTranslatedAudio
 */

/**
 * Audio traduit avec toutes ses métadonnées (correspond au modèle Prisma)
 * Utilisé pour les réponses API REST et les événements WebSocket
 */
export interface MessageTranslatedAudio {
  readonly id: string;
  readonly attachmentId: string;
  readonly messageId: string;
  readonly targetLanguage: string;
  readonly translatedText: string;
  readonly audioPath: string;
  readonly audioUrl: string;
  readonly durationMs: number;
  readonly format: string;
  readonly voiceCloned: boolean;
  readonly voiceQuality: number;
  readonly voiceModelId?: string | null;
  readonly ttsModel: string;
  readonly createdAt: Date | string;
}

/**
 * Version simplifiée pour les événements WebSocket et réponses API
 * Omet les champs redondants (attachmentId, messageId) et metadata (createdAt, format)
 * qui sont déjà connus du contexte
 */
export interface TranslatedAudioData {
  readonly id: string;
  readonly targetLanguage: string;
  readonly translatedText: string;
  readonly audioUrl: string;
  readonly durationMs: number;
  readonly voiceCloned: boolean;
  readonly voiceQuality: number;

  // Champs optionnels pour cas spécifiques
  readonly audioPath?: string;        // Chemin serveur (utile pour debug)
  readonly format?: string;            // Format audio (mp3, wav, ogg)
  readonly ttsModel?: string;          // Modèle TTS utilisé (xtts, openvoice)
  readonly voiceModelId?: string;      // ID du modèle vocal utilisé
  readonly audioDataBase64?: string;   // Données audio inline (pour multipart ZMQ)
  readonly audioMimeType?: string;     // Type MIME (pour multipart ZMQ)
}

/**
 * Convertit MessageTranslatedAudio (Prisma) vers TranslatedAudioData (API/WebSocket)
 */
export function toTranslatedAudioData(audio: MessageTranslatedAudio): TranslatedAudioData {
  return {
    id: audio.id,
    targetLanguage: audio.targetLanguage,
    translatedText: audio.translatedText,
    audioUrl: audio.audioUrl,
    durationMs: audio.durationMs,
    voiceCloned: audio.voiceCloned,
    voiceQuality: audio.voiceQuality,
    audioPath: audio.audioPath,
    format: audio.format,
    ttsModel: audio.ttsModel,
    voiceModelId: audio.voiceModelId || undefined
  };
}
