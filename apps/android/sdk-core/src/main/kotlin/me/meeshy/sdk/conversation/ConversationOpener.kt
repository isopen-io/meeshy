package me.meeshy.sdk.conversation

import javax.inject.Inject
import kotlinx.coroutines.delay
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.net.NetworkResult

/** Where an open-by-id found its conversation. */
sealed interface ConversationOpenOutcome {
    /** Conversation already held in memory by the list: immediate navigation. */
    data object Known : ConversationOpenOutcome

    /** Found in the Room cache (fresh or stale): immediate navigation, then a silent refresh. */
    data object Cached : ConversationOpenOutcome

    /** Not cached: fetched from the network (and merged into the cache) before navigating. */
    data object Fetched : ConversationOpenOutcome

    /** Every attempt failed; [detail] is the underlying error message, when there is one. */
    data class Failed(val detail: String?) : ConversationOpenOutcome
}

/** Storage and network seam of [ConversationOpener] (the repository in production). */
interface ConversationOpenerStore {
    suspend fun cached(id: String): ApiConversation?
    suspend fun fetch(id: String): NetworkResult<ApiConversation>
    suspend fun remember(conversation: ApiConversation)
}

/**
 * Open a conversation BY ID, whatever the entry point (notification, link, widget, shortcut).
 * Mirror of iOS `RootConversationOpener`: in-memory list, then Room cache (navigate at once,
 * refresh quietly), then the network with a second attempt [RETRY_DELAY_MS] later — a push can
 * race the gateway's commit. Never a silent empty screen: a failure is returned with its detail.
 */
class ConversationOpener(
    private val store: ConversationOpenerStore,
    private val pause: suspend (Long) -> Unit = { delay(it) },
) {
    @Inject
    constructor(repository: ConversationRepository) : this(RepositoryStore(repository))

    /**
     * [navigate] is invoked exactly once on success, BEFORE any background refresh, with the
     * conversation id and the message to highlight. Callers run this in a scope that outlives
     * the navigation so the refresh completes.
     */
    suspend fun open(
        conversationId: String,
        highlightMessageId: String? = null,
        isKnown: Boolean = false,
        navigate: (conversationId: String, highlightMessageId: String?) -> Unit,
    ): ConversationOpenOutcome {
        if (isKnown) {
            navigate(conversationId, highlightMessageId)
            return ConversationOpenOutcome.Known
        }
        if (store.cached(conversationId) != null) {
            navigate(conversationId, highlightMessageId)
            refreshQuietly(conversationId)
            return ConversationOpenOutcome.Cached
        }
        var detail: String? = null
        repeat(ATTEMPTS) { attempt ->
            when (val result = store.fetch(conversationId)) {
                is NetworkResult.Success -> {
                    store.remember(result.data)
                    navigate(conversationId, highlightMessageId)
                    return ConversationOpenOutcome.Fetched
                }
                is NetworkResult.Failure -> detail = result.error.message.takeIf { it.isNotBlank() }
            }
            if (attempt < ATTEMPTS - 1) pause(RETRY_DELAY_MS)
        }
        return ConversationOpenOutcome.Failed(detail)
    }

    private suspend fun refreshQuietly(conversationId: String) {
        val fetched = store.fetch(conversationId)
        if (fetched is NetworkResult.Success) store.remember(fetched.data)
    }

    private class RepositoryStore(private val repository: ConversationRepository) : ConversationOpenerStore {
        override suspend fun cached(id: String): ApiConversation? = repository.cachedById(id)
        override suspend fun fetch(id: String): NetworkResult<ApiConversation> = repository.getById(id)
        override suspend fun remember(conversation: ApiConversation) = repository.remember(conversation)
    }

    companion object {
        const val RETRY_DELAY_MS: Long = 600
        private const val ATTEMPTS = 2
    }
}
