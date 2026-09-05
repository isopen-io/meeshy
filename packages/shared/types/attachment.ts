/**
 * Types pour le système d'attachements de messages
 * Partagés entre frontend et backend
 */

// V2: Import pour compatibilité types legacy dans Attachment de base
import type { AttachmentTranscription } from './attachment-transcription.js';

// V2: Import nouveaux types JSON intégrés
import type {
  AttachmentTranscription as AttachmentTranscriptionV2,
  AttachmentTranslations,
  SocketIOTranslatedAudio,
} from './attachment-audio.js';

/**
 * Types d'attachements supportés
 */
export type AttachmentType = 'image' | 'document' | 'audio' | 'video' | 'text' | 'code';

/**
 * Statuts de progression d'upload
 */
export type UploadStatus = 'pending' | 'uploading' | 'complete' | 'error';

/**
 * Types MIME pour les images
 */
export type ImageMimeType = 'image/jpeg' | 'image/jpg' | 'image/png' | 'image/gif' | 'image/webp';

/**
 * Types MIME pour les documents
 */
export type DocumentMimeType = 
  | 'application/pdf'
  | 'text/plain'
  | 'application/msword'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'application/vnd.ms-powerpoint'
  | 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  | 'application/zip'
  | 'application/x-zip-compressed';

/**
 * Types MIME pour les fichiers audio
 */
export type AudioMimeType = 'audio/mpeg' | 'audio/mp3' | 'audio/wav' | 'audio/ogg' | 'audio/webm' | 'audio/mp4' | 'audio/m4a' | 'audio/x-m4a' | 'audio/aac';

/**
 * Types MIME pour les vidéos
 */
export type VideoMimeType = 'video/mp4' | 'video/webm' | 'video/ogg' | 'video/quicktime';

/**
 * Types MIME pour les fichiers texte
 */
export type TextMimeType = 'text/plain';

/**
 * Types MIME pour les fichiers de code
 * Liste exhaustive pour supporter tous les langages et variations de MIME types
 */
export type CodeMimeType =
  | 'text/markdown'
  | 'text/x-markdown'
  // Shell scripts
  | 'application/x-sh'
  | 'application/x-shellscript'
  | 'text/x-sh'
  | 'text/x-shellscript'
  | 'text/x-script.sh'
  // JavaScript/TypeScript
  | 'text/javascript'
  | 'application/javascript'
  | 'application/x-javascript'
  | 'text/typescript'
  | 'application/typescript'
  | 'text/x-typescript'
  // Python
  | 'text/x-python'
  | 'text/x-python-script'
  | 'application/x-python-code'
  | 'text/x-script.python'
  // HTML/CSS/XML
  | 'text/html'
  | 'application/xhtml+xml'
  | 'text/css'
  | 'text/xml'
  | 'application/xml'
  // C/C++
  | 'text/x-c'
  | 'text/x-c++'
  | 'text/x-csrc'
  | 'text/x-chdr'
  // Java
  | 'text/x-java'
  | 'text/x-java-source'
  // PHP
  | 'text/x-php'
  | 'application/x-php'
  // Ruby
  | 'text/x-ruby'
  | 'application/x-ruby'
  // Go
  | 'text/x-go'
  // Rust
  | 'text/x-rust'
  // SQL
  | 'text/x-sql'
  | 'application/sql'
  // JSON/YAML
  | 'application/json'
  | 'text/x-json'
  | 'application/x-yaml'
  | 'text/yaml'
  | 'text/x-yaml';

/**
 * Union de tous les types MIME acceptés
 */
export type AcceptedMimeType = ImageMimeType | DocumentMimeType | AudioMimeType | VideoMimeType | TextMimeType | CodeMimeType;

/**
 * Scan status for attachments
 */
export type ScanStatus = 'pending' | 'clean' | 'infected' | 'error';

/**
 * Moderation status for attachments
 */
export type ModerationStatus = 'pending' | 'approved' | 'flagged' | 'rejected';

