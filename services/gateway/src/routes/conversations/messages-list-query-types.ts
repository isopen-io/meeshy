/**
 * Types structurels de `messages-list-query.ts` (issue #3679 — réduction de
 * la dette `any` du gateway) — le SOUS-ENSEMBLE de chaque ligne Prisma que ce
 * module lit réellement, jamais la forme Prisma exacte. `messages-list-query.ts`
 * construit son `select` dynamiquement (`buildMessageListSelect`, selon
 * `includeTranslations`/`includeReplies`), donc les lignes qu'il reçoit n'ont
 * pas de type Prisma unique à dériver — même philosophie que
 * `MessageProtectionContext`/`MessageProtectionFields`
 * (`routes/admin/media-protection.ts`) : nommer le plancher qu'une fonction
 * exige, laisser le reste à l'inférence du site d'appel.
 *
 * Extraits dans leur propre fichier (plutôt que gardés en tête de
 * `messages-list-query.ts`) pour rester dans le budget de taille du dépôt
 * (1000–1200 lignes) — un type par fichier, une extension par surface.
 */
import type { QuotedMessageRow } from '../../services/messaging/servedQuotedMessage';
import type { MessageTranslationJSON } from '../../utils/translation-transformer';

/** Segment de transcription — Whisper (`services/AudioTranslateService.ts`). */
export type TranscriptionSegment = {
  text?: string;
  startMs?: number;
  endMs?: number;
  speakerId?: string;
  confidence?: number;
  voiceSimilarityScore?: number | boolean | null;
  [key: string]: unknown;
};

