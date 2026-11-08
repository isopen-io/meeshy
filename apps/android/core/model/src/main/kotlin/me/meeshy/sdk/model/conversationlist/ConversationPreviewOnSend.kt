package me.meeshy.sdk.model.conversationlist

import me.meeshy.sdk.model.ApiConversation

/**
 * L'aperçu de la liste suit MON envoi : la ligne remonte avec la facette de la bulle optimiste dès l'envoi,
 * et se recalcule si la bulle disparaît (retour arrière). Miroir de `updateConversationAfterSend` (iOS).
 *
 * Le rang n'est jamais reculé : un message plus récent déjà aperçu (arrivé par socket) garde la ligne.
 * Le non-lu n'est pas touché : c'est mon propre message.
 */
object ConversationPreviewOnSend {

    /** La ligne portant la facette de l'envoi [facet], si celui-ci n'est pas plus ancien que l'aperçu en place. */
    fun staging(row: ApiConversation, facet: LastMessageFacet): ApiConversation =
        if (row.admitsLastMessage(facet.id, facet.createdAtMillis)) row.applyingLastMessage(facet) else row

    /**
     * La bulle [sentId] a été retirée : si elle ÉTAIT l'aperçu, la ligne revient à la facette [previous]
     * (le dernier message restant), ou se vide faute de remplaçant ; sinon rien ne bouge.
     */
    fun rollingBack(row: ApiConversation, sentId: String, previous: LastMessageFacet?): ApiConversation {
        if (row.lastMessage?.id != sentId) return row
        val replacement = previous?.takeIf { it.id != sentId }
        return replacement?.let(row::applyingLastMessage) ?: row.clearingLastMessage()
    }
}
