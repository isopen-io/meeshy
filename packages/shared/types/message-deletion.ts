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

// =====================================================
// CONVERSATION DELETION
// =====================================================

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