export type TranscriptionSpeaker = {
  sid?: string;
  voiceCharacteristics?: {
    pitch?: { mean_hz?: number };
    classification?: { estimated_gender?: string };
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type TranscriptionBlob = {
  text?: string;
  transcribedText?: string;
  language?: string;
  confidence?: number;
  source?: string;
  model?: string;
  durationMs?: number;
  audioDurationMs?: number;
  speakerCount?: number;
  segments?: TranscriptionSegment[];
  speakerAnalysis?: { speakers?: TranscriptionSpeaker[] };
  [key: string]: unknown;
};

/** Une traduction audio du Prisme (`MessageAttachment.translations[langue]`). */
export type AttachmentAudioTranslationEntry = {
  url?: string | null;
  cloned?: boolean;
  segments?: TranscriptionSegment[];
  [key: string]: unknown;
};

/**
 * La progression PERSONNELLE de lecture d'un participant sur une pièce jointe.
 *
 * Sert la reprise cross-device : rouvrir un vocal ou une vidéo repart là où on
 * s'était arrêté, sur n'importe quel appareil (#3909).
 */
export type CurrentUserConsumption = {
  lastPlayPositionMs: number | null;
  listenedComplete: boolean;
  lastWatchPositionMs: number | null;
  watchedComplete: boolean;
};

/**
 * Pièce jointe brute, telle que chargée par `buildMessageListSelect`
 * (`attachmentSocketSelect` à la racine depuis #7070 — il remplace l'union
 * locale `attachmentMediaSelect` + `attachmentProtectionSelect`, et c'est lui
 * qui rend `isForwarded` / `forwardedFromAttachmentId` NOMMÉS ci-dessous
 * réellement chargés ; `attachmentFullSelect` sous `replyTo`). Les champs
 * nommés sont ceux que ce
 * module lit ou remet à un helper typé (`redactForwardedAttachmentUrlsIn`
 * exige `fileUrl`/`thumbnailUrl`/`isForwarded`/`forwardedFromAttachmentId`
 * NOMMÉS, pas seulement couverts par l'index) ; le reste voyage par l'index
 * `unknown`, sans avoir besoin d'un nom ici.
 */
export type RawMessageAttachment = {
  id?: string | null;
  fileUrl?: string | null;
  thumbnailUrl?: string | null;
  isForwarded?: boolean | null;
  forwardedFromAttachmentId?: string | null;
  mimeType?: string | null;
  reactions?: ReadonlyArray<{ readonly emoji: string; readonly participantId: string }>;
  transcription?: TranscriptionBlob | null;
  translations?: Record<string, AttachmentAudioTranslationEntry> | null;
  [key: string]: unknown;
};

/** La forme SERVIE par `cleanAttachmentsForApi` — `reactions` en moins, trois champs dérivés en plus. */
export type CleanedAttachment = {
  id?: string | null;
  fileUrl?: string | null;
  thumbnailUrl?: string | null;
  isForwarded?: boolean | null;
  forwardedFromAttachmentId?: string | null;
  reactions?: ReadonlyArray<{ readonly emoji: string; readonly participantId: string }>;
  reactionSummary?: Record<string, number>;
  currentUserReactions?: string[];
  currentUserConsumption?: CurrentUserConsumption | null;
  transcription?: TranscriptionBlob | null;
  translations?: Record<string, AttachmentAudioTranslationEntry> | null;
  [key: string]: unknown;
};

/** Le sous-ensemble d'un `sender` (participant) que ce module lit. */
export type RawMessageSender = {
  id?: string;
  userId?: string | null;
  displayName?: string | null;
  avatar?: string | null;
  type?: string | null;
  role?: string | null;
  language?: string | null;
  username?: string | null;
  isOnline?: boolean | null;
  lastActiveAt?: Date | null;
  anonymousSession?: {
    profile?: {
      firstName?: string | null;
      lastName?: string | null;
    } | null;
  } | null;
  user?: {
    id?: string;
    username?: string | null;
    displayName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    avatar?: string | null;
    isOnline?: boolean | null;
    lastActiveAt?: Date | null;
  } | null;
};

/** Les six colonnes de protection, partagées par `Message` et sa citation. */
export type MessageProtectionRow = {
  isViewOnce?: boolean | null;
  maxViewOnceCount?: number | null;
  viewOnceCount?: number | null;
  isBlurred?: boolean | null;
  effectFlags?: number | null;
  expiresAt?: Date | null;
  /** #7451 — la DURÉE d'un éphémère. Servie partout ; l'échéance, elle, est par lecteur. */
  ephemeralDuration?: number | null;
};

/** Le message CITÉ (`message.replyTo`) — `QuotedMessageRow` plus ce que ce module lit en plus. */
export type RawReplyToRow = QuotedMessageRow & MessageProtectionRow & {
  senderId?: string | null;
  originalLanguage?: string | null;
  validatedMentions?: unknown;
  metadata?: unknown;
  sender?: RawMessageSender | null;
  attachments?: readonly RawMessageAttachment[] | null;
  _count?: { reactions?: number } | null;
};

/** La ligne `Message` brute, telle que `buildMessageListSelect` la sert. */
export type RawMessageRow = MessageProtectionRow & {
  id: string;
  clientMessageId?: string | null;
  conversationId: string;
  senderId: string;
  sender?: RawMessageSender | null;
  content?: string | null;
  originalLanguage?: string | null;
  messageType?: string | null;
  messageSource?: string | null;
  metadata?: unknown;
  isEdited?: boolean | null;
  editedAt?: Date | null;
  deletedAt?: Date | null;
  replyToId?: string | null;
  storyReplyToId?: string | null;
  forwardedFromId?: string | null;
  forwardedFromConversationId?: string | null;
  pinnedAt?: Date | null;
  pinnedBy?: string | null;
  reactionSummary?: unknown;
  reactionCount?: number | null;
  isEncrypted?: boolean | null;
  encryptionMode?: string | null;
  createdAt: Date;
  updatedAt?: Date | null;
  validatedMentions?: unknown;
  attachments?: readonly RawMessageAttachment[] | null;
  translations?: Record<string, MessageTranslationJSON> | null;
  replyTo?: RawReplyToRow | null;
  _count?: unknown;
};

/**
 * La ligne CONSTRUITE par `mapMessageRowForList` — le contrat `GatewayMessage`
 * tel que cette route le sert, plus les champs que `enrichForwardedMessagesForList`
 * / `enrichPostReplyMessagesForList` (`messages-list-query.ts`) et le hoist
 * lieu/sticker (`messages-list.ts`) y ajoutent après coup. `mapMessageRowForList`
 * reste annoté `: any` en sortie (voir son doc-comment) : ce type gouverne sa
 * construction INTERNE, pas le contrat vu par l'appelant.
 */
export type MappedMessageRow = MessageProtectionRow & {
  id: string;
  clientMessageId: string | null;
  conversationId: string;
  senderId: string | null | undefined;
  senderParticipantId: string;
  content?: string | null;
  originalLanguage: string;
  messageType?: string | null;
  messageSource?: string | null;
  metadata?: unknown;
  isEdited?: boolean | null;
  editedAt?: Date | null;
  deletedAt?: Date | null;
  replyToId?: string | null;
  storyReplyToId?: string | null;
  forwardedFromId?: string | null;
  forwardedFromConversationId?: string | null;
  pinnedAt?: Date | null;
  pinnedBy?: string | null;
  deliveredToAllAt: Date | null;
  readByAllAt: Date | null;
  deliveredCount: number;
  readCount: number;
  recipientCount: number;
  reactionSummary?: unknown;
  reactionCount?: number | null;
  isEncrypted?: boolean | null;
  encryptionMode?: string | null;
  createdAt: Date;
  updatedAt?: Date | null;
  validatedMentions?: unknown;
  sender: { readonly userId?: string | null } | null;
  attachments?: readonly CleanedAttachment[] | null;
  _count?: unknown;
  translations?: unknown;
  replyTo?: unknown;
  location?: unknown;
  sticker?: unknown;
  forwardedFrom?: Record<string, unknown> | null;
  forwardedFromConversation?: Record<string, unknown> | null;
  postReplyTo?: unknown;
};