/**
 * D4 — a single responsive downscaled WebP variant of an image attachment,
 * used to build a client `srcset`. @see schema.prisma MessageAttachment.imageVariants
 */
export interface ImageVariant {
  readonly width: number;
  readonly height: number;
  readonly url: string;
  readonly size: number;
  readonly format: 'webp';
}

/**
 * The requesting participant's own playback progress for a media attachment,
 * derived from their `AttachmentStatusEntry`. Surfaced on the attachment
 * payload (per-request) so a client can seed the in-bubble waveform tint
 * (audio) / progress bar (video) on load. @see schema.prisma AttachmentStatusEntry
 */
export interface CurrentUserAttachmentConsumption {
  /** Last audio playback position in ms (null = never played / unknown). */
  readonly lastPlayPositionMs: number | null;
  /** Whether the current user listened to the audio to completion. */
  readonly listenedComplete: boolean;
  /** Last video playback position in ms (null = never watched / unknown). */
  readonly lastWatchPositionMs: number | null;
  /** Whether the current user watched the video to completion. */
  readonly watchedComplete: boolean;
}

/**
 * Attachement de message
 * Aligned with schema.prisma MessageAttachment model
 */
export interface Attachment {
  readonly id: string;
  readonly messageId: string;
  readonly fileName: string;
  readonly originalName: string;
  readonly mimeType: string;
  readonly fileSize: number;

  // ===== PATHS & URLS =====
  readonly filePath?: string;       // Relative path on server
  readonly fileUrl: string;         // Public URL
  readonly thumbnailPath?: string;  // Thumbnail relative path
  readonly thumbnailUrl?: string;   // Thumbnail public URL

  // ===== METADATA =====
  readonly title?: string;          // Human-readable title
  readonly alt?: string;            // Accessibility alt text
  readonly caption?: string;        // Display caption

  // ===== IMAGE METADATA =====
  readonly width?: number;
  readonly height?: number;
  /**
   * D4 — responsive downscaled WebP variants for `srcset` (non-encrypted images
   * only). The full-resolution `fileUrl` always remains the largest candidate.
   * Lets a client fetch a ~640px WebP (tens of KB) instead of a multi-MB
   * original for inline previews.
   */
  readonly imageVariants?: readonly ImageVariant[];

  // ===== AUDIO/VIDEO METADATA =====
  readonly duration?: number;       // Duration in milliseconds
  readonly bitrate?: number;
  readonly sampleRate?: number;
  readonly codec?: string;
  readonly channels?: number;
  readonly fps?: number;
  readonly videoCodec?: string;

  // ===== DOCUMENT METADATA =====
  readonly pageCount?: number;
  readonly lineCount?: number;

  // ===== UPLOADER =====
  readonly uploadedBy: string;
  readonly isAnonymous: boolean;
  readonly createdAt: string;

  // ===== FORWARDING =====
  readonly forwardedFromAttachmentId?: string;
  readonly isForwarded: boolean;

  // ===== PROVENANCE =====
  /**
   * Le fichier sort de la caméra ou du micro DE L'APPLICATION.
   *
   * Déclaré par le client à l'envoi — lui seul le sait, et seulement à cet
   * instant — puis relu tel quel par les feuilles qui proposent de PUBLIER le
   * média : une capture n'a encore été vue par personne, l'ouvrir à un fil
   * entier se confirme.
   * @see packages/shared/utils/forward-to-publication.ts
   */
  readonly capturedInApp: boolean;

  // ===== VIEW-ONCE & BLUR =====
  readonly isViewOnce: boolean;
  readonly maxViewOnceCount?: number;
  readonly viewOnceCount: number;
  readonly isBlurred: boolean;

  // ===== SECURITY & MODERATION =====
  readonly scanStatus?: ScanStatus;
  readonly scanCompletedAt?: Date;
  readonly moderationStatus?: ModerationStatus;
  readonly moderationReason?: string;

