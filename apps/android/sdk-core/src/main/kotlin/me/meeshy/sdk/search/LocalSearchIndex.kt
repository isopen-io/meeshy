package me.meeshy.sdk.search

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.core.database.dao.SearchIndexDao
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.search.FtsQuerySanitizer
import me.meeshy.sdk.model.search.SearchTextFolder

/** A cached message found offline; [text] is the original text, resolved for display by the Prism. */
public data class LocalMessageHit(
    val messageId: String,
    val conversationId: String,
    val createdAt: Long,
    val text: String,
)

/**
 * Offline search over the Room cache (iOS `SearchIndex` / `MessageSearchService` counterpart).
 *
 * Messages are indexed by triggers on the cache table, so only the cache writers ever write them
 * (protected, deleted and expired messages carry no searchable text). Conversations are indexed
 * from the same transaction as the conversation cache write ([indexConversation]). Queries are
 * folded by [SearchTextFolder] and sanitized by [FtsQuerySanitizer], so `cafe` finds `café` and
 * raw FTS operators typed by the user are plain words. Reads run off the main thread.
 */
@Singleton
public class LocalSearchIndex @Inject constructor(
    private val dao: SearchIndexDao,
) {

    /** The [limit] most recent messages matching [query]; empty for a blank query. */
    public suspend fun searchMessages(query: String, limit: Int = DEFAULT_LIMIT): List<LocalMessageHit> {
        val match = FtsQuerySanitizer.match(query) ?: return emptyList()
        return dao.searchMessages(match, limit).map { LocalMessageHit(it.messageId, it.conversationId, it.createdAt, it.text) }
    }

    /** The ids of the cached conversations whose title or participants match [query]. */
    public suspend fun searchConversationIds(query: String, limit: Int = DEFAULT_LIMIT): List<String> {
        val match = FtsQuerySanitizer.match(query) ?: return emptyList()
        return dao.searchConversations(match, limit)
    }

    /** Indexes [conversation]; call it inside the transaction that writes the conversation cache. */
    public fun indexConversation(conversation: ApiConversation) {
        val title = conversation.resolvedPreferences?.customName?.takeIf { it.isNotBlank() } ?: conversation.title.orEmpty()
        val peers = conversation.participants.joinToString(" ") { listOfNotNull(it.displayName, it.username).joinToString(" ") }
        dao.replaceConversation(conversation.id, SearchTextFolder.fold(title), SearchTextFolder.fold(peers))
    }

    public companion object {
        public const val DEFAULT_LIMIT: Int = 50
    }
}
