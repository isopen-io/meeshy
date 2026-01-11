/**
 * Types pour la suppression de messages par utilisateur
 * Alignés avec le modèle Prisma: UserMessageDeletion
 *
 * Ces types gèrent la suppression "soft" des messages côté utilisateur.
 * Quand un utilisateur supprime un message pour lui-même (et non pour tout le monde),
 * le message reste en base mais est marqué comme supprimé pour cet utilisateur spécifique.
 */

// =====================================================
// USER MESSAGE DELETION
// =====================================================

/**
 * Enregistrement de suppression de message par un utilisateur
 * Aligned with schema.prisma UserMessageDeletion
 *
 * Permet la suppression "Delete for me" où le message existe toujours
 * mais n'est plus visible pour cet utilisateur spécifique.
 */
export interface UserMessageDeletion {
  readonly id: string;

  /** Utilisateur qui a supprimé le message */
  readonly userId: string;

  /** Message supprimé */
  readonly messageId: string;

  /** Date de suppression */
  readonly deletedAt: Date;
}

/**
 * DTO pour créer une suppression de message
 */
export interface CreateUserMessageDeletionDTO {
  readonly userId: string;
  readonly messageId: string;
}

/**
 * DTO pour supprimer plusieurs messages en lot
 */
export interface BatchDeleteMessagesDTO {
  readonly userId: string;
  readonly messageIds: readonly string[];
}

/**
 * Résultat d'une suppression de messages en lot
 */
export interface BatchDeleteMessagesResult {
  readonly success: boolean;
  readonly deletedCount: number;
  readonly failedIds?: readonly string[];
  readonly error?: string;
}

/**
 * Filtres pour rechercher des suppressions
 */
export interface UserMessageDeletionFilters {
  readonly userId?: string;
  readonly messageId?: string;
  readonly conversationId?: string;
  readonly deletedAfter?: Date;
  readonly deletedBefore?: Date;
  readonly limit?: number;
  readonly offset?: number;
}

/**
 * Informations de suppression avec détails du message
 */
export interface UserMessageDeletionWithDetails extends UserMessageDeletion {
  readonly message?: {
    readonly id: string;
    readonly conversationId: string;
    readonly originalText?: string;
    readonly createdAt: Date;
  };
}

// =====================================================
// DELETE FOR EVERYONE
// =====================================================

/**
 * Types de suppression de message
 */
export type MessageDeletionType = 'for_me' | 'for_everyone';

/**
 * Requête de suppression de message
 */
export interface DeleteMessageRequest {
  readonly userId: string;
  readonly messageId: string;
  readonly deletionType: MessageDeletionType;
}

/**
 * Résultat de suppression de message
 */
export interface DeleteMessageResult {
  readonly success: boolean;
  readonly deletionType: MessageDeletionType;
  /** Si 'for_everyone', les IDs des utilisateurs affectés */
  readonly affectedUserIds?: readonly string[];
  readonly error?: string;
}

// =====================================================
// CONVERSATION DELETION
// =====================================================

/**
 * Options pour supprimer une conversation
 */
export interface DeleteConversationOptions {
  readonly userId: string;
  readonly conversationId: string;
  /** Si true, supprime aussi tous les messages pour cet utilisateur */
  readonly deleteMessages?: boolean;
}

/**
 * Résultat de suppression de conversation
 */
export interface DeleteConversationResult {
  readonly success: boolean;
  readonly conversationId: string;
  readonly deletedMessagesCount?: number;
  readonly error?: string;
}

// =====================================================
// TYPE GUARDS & UTILITIES
// =====================================================

/**
 * Vérifie si un message est supprimé pour un utilisateur donné
 */
export function isMessageDeletedForUser(
  deletions: readonly UserMessageDeletion[],
  messageId: string,
  userId: string
): boolean {
  return deletions.some(
    (d) => d.messageId === messageId && d.userId === userId
  );
}

/**
 * Filtre les messages supprimés d'une liste
 */
export function filterDeletedMessages<T extends { id: string }>(
  messages: readonly T[],
  deletions: readonly UserMessageDeletion[],
  userId: string
): T[] {
  const deletedMessageIds = new Set(
    deletions
      .filter((d) => d.userId === userId)
      .map((d) => d.messageId)
  );

  return messages.filter((m) => !deletedMessageIds.has(m.id));
}

/**
 * Obtient la liste des IDs de messages supprimés pour un utilisateur
 */
export function getDeletedMessageIds(
  deletions: readonly UserMessageDeletion[],
  userId: string
): string[] {
  return deletions
    .filter((d) => d.userId === userId)
    .map((d) => d.messageId);
}

/**
 * Vérifie si un utilisateur peut supprimer un message pour tout le monde
 * (typiquement dans les X minutes après l'envoi)
 */
export function canDeleteForEveryone(
  message: { createdAt: Date; userId?: string },
  userId: string,
  windowMinutes: number = 60
): boolean {
  // Seul l'auteur peut supprimer pour tout le monde
  if (message.userId !== userId) {
    return false;
  }

  const now = new Date();
  const messageAge = now.getTime() - message.createdAt.getTime();
  const windowMs = windowMinutes * 60 * 1000;

  return messageAge <= windowMs;
}

/**
 * Crée un DTO de suppression à partir d'une requête
 */
export function createDeletionDTO(
  userId: string,
  messageId: string
): CreateUserMessageDeletionDTO {
  return {
    userId,
    messageId,
  };
}

/**
 * Crée un DTO de suppression en lot
 */
export function createBatchDeletionDTO(
  userId: string,
  messageIds: readonly string[]
): BatchDeleteMessagesDTO {
  return {
    userId,
    messageIds,
  };
}