  // ===== DELIVERY STATUS (denormalized) =====
  readonly deliveredToAllAt?: Date;
  readonly viewedByAllAt?: Date;
  readonly downloadedByAllAt?: Date;
  readonly listenedByAllAt?: Date;   // Audio only
  readonly watchedByAllAt?: Date;    // Video only
  readonly viewedCount: number;
  readonly downloadedCount: number;
  readonly consumedCount: number;    // Listened or watched

  // ===== CURRENT-USER CONSUMPTION (per-request, cross-device sync) =====
  /**
   * The requesting participant's OWN media playback progress, surfaced so a
   * client can seed the in-bubble waveform tint (audio) / progress bar (video)
   * the moment a conversation loads — without waiting for the detail sheet.
   * `null` when the current user has never consumed this attachment (or when
   * the payload is a broadcast with no participant context).
   * Mirror of `currentUserReactions`. @see AttachmentStatusEntry in schema.prisma
   */
  readonly currentUserConsumption?: CurrentUserAttachmentConsumption | null;

  // ===== ENCRYPTION =====
  // Note: encryptionMode is only on Conversation, not Attachment
  readonly isEncrypted: boolean;
  readonly encryptionIv?: string;
  readonly encryptionAuthTag?: string;
  readonly encryptionHmac?: string;
  readonly originalFileHash?: string;
  readonly encryptedFileHash?: string;
  readonly originalFileSize?: number;
  readonly serverKeyId?: string;
  readonly thumbnailEncryptionIv?: string;
  readonly thumbnailEncryptionAuthTag?: string;

  // ===== TRANSCRIPTION & TRANSLATION V2 (JSON intégré) =====
  readonly serverCopyUrl?: string;

  /**
   * V2: Transcription JSON intégrée dans MessageAttachment
   * Transcription complète avec métadonnées (segments, speakers, durée, etc.)
   * Structure: AttachmentTranscription (audio/video)
   */
  readonly transcription?: AttachmentTranscription;

  /**
   * V2: Traductions JSON intégrées dans MessageAttachment
   * Map: langue cible → traduction complète
   * Structure: AttachmentTranslations = Record<string, AttachmentTranslation>
   * Chaque traduction contient: type, transcription, url, durationMs, cloned, quality, etc.
   */
  readonly translations?: AttachmentTranslations;

  /**
   * V2: Format Socket.IO converti depuis translations
   * Array de traductions pour compatibilité UI et événements temps réel
   * Structure: SocketIOTranslatedAudio[] (id composite, targetLanguage, audioUrl, etc.)
   * Généré automatiquement via toSocketIOAudios() depuis translations (pour événements Socket.IO uniquement)
   */
  readonly translatedAudios?: readonly SocketIOTranslatedAudio[];

  /**
   * Metadata JSON contenant des données additionnelles
   */
  readonly metadata?: {
    audioEffectsTimeline?: import('./audio-effects-timeline.js').AudioEffectsTimeline;
    [key: string]: unknown;
  };
}

/**
 * Progression d'upload
 */
export interface UploadProgress {
  readonly attachmentId: string;
  readonly progress: number; // 0-100
  readonly status: UploadStatus;
  readonly error?: string;
}

/**
 * Métadonnées d'un attachement (mutable pour construction)
 */
export interface AttachmentMetadata {
  width?: number;
  height?: number;
  duration?: number;
  bitrate?: number;
  sampleRate?: number;
  codec?: string;
  channels?: number;
  fps?: number;
  videoCodec?: string;
  pageCount?: number;
  lineCount?: number;
  thumbnailGenerated?: boolean;
  /**
   * Timeline des effets audio appliqués pendant l'enregistrement
   * Uniquement pour les fichiers audio enregistrés avec des effets
   */
  audioEffectsTimeline?: import('./audio-effects-timeline.js').AudioEffectsTimeline;
}

/**
 * Réponse d'upload d'un attachement
 */
