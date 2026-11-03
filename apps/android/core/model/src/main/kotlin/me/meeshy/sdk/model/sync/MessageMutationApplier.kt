package me.meeshy.sdk.model.sync

import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.MessageEditOrdering

/**
 * La loi PURE des mutations de message : de l'état courant et d'une mutation, l'état suivant. Idempotente
 * (appliquée deux fois, même état), sans horloge ni Room.
 */
object MessageMutationApplier {

    /**
     * Un avis d'appel (« en cours » devenu « terminé ») est réécrit sur place par la passerelle sans que
     * personne l'ait modifié : il ne porte jamais la mention « modifié ».
     */
    fun normalizedEdit(message: ApiMessage): ApiMessage =
        if (message.callSummary != null && (message.isEdited || message.editedAt != null)) {
            message.copy(isEdited = false, editedAt = null)
        } else {
            message
        }

    /**
     * @param current le message en cache, `null` s'il est inconnu ;
     * @param nowIso l'instant écrit sur une suppression qui n'en porte pas.
     * @return l'état suivant, `null` quand le message est inconnu et que la mutation n'en crée pas.
     */
    fun apply(current: ApiMessage?, mutation: MessageMutation, nowIso: String): ApiMessage? = when (mutation) {
        is MessageMutation.Edited -> {
            val incoming = normalizedEdit(mutation.message)
            when {
                current == null -> incoming
                MessageEditOrdering.acceptsIso(current.editedAt, mutation.message.editedAt) -> incoming
                else -> current
            }
        }
        is MessageMutation.Deleted -> current?.tombstoned(mutation.deletedAt ?: nowIso)
        is MessageMutation.Expired -> current?.tombstoned(nowIso)
    }

    private fun ApiMessage.tombstoned(at: String): ApiMessage =
        if (deletedAt != null) this else copy(deletedAt = at)
}
