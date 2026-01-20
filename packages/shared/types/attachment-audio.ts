/**
 * Types génériques pour les transcriptions et traductions d'attachments
 * Support: audio, video, document, image
 *
 * Ces types correspondent aux champs JSON `transcription` et `translations`
 * du model MessageAttachment après le refactoring V2.
 */

/**
 * Segment de transcription avec timestamps et speaker
 * Utilisé pour audio et video
 */
export interface TranscriptionSegment {
  text: string;
  startMs: number;      // Milliseconds (aligné avec DB)
  endMs: number;        // Milliseconds (aligné avec DB)
  speakerId?: string;   // ID du speaker (s0, s1, s2, ...)
  voiceSimilarityScore?: number;  // Score de similarité vocale avec l'utilisateur (0-1)
  confidence?: number;
  language?: string;    // Langue détectée pour ce segment (ISO 639-1)
}

/**
 * Type d'attachment transcriptible
 */
export type TranscriptableType = 'audio' | 'video' | 'document' | 'image';

/**
 * Source de transcription
 */
export type TranscriptionSource =
  | 'mobile'      // Transcription depuis mobile
  | 'whisper'     // Whisper AI (audio/video)
  | 'voice_api'   // API vocale
  | 'ocr'         // OCR pour documents/images
  | 'vision_api'; // Vision API pour images

/**
 * Transcription générique pour tous types d'attachments
 * Stockée dans MessageAttachment.transcription (Json)
 *
 * Support:
 * - Audio: transcription vocale avec segments et speakers
 * - Video: sous-titres avec timestamps
 * - Document: extraction texte via OCR
 * - Image: description via Vision API ou OCR
 */
export interface AttachmentTranscription {
  type?: TranscriptableType; // Optionnel pour compatibilité avec transcriptions existantes (inféré depuis mimeType)
  text: string;
  language: string;
  confidence: number;
  source: TranscriptionSource;
  model?: string;

  // Spécifique audio/video: segments avec timestamps
  segments?: TranscriptionSegment[];
  speakerCount?: number;
  primarySpeakerId?: string;
  durationMs?: number;

  // Spécifique audio: analyse vocale avancée
  speakerAnalysis?: any;
  senderVoiceIdentified?: boolean;
  senderSpeakerId?: string;
  voiceQualityAnalysis?: any;

  // Spécifique document: structure et layout
  pageCount?: number;
  documentLayout?: any;

  // Spécifique image: métadonnées vision
  imageDescription?: string;
  detectedObjects?: any[];
  ocrRegions?: any[];
}

/**
 * Type de traduction disponible
 */
export type TranslationType = 'audio' | 'video' | 'text' | 'document' | 'image';

/**
 * Traduction générique pour tous types d'attachments
 * Stockée dans MessageAttachment.translations[lang] (Json)
 *
 * Support:
 * - Audio: TTS avec clonage vocal
 * - Video: sous-titres traduits
 * - Text: texte traduit
 * - Document: document traduit (PDF, etc.)
 * - Image: texte overlay traduit
 */
export interface AttachmentTranslation {
  type: TranslationType;
  transcription: string;      // Texte traduit
  path?: string;              // Chemin fichier local
  url?: string;               // URL accessible

  // Spécifique audio/video
  durationMs?: number;        // Durée
  format?: string;            // Format (mp3, mp4, pdf, png, etc.)
  cloned?: boolean;           // Clonage vocal activé (audio uniquement)
  quality?: number;           // Qualité (0-1)
  voiceModelId?: string;      // ID modèle vocal (audio uniquement)
  ttsModel?: string;          // Modèle TTS (xtts, openvoice)
  segments?: TranscriptionSegment[];  // Segments avec timestamps pour l'audio traduit

  // Spécifique document/image
  pageCount?: number;         // Nombre de pages (document)
  overlayApplied?: boolean;   // Overlay de texte appliqué (image)

  // Métadonnées communes
  createdAt: Date | string;   // Date de création
  updatedAt?: Date | string;  // Dernière modification
  deletedAt?: Date | string | null;  // Soft delete
}

/**
 * Map de traductions par langue
 * Stockée dans MessageAttachment.translations (Json)
 */
export type AttachmentTranslations = Record<string, AttachmentTranslation>;

/**
 * Type helper pour extraire une traduction spécifique
 */
export type TranslationForLanguage<T extends AttachmentTranslations, L extends keyof T> = T[L];

/**
 * Langues supportées (ISO 639-1)
 */
export type SupportedLanguage =
  | 'en'  // Anglais
  | 'fr'  // Français
  | 'es'  // Espagnol
  | 'de'  // Allemand
  | 'it'  // Italien
  | 'pt'  // Portugais
  | 'ru'  // Russe
  | 'ja'  // Japonais
  | 'zh'  // Chinois
  | 'ar'  // Arabe
  | 'hi'  // Hindi
  | 'ko'  // Coréen
  | string; // Autres langues

/**
 * Type pour un attachment avec transcription et traductions
 */
export interface AttachmentWithAudio {
  id: string;
  messageId?: string;
  fileName: string;
  fileUrl: string;
  duration?: number;

