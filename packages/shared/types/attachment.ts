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
  readonly translationsJson?: AttachmentTranslations;

  /**
   * V2: Format Socket.IO converti depuis translationsJson
   * Array de traductions pour compatibilité UI et événements temps réel
   * Structure: SocketIOTranslatedAudio[] (id composite, targetLanguage, audioUrl, etc.)
   * Généré automatiquement via toSocketIOAudios() depuis translationsJson
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
   * Metadata JSON contenant des données additionnelles (audioEffectsTimeline, etc.)
   */
  readonly metadata?: {
    audioEffectsTimeline?: import('./audio-effects-timeline.js').AudioEffectsTimeline;
    [key: string]: any;
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
  IMAGE: 2147483648, // 2GB
  DOCUMENT: 2147483648, // 2GB
  AUDIO: 2147483648, // 2GB
  VIDEO: 2147483648, // 2GB
  TEXT: 2147483648, // 2GB
  CODE: 2147483648, // 2GB
} as const;

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
 * Type guard pour vérifier si un MIME type est une image
 */
export function isImageMimeType(mimeType: string): mimeType is ImageMimeType {
  return (ACCEPTED_MIME_TYPES.IMAGE as unknown as string[]).includes(mimeType);
}

/**
 * Type guard pour vérifier si un MIME type est audio
 */
export function isAudioMimeType(mimeType: string): mimeType is AudioMimeType {
  // Nettoyer le MIME type en enlevant les paramètres (ex: audio/webm;codecs=opus -> audio/webm)
  const cleanMimeType = (mimeType.split(';')[0] || mimeType).trim();
  return (ACCEPTED_MIME_TYPES.AUDIO as unknown as string[]).includes(cleanMimeType);
}

/**
 * Type guard pour vérifier si un MIME type est vidéo
 */
export function isVideoMimeType(mimeType: string): mimeType is VideoMimeType {
  // Nettoyer le MIME type en enlevant les paramètres (ex: video/webm;codecs=vp8 -> video/webm)
  const cleanMimeType = (mimeType.split(';')[0] || mimeType).trim();
  return (ACCEPTED_MIME_TYPES.VIDEO as unknown as string[]).includes(cleanMimeType);
}

/**
 * Type guard pour vérifier si un MIME type est texte
 */
export function isTextMimeType(mimeType: string): mimeType is TextMimeType {
  return (ACCEPTED_MIME_TYPES.TEXT as unknown as string[]).includes(mimeType);
}

/**
 * Type guard pour vérifier si un MIME type est document
 */
export function isDocumentMimeType(mimeType: string): mimeType is DocumentMimeType {
  return (ACCEPTED_MIME_TYPES.DOCUMENT as unknown as string[]).includes(mimeType);
}

/**
 * Type guard pour vérifier si un MIME type est code
 */
export function isCodeMimeType(mimeType: string): mimeType is CodeMimeType {
  return (ACCEPTED_MIME_TYPES.CODE as unknown as string[]).includes(mimeType);
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
  readonly translationsJson: AttachmentTranslations;
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
 * Formate une taille de fichier pour l'affichage
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const sizeIndex = Math.min(i, FILE_SIZE_UNITS.length - 1);
  return `${parseFloat((bytes / Math.pow(k, sizeIndex)).toFixed(2))} ${FILE_SIZE_UNITS[sizeIndex]}`;
}

