package me.meeshy.sdk.conversation

import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.ConversationEntity
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ConversationMergeRules
import me.meeshy.sdk.model.UserUpdatedEvent
import me.meeshy.sdk.model.repainted
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.session.AccountTicket

/**
 * `user:updated` repeint, dans le cache Room, ce qu'un pair renommé laisse derrière lui : son nom composé, son avatar
 * et son contour dans ses messages, dans les citations et références de transfert qui gravent son id, et dans la ligne
 * de sa conversation (participants, auteur du dernier message). Miroir de `repaintSender` (iOS) : la table `messages`
 * est ce que le fil lit, et ce que la réouverture sert sans réseau.
 *
 * Les charges ne sont décodées que pour les lignes qui CONTIENNENT l'id (pré-filtre SQL) : un `user:updated` ne relit
 * pas toute la table. Seules les lignes qui CHANGENT sont réécrites, en une transaction.
 */
internal class SenderRepaint(
    private val database: MeeshyDatabase,
    private val updater: CachedMessageUpdater,
) {
    /** Rend les conversations dont une ligne a été repeinte. */
    suspend fun repaint(event: UserUpdatedEvent, ticket: AccountTicket? = null): Set<String> {
        val needle = escapeLikeLiteral(event.userId)
        val messages = updater.rewriteMany(
            ticket = ticket ?: updater.ticket(),
            select = { database.messageDao().involving(event.userId, needle) },
            transform = { event.repainted(it) ?: it },
        )
        return messages + repaintConversations(event, needle)
    }

    private suspend fun repaintConversations(event: UserUpdatedEvent, needle: String): Set<String> {
        val dao = database.conversationDao()
        val rewritten = dao.payloadsContaining(needle).mapNotNull { row -> repainted(row, event) }
        if (rewritten.isEmpty()) return emptySet()
        dao.upsertAll(rewritten)
        return rewritten.map { it.id }.toSet()
    }

    private fun repainted(row: ConversationEntity, event: UserUpdatedEvent): ConversationEntity? {
        val conversation = runCatching { MeeshyApi.json.decodeFromString<ApiConversation>(row.payload) }.getOrNull()
            ?: return null
        val next = ConversationMergeRules.userUpdated(conversation, event) ?: return null
        return row.copy(payload = MeeshyApi.json.encodeToString(ApiConversation.serializer(), next))
    }

    private fun escapeLikeLiteral(text: String): String =
        text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
}