export interface UploadedAttachmentResponse {
  readonly id: string;
  /**
   * DETTE DE TYPE, mesurée au lot W7bis : le chemin résumable (TUS) rend le
   * MÊME corps pour un `MessageAttachment` et pour un `PostMedia`, et un
   * `PostMedia` n'appartient à AUCUN message — ce champ est donc absent sur
   * tout média de publication, là où le type le déclare requis. Inoffensif
   * aujourd'hui (aucun consommateur d'un média de publication ne le lit :
   * `MediaAccessibilityFields`, `qualifiesAsReel`, `optimisticMedia`,
   * `mediaIds` et `StoryComposer` ne lisent qu'id/mimeType/fileUrl/duration),
   * mais le type ne protège plus rien sur ce chemin. Le retrait de la dette
   * est un SPLIT : `UploadedMediaResponse` (le noyau réellement rendu par les
   * deux chemins) dont cette interface hériterait en y ajoutant les champs de
   * message. Non fait ici : les visionneuses de message
   * (`AudioAttachment`, `DocumentAttachment`, `AttachmentGallery`,
   * `MessageAttachments`) lisent ce champ et sont hors du périmètre du lot.
   */
  readonly messageId: string;
  readonly fileName: string;
  readonly originalName: string;
  readonly mimeType: string;
  readonly fileSize: number;
  readonly fileUrl: string;
  readonly thumbnailUrl?: string;
  readonly width?: number;
  readonly height?: number;
  readonly duration?: number;
  readonly bitrate?: number;
  readonly sampleRate?: number;
  readonly codec?: string;
  readonly channels?: number;
  readonly uploadedBy: string;
  readonly isAnonymous: boolean;
  readonly createdAt: string;
  /**
   * #3909 — la progression PERSONNELLE de lecture, quand la charge en vient.
   *
   * OPTIONNEL parce que ce type fait double emploi (cf. la dette déclarée sur
   * `messageId` plus haut) : il décrit la réponse d'un UPLOAD, qui n'en a
   * jamais, ET la forme que les lecteurs audio/vidéo reçoivent depuis la LISTE
   * DE MESSAGES, qui la sert. Déclarer le champ requis mentirait sur le premier
   * chemin ; ne pas le déclarer du tout rendait le second illisible sans un
   * cast. L'optionnel dit la vérité des deux.
   */
  readonly currentUserConsumption?: CurrentUserAttachmentConsumption | null;
  /**
   * Metadata JSON contenant des données additionnelles (audioEffectsTimeline, etc.)
   */
  readonly metadata?: {
    audioEffectsTimeline?: import('./audio-effects-timeline.js').AudioEffectsTimeline;
    [key: string]: unknown;
  };
  /**
   * Timeline des effets audio appliqués pendant l'enregistrement
   * Uniquement pour les fichiers audio enregistrés avec des effets
   * DEPRECATED: Utiliser metadata.audioEffectsTimeline à la place
   */
  readonly audioEffectsTimeline?: import('./audio-effects-timeline.js').AudioEffectsTimeline;
}

/**
 * Erreur d'upload pour un fichier spécifique
 */
export interface UploadError {
  readonly filename: string;
  readonly error: string;
}

/**
 * Réponse d'upload de plusieurs attachements
 */
export interface UploadMultipleResponse {
  readonly success: boolean;
  readonly attachments: readonly UploadedAttachmentResponse[];
  readonly errors?: readonly UploadError[];
}

/**
 * Limites de taille d'upload par type de fichier (en octets)
 */
export const UPLOAD_LIMITS = {
  IMAGE: 4294967296, // 4GB
  DOCUMENT: 4294967296, // 4GB
  AUDIO: 4294967296, // 4GB
  VIDEO: 4294967296, // 4GB
  TEXT: 2147483648, // 2GB
  CODE: 2147483648, // 2GB
} as const;

