package me.meeshy.sdk.outbox

import kotlinx.serialization.Serializable

/** Les lanes des actions de message de l'écran de chat (#15415) : une file par famille, jamais derrière un envoi. */
public object OutboxChatLanes {
    /** « Supprimer pour moi » et son inverse : FIFO entre eux, pour que masquer puis restaurer arrive dans l'ordre. */
    public const val PERSONAL_HIDING: String = "personalHiding"

    /** Retrait d'une pièce et suppression par la modération. */
    public const val CONTENT_REMOVAL: String = "contentRemoval"
}

/**
 * Charge d'un `HIDE_FOR_ME` / `RESTORE_FOR_ME`. La `targetId` de la ligne est le message ; la conversation voyage ici pour
 * que le retour arrière relise la bonne fenêtre quand le serveur refuse.
 */
@Serializable
public data class MessageHidingPayload(val conversationId: String)

/** Charge d'un `REMOVE_ATTACHMENT`. La `targetId` de la ligne est la pièce (`DELETE /attachments/:id`). */
@Serializable
public data class RemoveAttachmentPayload(val conversationId: String, val messageId: String)

/**
 * Charge d'un `MODERATION_DELETE`. La `targetId` de la ligne est le message ; [reason] est le motif rogné et non vide
 * (un retrait sans motif n'est pas une modération : il passe par `DELETE_MESSAGE`).
 */
@Serializable
public data class ModerationDeletePayload(val conversationId: String, val reason: String)

/** Charge d'un `MARK_RECEIVED` : la `targetId` de la ligne est la conversation, il n'y a rien d'autre à dire. */
@Serializable
public data class MarkReceivedPayload(val conversationId: String? = null)
