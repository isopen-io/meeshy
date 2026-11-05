package me.meeshy.sdk.thread

import javax.inject.Inject
import kotlinx.serialization.decodeFromString
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.sdk.conversation.LocalSendState
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.thread.ThreadReplies
import me.meeshy.sdk.model.thread.ThreadReply
import me.meeshy.sdk.model.thread.ThreadReplyMapper
import me.meeshy.sdk.model.thread.ThreadReplyStatus
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.ThreadRepliesApi

/** Une page du fil : les réponses lisibles et s'il en reste côté serveur. */
data class ThreadRepliesPage(val replies: List<ThreadReply>, val hasMore: Boolean)

/** Une ligne du cache de la conversation, réduite à ce que le fil lit. */
data class CachedMessageRow(val payload: String, val sendState: String?)

/**
 * Charge les réponses d'un message (miroir de `ThreadRepliesLoader` iOS + de l'amorçage `CacheCoordinator`) :
 * [cached] lit le cache de la conversation SANS le réécrire (un sous-ensemble de réponses corromprait la
 * liste complète) ; [load] interroge le serveur, 50 par page, et laisse remonter l'échec réseau — l'appelant
 * garde alors l'existant.
 */
class ThreadRepliesLoader internal constructor(
    private val fetch: suspend (conversationId: String, parentId: String, limit: Int, offset: Int) -> ApiResponse<List<ApiMessage>>,
    private val cachedRows: suspend (conversationId: String) -> List<CachedMessageRow>,
) {
    @Inject
    constructor(api: ThreadRepliesApi, messageDao: MessageDao) : this(
        fetch = { cid, parent, limit, offset -> api.replies(cid, parent, limit, offset.takeIf { it > 0 }) },
        cachedRows = { cid -> messageDao.listForConversation(cid).map { CachedMessageRow(it.payload, it.sendState) } },
    )

    suspend fun cached(
        conversationId: String,
        parentId: String,
        currentUserId: String?,
        prism: List<String>,
    ): List<ThreadReply> =
        cachedRows(conversationId).mapNotNull { row ->
            val message = decode(row.payload) ?: return@mapNotNull null
            if (message.replyToId?.trim() != parentId) return@mapNotNull null
            ThreadReplyMapper.fromApi(message, currentUserId, prism, statusOf(row.sendState))
        }.sortedBy { it.createdAtMillis }

    suspend fun load(
        conversationId: String,
        parentId: String,
        currentUserId: String?,
        prism: List<String>,
        offset: Int = 0,
        limit: Int = ThreadReplies.PAGE_SIZE,
    ): ThreadRepliesPage {
        val response = fetch(conversationId, parentId, limit, offset)
        check(response.success) { response.error ?: "thread replies refused" }
        val messages = response.data.orEmpty()
        return ThreadRepliesPage(
            replies = messages
                .filter { it.replyToId?.trim() == parentId }
                .mapNotNull { ThreadReplyMapper.fromApi(it, currentUserId, prism) }
                .sortedBy { it.createdAtMillis },
            hasMore = response.pagination?.hasMore ?: (messages.size >= limit),
        )
    }

    private fun decode(payload: String): ApiMessage? =
        try { MeeshyApi.json.decodeFromString<ApiMessage>(payload) } catch (_: Exception) { null }

    private fun statusOf(sendState: String?): ThreadReplyStatus = when (sendState) {
        LocalSendState.SENDING.name -> ThreadReplyStatus.SENDING
        LocalSendState.FAILED.name -> ThreadReplyStatus.FAILED
        else -> ThreadReplyStatus.SENT
    }
}