/**
 * Plafond du nombre de pièces jointes portées par UN message — source de
 * vérité unique pour le gateway (validator, schéma socket, schéma REST) et
 * pour les clients.
 *
 * Un envoi = un message (norme SOTA 2026-08-16, cf.
 * `docs/superpowers/specs/2026-08-16-sota-message-attachment-normalization-design.md`) :
 * ce nombre borne donc une sélection de composer entière, pas un lot d'upload.
 *
 * Il a remplacé cinq valeurs contradictoires qui coexistaient (10 côté
 * `MessageValidator`, 30 ici, 50 côté composer web, 100 côté schéma socket,
 * 199 côté composer iOS). Le composer iOS étant déjà passé à 199 le
 * 2026-08-14, le cap serveur de 10 rejetait en pratique tout envoi iOS de
 * plus de dix pièces.
 *
 * Swift ne peut pas importer cette constante : `ConversationComposerState.maxMediaSelection`
 * la duplique et le test `attachment.test.ts` fige la valeur des deux côtés.
 */
export const MAX_ATTACHMENTS_PER_MESSAGE = 199;

/**
 * Contextes d'upload TUS qui produisent un `PostMedia` (par opposition à un
 * `MessageAttachment`). Vocabulaire PARTAGÉ entre le handler d'upload du
 * gateway (`onUploadCreate`/`onUploadFinish`, rejet avant le premier octet
 * puis choix de la table) et le transport web des composers de publication
 * (`resolveAttachmentTransport`) — les deux délèguent ici plutôt que de
 * recopier la liste, pour qu'elles ne puissent plus diverger.
 */
export type PostMediaUploadContext = 'post' | 'story' | 'status' | 'comment';

const POST_MEDIA_UPLOAD_CONTEXTS: readonly PostMediaUploadContext[] = ['post', 'story', 'status', 'comment'];

export function isPostMediaUploadContext(context: unknown): context is PostMediaUploadContext {
  return typeof context === 'string'
    && (POST_MEDIA_UPLOAD_CONTEXTS as readonly string[]).includes(context);
}

/**
 * Plafond du nombre de médias d'UNE publication (post/reel/story/status) —
 * source de vérité unique pour `CreatePostSchema`/`UpdatePostSchema`
 * (gateway) et pour le transport web des composers de publication.
 * Historiquement recopié en dur : `.max(10)` × 2 côté gateway (création,
 * édition), `MEDIA_LIMIT = 10` × 2 côté web (`ComposerDocumentSurface`,
 * `PostComposer`) — cinq copies qu'aucun site ne tenait ensemble.
 */
export const MAX_POST_MEDIA = 10;

export const MAX_CONCURRENT_UPLOADS = 3;

export const TUS_CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB

export const SMALL_FILE_THRESHOLD = 50 * 1024 * 1024; // 50 MB - below this, use direct REST upload

/**
 * Type des limites d'upload
 */
export type UploadLimits = typeof UPLOAD_LIMITS;

/**
 * Types MIME acceptés par catégorie
 */
export const ACCEPTED_MIME_TYPES = {
  IMAGE: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'] as const,
  DOCUMENT: [
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'application/x-zip-compressed',
  ] as const,
  AUDIO: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac'] as const,
  VIDEO: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'] as const,
  TEXT: ['text/plain'] as const,
  CODE: [
    'text/markdown',
    'text/x-markdown',
    // Shell scripts
    'application/x-sh',
    'application/x-shellscript',
    'text/x-sh',
    'text/x-shellscript',
    'text/x-script.sh',
    // JavaScript/TypeScript
    'text/javascript',
    'application/javascript',
    'application/x-javascript',
    'text/typescript',
    'application/typescript',
    'text/x-typescript',
    // Python
    'text/x-python',
    'text/x-python-script',
    'application/x-python-code',
    'text/x-script.python',
    // HTML/CSS/XML
    'text/html',
    'application/xhtml+xml',
    'text/css',
    'text/xml',
    'application/xml',
    // C/C++
    'text/x-c',
    'text/x-c++',
    'text/x-csrc',
    'text/x-chdr',
    // Java
    'text/x-java',
    'text/x-java-source',
    // PHP
    'text/x-php',
    'application/x-php',
    // Ruby
    'text/x-ruby',
    'application/x-ruby',
    // Go
    'text/x-go',
    // Rust
    'text/x-rust',
    // SQL
    'text/x-sql',
    'application/sql',
    // JSON/YAML
    'application/json',
    'text/x-json',
    'application/x-yaml',
    'text/yaml',
    'text/x-yaml',
  ] as const,
} as const;

