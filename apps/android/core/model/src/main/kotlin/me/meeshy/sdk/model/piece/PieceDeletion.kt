package me.meeshy.sdk.model.piece

import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ObjectIdGuard

/**
 * **Supprimer UNE pièce — jamais une voisine** (miroir de `MessagePieceTarget.deletableMedia` et de
 * `deleteAttachment`, iOS, #9906). Une règle pure : le menu de la pièce, le plein écran et la feuille « Plus… » posent
 * la même question à cette fonction.
 */
object PieceDeletion {

    /** Ce que le geste fait, une fois la pièce désignée. */
    sealed interface Plan {
        /** Le message garde du texte ou d'autres pièces : seule la pièce disparaît. */
        data class RemovePiece(val attachmentId: String, val remaining: List<ApiMessageAttachment>) : Plan

        /** C'était tout ce que le message portait : le message entier est supprimé (iOS `deleteMessage`). */
        data object DeleteMessage : Plan

        /** Rien n'est désigné, ou la pièce n'est pas de ce message : rien ne part. */
        data object Nothing : Plan
    }

    /** La pièce que « Supprimer le média » efface : la pièce visée si elle est de ce message (hors lieu). */
    fun deletableMedia(message: ApiMessage, targeted: String?): String? {
        val pieces = message.attachments.filterNot { it.latitude != null && it.longitude != null }
        if (targeted != null) return pieces.firstOrNull { it.id == targeted }?.id
        return pieces.singleOrNull()?.id
    }

    fun plan(message: ApiMessage, targeted: String?): Plan {
        val target = deletableMedia(message, targeted) ?: return Plan.Nothing
        val keepsSomething = message.attachments.size > 1 || message.content.isNotBlank()
        if (!keepsSomething) return Plan.DeleteMessage
        return Plan.RemovePiece(target, message.attachments.filterNot { it.id == target })
    }

    /**
     * Le lecteur a-t-il le droit d'effacer la pièce SUR LA PASSERELLE (`DELETE /attachments/:id` : celui qui l'a
     * déposée, ou un rôle de modération — que ce client ne sert pas) ? Son propre message, accusé du serveur, vivant,
     * hors conversation chiffrée : jamais « pour moi ».
     */
    fun mayDelete(message: ApiMessage, viewerId: String?, conversationIsEndToEnd: Boolean): Boolean =
        viewerId != null &&
            message.senderId == viewerId &&
            message.deletedAt.isNullOrBlank() &&
            !ObjectIdGuard.isLocalId(message.id) &&
            !conversationIsEndToEnd
}
