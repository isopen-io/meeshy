package me.meeshy.sdk.conversation

import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.model.ConversationEventDeltas
import me.meeshy.sdk.session.AccountTicket

/**
 * Le post cité a été retiré (`message:cited-post-withdrawn`) : chaque citation du fil passe en « Story indisponible » /
 * « Publication indisponible » en UNE écriture — une transaction, un `upsertAll` — si bien que le fil ne recompose
 * qu'une fois, jamais une bulle après l'autre. Miroir de `markCitedPostWithdrawn` (iOS).
 *
 * Le pré-filtre SQL sur-sélectionne (toute charge qui nomme le post) ; la loi
 * [ConversationEventDeltas.citedPostWithdrawn] décide sur la charge décodée, et une citation déjà indisponible
 * n'est pas réécrite.
 */
internal class CitedPostWithdrawn(
    private val database: MeeshyDatabase,
    private val updater: CachedMessageUpdater,
) {
    /** Rend les conversations dont au moins une citation a changé. */
    suspend fun apply(conversationId: String, postId: String, ticket: AccountTicket? = null): Set<String> {
        if (postId.isEmpty()) return emptySet()
        return updater.rewriteMany(
            ticket = ticket ?: updater.ticket(),
            select = { database.messageDao().mentioning(conversationId, postId) },
            transform = { ConversationEventDeltas.citedPostWithdrawn(it, postId) },
        )
    }
}
