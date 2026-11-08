package me.meeshy.sdk.model.sync

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.conversationlist.LastMessageFacet
import me.meeshy.sdk.model.conversationlist.admitsLastMessage
import me.meeshy.sdk.model.conversationlist.applyingLastMessage

/**
 * Le pli PUR d'un `message:new` dans la ligne de liste : facette COMPLÈTE du dernier message ET non-lu,
 * d'un seul tenant. Le non-lu ne monte que pour un message REÇU (pas le mien), dans une conversation
 * NON ouverte, et UNE fois : un message déjà aperçu (même identifiant, ou alias) ne le fait plus monter,
 * si bien que le relais et la liste ouverte, qui plient le même broadcast, ne comptent pas deux fois.
 * Le compteur absolu du serveur (`conversation:unread-updated`) reste l'autorité qui corrige.
 */
object ConversationPatch {

    fun receivingMessage(
        row: ApiConversation,
        facet: LastMessageFacet,
        aliases: List<String> = emptyList(),
        countsAsUnread: Boolean,
    ): ApiConversation {
        if (!row.admitsLastMessage(facet.id, facet.createdAtMillis, aliases)) return row
        val current = row.lastMessage?.id
        val alreadySeen = current != null && (current == facet.id || current in aliases)
        val applied = row.applyingLastMessage(facet)
        return if (countsAsUnread && !alreadySeen) applied.copy(unreadCount = row.unreadCount + 1) else applied
    }
}
