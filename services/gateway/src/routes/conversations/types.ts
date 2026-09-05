/**
 * Types TypeScript pour le module conversations
 */

export interface EditMessageBody {
  content: string;
  originalLanguage?: string;
}

export interface ConversationParams {
  id: string;
}

export interface CreateConversationBody {
  type: 'direct' | 'group' | 'public' | 'global' | 'broadcast';
  title?: string;
  description?: string;
  participantIds?: string[];
  communityId?: string;
  identifier?: string;
}

export interface SendMessageBody {
  content?: string;
  /**
   * Phase 4 §6.2 — mandatory client-generated idempotency key, format
   * `cid_<uuid v4 lowercase>`. The gateway uses
   * `(conversationId, clientMessageId)` as a unique partial index in MongoDB
   * so concurrent retries (offline queue + flaky network) resolve to the
   * same server message instead of producing duplicates.
   */
  clientMessageId: string;
  originalLanguage?: string;
  messageType?: 'text' | 'image' | 'file' | 'system';
  replyToId?: string;
  storyReplyToId?: string;
  // Forwarding fields
  forwardedFromId?: string;
  forwardedFromConversationId?: string;
  // Diffusion à plusieurs destinataires (PAS un transfert) : copie serveur
  // des pièces jointes du message désigné, mêmes fichiers, sans marque de
  // transfert. Voir services/messaging/copyAttachments.ts.
  copyAttachmentsFromMessageId?: string;
  // Encryption fields
  encryptedContent?: string;
  encryptionMode?: 'e2ee' | 'server' | 'hybrid';
  encryptionMetadata?: Record<string, any>;
  isEncrypted?: boolean;
  // Audio attachments (pre-uploaded via /attachments/upload)
  attachmentIds?: string[];
  // Ephemeral/blurred/view-once message fields
  isBlurred?: boolean;
  expiresAt?: string;
  effectFlags?: number;
  isViewOnce?: boolean;
  maxViewOnceCount?: number;
  mentionedUserIds?: string[];
  // Lieu partagé — champ dédié, jamais un `metadata` brut. Validé et écrit
  // dans `metadata.location` par `MessageProcessor.saveMessage`.
  location?: unknown;
  // Sticker — même doctrine que `location` (#4823). Validé par
  // `parseMessageSticker` et écrit dans `metadata.sticker`.
  sticker?: unknown;
}

export interface MessagesQuery {
  limit?: string;
  offset?: string;
  before?: string; // messageId pour pagination
  after?: string; // ISO8601 watermark: messages créés strictement après cet instant (backfill incrémental local-first)
  around?: string; // messageId pour charger les messages autour d'un message spécifique
  // #4177 — fil de réponses : filtre CÔTÉ SERVEUR aux réponses de CE message.
  // Absent du schéma de route jusqu'ici, AJV (`removeAdditional`, réglage par
  // défaut de Fastify) le retirait de `request.query` avant que le handler ne
  // s'exécute — `ThreadRepliesLoader.swift` l'envoie depuis toujours en
  // croyant, comme le dit son doc-comment, que le filtrage est déjà
  // server-side. Il ne l'était pas : ouvrir un fil chargeait les 50 derniers
  // messages de la conversation ENTIÈRE.
  replyToId?: string;
  // #4340 — la SOUS-COLLECTION lue : 'timeline' (défaut) | 'thread' | 'pinned' |
  // 'search'. Comme `replyToId` avant elle, une clé absente de ce type ET du
  // schéma de route est retirée en silence par AJV (`removeAdditional`) avant
  // que le handler ne s'exécute : les trois vont ensemble, ou aucune n'arrive.
  view?: string;
  /** Requis par `view=thread` — synonyme de `replyToId`, qui reste accepté. */
  parentId?: string;
  /** Requis par `view=search` — cherché dans le contenu ET les traductions. */
  q?: string;
  include_reactions?: string;
  include_translations?: string;
  include_status?: string;
  include_replies?: string;
  languages?: string; // CSV des langues du Prisme (ex: "fr,en"): filtre les traductions texte ET audio renvoyées. Absent = toutes.
}

export interface MessageSearchQuery {
  q: string;
  limit?: string;
  cursor?: string; // messageId for cursor-based pagination
}

export interface SearchQuery {
  q?: string;
}