/**
 * Type des types MIME acceptés
 */
export type AcceptedMimeTypes = typeof ACCEPTED_MIME_TYPES;

/**
 * Retire les paramètres d'un type MIME avant comparaison — `audio/webm;codecs=opus`
 * → `audio/webm`, `text/plain; charset=utf-8` → `text/plain`. Site UNIQUE
 * partagé par les six type-guards : le nettoyage doit être identique sur toutes
 * les familles média, sans quoi une même entrée paramétrée est classée
 * différemment selon sa seule famille (défaut It. 267 — seuls audio/vidéo
 * nettoyaient, image/text/document/code non).
 *
 * Repli sur l'original quand `split(';')[0]` est vide (entrée commençant par
 * `;`) : la chaîne intacte ne matchera aucune liste, jamais un faux positif.
 */
function stripMimeParameters(mimeType: string): string {
  return (mimeType.split(';')[0] || mimeType).trim();
}

/**
 * Type guard pour vérifier si un MIME type est une image
 */
export function isImageMimeType(mimeType: string): mimeType is ImageMimeType {
  return (ACCEPTED_MIME_TYPES.IMAGE as unknown as string[]).includes(stripMimeParameters(mimeType));
}

/**
 * Type guard pour vérifier si un MIME type est audio
 */
export function isAudioMimeType(mimeType: string): mimeType is AudioMimeType {
  return (ACCEPTED_MIME_TYPES.AUDIO as unknown as string[]).includes(stripMimeParameters(mimeType));
}

/**
 * Type guard pour vérifier si un MIME type est vidéo
 */
export function isVideoMimeType(mimeType: string): mimeType is VideoMimeType {
  return (ACCEPTED_MIME_TYPES.VIDEO as unknown as string[]).includes(stripMimeParameters(mimeType));
}

/**
 * Type guard pour vérifier si un MIME type est texte
 */
export function isTextMimeType(mimeType: string): mimeType is TextMimeType {
  return (ACCEPTED_MIME_TYPES.TEXT as unknown as string[]).includes(stripMimeParameters(mimeType));
}

/**
 * Type guard pour vérifier si un MIME type est document
 */
export function isDocumentMimeType(mimeType: string): mimeType is DocumentMimeType {
  return (ACCEPTED_MIME_TYPES.DOCUMENT as unknown as string[]).includes(stripMimeParameters(mimeType));
}

/**
 * Type guard pour vérifier si un MIME type est code
 */
export function isCodeMimeType(mimeType: string): mimeType is CodeMimeType {
  return (ACCEPTED_MIME_TYPES.CODE as unknown as string[]).includes(stripMimeParameters(mimeType));
}

/**
 * Type guard pour vérifier si un MIME type est accepté
 */
export function isAcceptedMimeType(mimeType: string): mimeType is AcceptedMimeType {
  return isImageMimeType(mimeType) || 
         isAudioMimeType(mimeType) || 
         isVideoMimeType(mimeType) || 
         isTextMimeType(mimeType) || 
         isDocumentMimeType(mimeType) ||
         isCodeMimeType(mimeType);
}

/**
 * Extensions de fichiers considérées comme du code
 * Liste complète pour supporter tous les langages courants
 */