  // Nouvelles propriétés JSON
  transcription?: AttachmentTranscription;
  translations?: AttachmentTranslations;
  metadata?: Record<string, any>;

  createdAt: Date;
}

/**
 * Helper pour vérifier si une traduction existe pour une langue
 */
export function hasTranslation(
  translations: AttachmentTranslations | undefined,
  language: SupportedLanguage
): boolean {
  if (!translations || !(language in translations)) {
    return false;
  }
  const translation = translations[language];
  return !translation?.deletedAt;
}

/**
 * Helper pour obtenir une traduction ou undefined
 */
export function getTranslation(
  translations: AttachmentTranslations | undefined,
  language: SupportedLanguage
): AttachmentTranslation | undefined {
  if (!translations || !(language in translations)) {
    return undefined;
  }

  const translation = translations[language];
  if (!translation) {
    return undefined;
  }

  // Filtrer les traductions soft-deleted
  if (translation.deletedAt) {
    return undefined;
  }

  return translation;
}

/**
 * Helper pour obtenir toutes les langues disponibles (non supprimées)
 */
export function getAvailableLanguages(
  translations: AttachmentTranslations | undefined
): SupportedLanguage[] {
  if (!translations) {
    return [];
  }

  return Object.keys(translations).filter(
    lang => {
      const translation = translations[lang];
      return translation && !translation.deletedAt;
    }
  ) as SupportedLanguage[];
}

/**
 * Helper pour soft-delete une traduction
 */
export function softDeleteTranslation(
  translations: AttachmentTranslations,
  language: SupportedLanguage
): AttachmentTranslations {
  if (!(language in translations)) {
    return translations;
  }

  const existingTranslation = translations[language];
  if (!existingTranslation) {
    return translations;
  }

  return {
    ...translations,
    [language]: {
      ...existingTranslation,
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    } as AttachmentTranslation
  };
}

/**
 * Helper pour ajouter/mettre à jour une traduction
 */
export function upsertTranslation(
  translations: AttachmentTranslations | undefined,
  language: SupportedLanguage,
  translation: Omit<AttachmentTranslation, 'createdAt' | 'updatedAt'>
): AttachmentTranslations {
  const existing = translations?.[language];
  const now = new Date().toISOString();

  return {
    ...(translations || {}),
    [language]: {
      ...translation,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      deletedAt: null
    }
  };
}

/**
 * Format Socket.IO pour les traductions (générique: audio, video, text, document, image)
 * Utilisé pour les événements temps réel et l'API REST
 */
export interface SocketIOTranslation {
  readonly id: string;
  readonly type: TranslationType;
  readonly targetLanguage: string;
  readonly translatedText: string;
  readonly url: string;
  readonly durationMs?: number;
  readonly cloned?: boolean;        // Clonage vocal (audio uniquement)
  readonly quality?: number;         // Qualité (0-1)
  readonly path?: string;
  readonly format?: string;
  readonly ttsModel?: string;
  readonly voiceModelId?: string;
  readonly segments?: readonly TranscriptionSegment[]; // Segments de transcription avec timestamps
  readonly pageCount?: number;
  readonly overlayApplied?: boolean;
}

/**
 * @deprecated Utiliser SocketIOTranslation
 * Alias pour compatibilité avec ancien code
 */
export type SocketIOTranslatedAudio = SocketIOTranslation;

/**
 * Convertit AttachmentTranslation (JSON) vers SocketIOTranslation (API/WebSocket)
 */
export function toSocketIOTranslation(
  attachmentId: string,
  language: SupportedLanguage,
  translation: AttachmentTranslation
): SocketIOTranslation {
  return {
    id: `${attachmentId}_${language}`,
    type: translation.type,
    targetLanguage: language,
    translatedText: translation.transcription,
    url: translation.url || '',
    durationMs: translation.durationMs,
    cloned: translation.cloned,        // ✅ Mapping direct: cloned → cloned
    quality: translation.quality,      // ✅ Mapping direct: quality → quality
    path: translation.path,
    format: translation.format,
    ttsModel: translation.ttsModel,
    voiceModelId: translation.voiceModelId,
    segments: translation.segments, // Segments de transcription de l'audio traduit
    pageCount: translation.pageCount,
    overlayApplied: translation.overlayApplied
  };
}

/**
 * @deprecated Utiliser toSocketIOTranslation
 * Alias pour compatibilité avec ancien code
 */
export const toSocketIOAudio = toSocketIOTranslation;

/**
 * Convertit toutes les traductions d'un attachment pour Socket.IO
 */
export function toSocketIOTranslations(
  attachmentId: string,
  translations: AttachmentTranslations | undefined
): SocketIOTranslation[] {
  if (!translations) {
    return [];
  }

  return getAvailableLanguages(translations)
    .map(lang => {
      const translation = translations[lang];
      if (!translation) {
        return null;
      }
      return toSocketIOTranslation(attachmentId, lang, translation);
    })
    .filter((tr): tr is SocketIOTranslation => tr !== null);
}

/**
 * @deprecated Utiliser toSocketIOTranslations
 * Alias pour compatibilité avec ancien code
 */
export const toSocketIOAudios = toSocketIOTranslations;
