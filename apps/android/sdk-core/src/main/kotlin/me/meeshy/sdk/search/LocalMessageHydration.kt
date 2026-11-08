package me.meeshy.sdk.search

import me.meeshy.core.database.dao.MessageDao
import me.meeshy.sdk.conversation.toLocalMessage
import me.meeshy.sdk.model.ApiMessage
import java.time.Instant

/**
 * Les messages du cache derrière les résultats de l'index, dans l'ordre de [hits]. L'index ne dit
 * pas si un message est flouté (#16474) : une ligne absente ou illisible se rend VOILÉE, jamais en
 * clair.
 */
internal suspend fun MessageDao.hydrate(hits: List<LocalMessageHit>): List<ApiMessage> {
    if (hits.isEmpty()) return emptyList()
    val cached = findAll(hits.map { it.messageId })
        .mapNotNull { row -> runCatching { row.toLocalMessage().message }.getOrNull() }
        .associateBy { it.id }
    return hits.map { hit ->
        cached[hit.messageId] ?: ApiMessage(
            id = hit.messageId,
            conversationId = hit.conversationId,
            content = hit.text,
            createdAt = Instant.ofEpochMilli(hit.createdAt).toString(),
            isBlurred = true,
        )
    }
}