const CODE_EXTENSIONS = [
  // Scripts shell
  '.sh', '.bash', '.zsh', '.fish', '.ksh',
  // Web
  '.html', '.htm', '.css', '.scss', '.sass', '.less',
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  // Langages compilés
  '.c', '.h', '.cpp', '.cc', '.cxx', '.hpp', '.hxx',
  '.java', '.class', '.kt', '.kts',
  '.cs', '.vb',
  '.go', '.rs', '.swift',
  // Langages dynamiques
  '.py', '.pyw', '.pyc', '.pyo',
  '.rb', '.erb',
  '.php', '.phtml',
  '.pl', '.pm',
  '.lua',
  // Fonctionnel
  '.hs', '.lhs',
  '.ml', '.mli',
  '.fs', '.fsi', '.fsx',
  '.clj', '.cljs', '.cljc',
  '.scala', '.sc',
  // Query languages
  '.sql', '.mysql', '.pgsql',
  '.graphql', '.gql',
  // Markup & Data
  '.xml', '.xsl', '.xslt',
  '.json', '.jsonc', '.json5',
  '.yaml', '.yml',
  '.toml',
  '.ini', '.cfg', '.conf',
  // Documentation
  '.md', '.markdown', '.mdown', '.mkd',
  '.rst',
  '.tex',
  // Autres
  '.r', '.R',
  '.m', '.mm',
  '.dart',
  '.vim',
  '.el', '.lisp',
  '.asm', '.s',
  '.dockerfile', '.docker',
  '.makefile', '.mk',
  '.gradle',
  '.cmake',
] as const;

/**
 * Extensions de fichiers considérées comme du texte
 */
const TEXT_EXTENSIONS = [
  '.txt', '.text',
  '.log',
  '.csv', '.tsv',
  '.rtf',
] as const;

/**
 * Détermine le type d'attachement basé sur le MIME type et optionnellement le nom de fichier
 * @param mimeType - Type MIME du fichier
 * @param filename - Nom du fichier (optionnel) pour détecter le type par extension
 * @returns Type d'attachement
 */
export function getAttachmentType(mimeType: string, filename?: string): AttachmentType {
  // 1. D'abord vérifier le MIME type (plus fiable)
  if (isImageMimeType(mimeType)) {
    return 'image';
  }
  if (isAudioMimeType(mimeType)) {
    return 'audio';
  }
  if (isVideoMimeType(mimeType)) {
    return 'video';
  }
  if (isTextMimeType(mimeType)) {
    return 'text';
  }
  if (isCodeMimeType(mimeType)) {
    return 'code';
  }

  // 2. Si un nom de fichier est fourni, vérifier l'extension
  if (filename) {
    const lowerFilename = filename.toLowerCase();

    // Vérifier les extensions de code
    for (const ext of CODE_EXTENSIONS) {
      if (lowerFilename.endsWith(ext)) {
        return 'code';
      }
    }

    // Vérifier les extensions de texte
    for (const ext of TEXT_EXTENSIONS) {
      if (lowerFilename.endsWith(ext)) {
        return 'text';
      }
    }

    // Cas spéciaux sans extension ou avec extensions particulières
    const filenameBase = lowerFilename.split('/').pop() || '';
    const specialCodeFiles = [
      'dockerfile', 'makefile', 'rakefile', 'gemfile', 'vagrantfile',
      '.gitignore', '.dockerignore', '.env', '.env.local', '.env.example',
      '.eslintrc', '.prettierrc', '.babelrc', 'tsconfig.json', 'package.json',
      '.editorconfig', '.npmrc', '.yarnrc',
    ];

    if (specialCodeFiles.some(special => filenameBase === special || filenameBase.endsWith(special))) {
      return 'code';
    }
  }

  // 3. Par défaut, traiter comme document
  return 'document';
}

/**
 * Obtient la limite de taille pour un type d'attachement
 */
