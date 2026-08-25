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
  isFinal?: boolean;    // true = segment finalisé, false = partiel (streaming)
  translatedText?: string;       // Texte traduit via NLLB
  translatedLanguage?: string;   // Langue cible de la traduction (ISO 639-1)
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
  speakerAnalysis?: Record<string, unknown>;
  senderVoiceIdentified?: boolean;
  senderSpeakerId?: string;
  voiceQualityAnalysis?: Record<string, unknown>;

  // Spécifique document: structure et layout
  pageCount?: number;
  documentLayout?: Record<string, unknown>;

  // Spécifique image: métadonnées vision
  imageDescription?: string;
  detectedObjects?: readonly Record<string, unknown>[];
  ocrRegions?: readonly Record<string, unknown>[];
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
  metadata?: Record<string, unknown>;

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
      /* istanbul ignore next -- getAvailableLanguages already filters undefined entries */
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

/**
 * Les transcriptions traduites d'un attachment, sous la forme que la DESCENTE
 * du Prisme consomme : `langue → texte`, sans enveloppe.
 *
 * Un vocal est du contenu comme un autre (« le Prisme s'applique à TOUT le
 * contenu », `/CLAUDE.md` § Cohérence), mais ses traductions ne vivent pas là
 * où celles d'un message vivent : `Message.translations` traduit
 * `Message.content`, et la transcription — un AUTRE texte — a la sienne, ici.
 * C'est ce décalage qui a tenu la bannière d'un vocal hors du Prisme jusqu'au
 * cycle 123, alors que sa ligne de liste, elle, descendait.
 *
 * Cette fonction est le site UNIQUE du dépouillement, pour la raison de la
 * leçon 264 : un consommateur qui a besoin d'un peu plus que ce que rend le
 * résolveur existant réécrit la boucle chez lui, et c'est ainsi que naissent
 * les familles divergentes que les cycles 118 à 122 ont payées.
 *
 * Accepte `unknown` — la valeur sort d'une colonne `Json` Prisma, donc d'une
 * frontière de désérialisation, et un appelant qui devrait la caster avant
 * d'appeler perdrait la garde. Les entrées soft-supprimées et les textes vides
 * sont écartés : une entrée qu'aucun lecteur ne doit servir n'a pas à concourir
 * pour un rang, et un texte vide effacerait la bannière au lieu de la traduire.
 */
export function transcriptTranslationTexts(
  translations: unknown
): Readonly<Record<string, string>> {
  if (!translations || typeof translations !== 'object') return {};
  const entries = translations as Record<string, Partial<AttachmentTranslation> | null>;
  return Object.fromEntries(
    Object.entries(entries)
      .filter(([, t]) => typeof t?.transcription === 'string'
        && t.transcription.trim() !== ''
        && !t.deletedAt)
      .map(([lang, t]) => [lang, t!.transcription as string])
  );
}

/**
 * Une piste TRADUITE, réduite à ce qu'une surface doit remettre pour l'attacher :
 * le fichier, son étiquette de type, sa durée.
 */
export interface AttachmentTranslationTrack {
  readonly url: string;
  /** Absent quand le producteur n'a pas dit son format — cf. `normalizeTrackMimeType`. */
  readonly mimeType?: string;
  readonly durationMs?: number;
}

/**
 * Les deux producteurs de `format` DIVERGENT, et aucun n'a tort chez lui :
 * le chemin message écrit l'extension nue (`audioMimeType.replace('audio/', '')`
 * ⇒ `'mp3'`), le chemin post écrit le mime complet (`'audio/mp3'`).
 *
 * On NORMALISE plutôt que de choisir : un `typeHint` UTI faux fait rejeter la
 * pièce jointe par l'extension de notification iOS, en silence. Et on ne rend
 * RIEN plutôt que d'inventer quand le format est absent — la NSE sait déduire
 * un UTI de l'extension du fichier, une étiquette fausse l'en empêcherait.
 */
function normalizeTrackMimeType(format: unknown): string | undefined {
  if (typeof format !== 'string') return undefined;
  const trimmed = format.trim();
  if (trimmed === '') return undefined;
  return trimmed.includes('/') ? trimmed : `audio/${trimmed}`;
}

/**
 * La JUMELLE de {@link transcriptTranslationTexts}, pour le MÉDIUM — cycle 128.
 *
 * La MÊME entrée de la carte porte deux choses : le TEXTE traduit de la
 * transcription, et la PISTE que le TTS en a produite. Le cycle 123 n'a
 * dépouillé que le premier, si bien que la bannière d'un vocal servait la bonne
 * langue en texte et attachait le fichier ORIGINAL en son — une bannière
 * française au-dessus d'un `UNNotificationAttachment` qui parle anglais.
 *
 * > Une résolution de CONTENU se mesure sur tout ce que la charge TRANSPORTE,
 * > jamais sur sa seule chaîne (leçon 275).
 *
 * Site UNIQUE du dépouillement, pour la raison de sa jumelle : un consommateur
 * qui a besoin d'un peu plus que ce que rend le résolveur existant réécrit la
 * boucle chez lui, et c'est ainsi que naissent les familles divergentes.
 *
 * Les deux jumelles ne rendent PAS le même jeu de langues, et c'est le point :
 * une traduction TEXTE peut exister sans que le TTS ait produit sa piste. Une
 * entrée sans `url` concourt donc pour le texte et pas pour le son — ce qui
 * fait retomber l'élection sur le fichier original plutôt que sur une URL vide.
 *
 * Accepte `unknown` : la valeur sort d'une colonne `Json` Prisma, donc d'une
 * frontière de désérialisation.
 */
export function transcriptTranslationTracks(
  translations: unknown
): Readonly<Record<string, AttachmentTranslationTrack>> {
  if (!translations || typeof translations !== 'object') return {};
  const entries = translations as Record<string, Partial<AttachmentTranslation> | null>;
  return Object.fromEntries(
    Object.entries(entries)
      .filter(([, t]) => typeof t?.url === 'string' && t.url.trim() !== '' && !t.deletedAt)
      .map(([lang, t]) => {
        const mimeType = normalizeTrackMimeType(t!.format);
        const durationMs = typeof t!.durationMs === 'number' ? t!.durationMs : undefined;
        return [lang, {
          url: (t!.url as string).trim(),
          ...(mimeType ? { mimeType } : {}),
          ...(durationMs !== undefined ? { durationMs } : {}),
        }];
      })
  );
}