export function getSizeLimit(type: AttachmentType): number {
  switch (type) {
    case 'image':
      return UPLOAD_LIMITS.IMAGE;
    case 'audio':
      return UPLOAD_LIMITS.AUDIO;
    case 'video':
      return UPLOAD_LIMITS.VIDEO;
    case 'text':
      return UPLOAD_LIMITS.TEXT;
    case 'code':
      return UPLOAD_LIMITS.CODE;
    case 'document':
      return UPLOAD_LIMITS.DOCUMENT;
    default: {
      // Exhaustive check - assure que tous les cas sont couverts
      const _exhaustiveCheck: never = type;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      void _exhaustiveCheck;
      return UPLOAD_LIMITS.DOCUMENT;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXTENDED ATTACHMENT TYPES WITH RELATIONS
// ═══════════════════════════════════════════════════════════════════════════

import type { VoiceQualityAnalysis } from './voice-api.js';

/**
 * @deprecated V1 legacy - Use AttachmentTranscription from './attachment-audio.js'
 * Minimal transcription data for API responses
 */
export interface TranscriptionData {
  readonly id: string;
  readonly transcribedText: string;
  readonly language: string;
  readonly confidence: number;
  readonly source: string;
  readonly voiceQualityAnalysis?: VoiceQualityAnalysis | null;
}

/**
 * @deprecated V2: Utiliser SocketIOTranslatedAudio depuis './attachment-audio.js'
 * Type legacy conservé pour compatibilité - sera supprimé dans version future
 */
export type AttachmentTranslationData = SocketIOTranslatedAudio;

/**
 * V2: Attachment with transcription JSON intégré
 * Utilise la nouvelle structure JSON dans MessageAttachment
 */
export interface AttachmentWithTranscription {
  readonly id: string;
  readonly messageId: string;
  readonly fileName: string;
  readonly fileUrl: string;
  readonly mimeType: string;
  readonly transcription: AttachmentTranscriptionV2 | null;
}

/**
 * V2: Attachment with complete metadata including transcription and translations
 * Utilise les nouveaux champs JSON intégrés dans MessageAttachment
 */
export interface AttachmentWithMetadata {
  readonly id: string;
  readonly messageId: string;
  readonly fileName: string;
  readonly fileUrl: string;
  readonly mimeType: string;
  readonly transcription: AttachmentTranscriptionV2 | null;
  readonly translatedAudios: SocketIOTranslatedAudio[];
  readonly translations: AttachmentTranslations;
}

/**
 * Unités de taille de fichier
 */
const FILE_SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * Type pour les unités de taille
 */
export type FileSizeUnit = typeof FILE_SIZE_UNITS[number];

/**
 * Options de formatage d'une taille de fichier
 */
export type FormatFileSizeOptions = {
  /** Nombre de décimales significatives (défaut : 2). Les zéros de fin sont retirés. */
  readonly decimals?: number;
};

/**
 * Formate une taille de fichier pour l'affichage.
 *
 * Source unique de vérité pour la conversion octets → chaîne lisible (B/KB/MB/GB/TB)
 * dans tout le monorepo. `decimals` permet d'ajuster la précision sans réimplémenter.
 */
export function formatFileSize(bytes: number, options?: FormatFileSizeOptions): string {
  // Non-finite (NaN/Infinity) et non-positif (0 ou négatif) ne sont pas des
  // tailles exprimables : ramenés à zéro, comme le formatteur jumeau
  // `formatClock` (duration-format.ts) le fait pour ses entrées invalides.
  // Sans ce garde, `Math.log(bytes)` vaut NaN et l'index d'unité sortait de la
  // plage → `FILE_SIZE_UNITS[-1]`/`[NaN]` = `undefined` (« NaN undefined »).
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const decimals = options?.decimals ?? 2;
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  // Borne BASSE autant que haute : pour `0 < bytes < 1`, `i` est négatif — sans
  // le `Math.max(_, 0)`, l'index restait négatif et `0.5` rendait « 512 undefined ».
  const sizeIndex = Math.min(Math.max(i, 0), FILE_SIZE_UNITS.length - 1);
  return `${parseFloat((bytes / Math.pow(k, sizeIndex)).toFixed(decimals))} ${FILE_SIZE_UNITS[sizeIndex]}`;
}

