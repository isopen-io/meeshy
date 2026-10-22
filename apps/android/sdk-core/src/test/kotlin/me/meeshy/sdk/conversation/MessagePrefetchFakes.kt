package me.meeshy.sdk.conversation

import kotlinx.coroutines.CompletableDeferred
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.chat.HeldMessageWindow
import me.meeshy.sdk.model.chat.PrefetchCandidate

internal fun candidate(id: String, last: String = "m-$id") = PrefetchCandidate(id, last, 1_000L)

internal fun apiMessage(id: String, conversationId: String) = ApiMessage(
    id = id,
    conversationId = conversationId,
    content = "hello",
    createdAt = "2026-10-01T10:00:00.000Z",
)

internal class FakePrefetchSource(
    private val failing: Set<String> = emptySet(),
    var gate: CompletableDeferred<Unit>? = null,
) : MessagePrefetchPageSource {
    val requested = mutableListOf<String>()
    var concurrent = 0
    var maxConcurrent = 0

    override suspend fun fetchLatestPage(conversationId: String, limit: Int): List<ApiMessage>? {
        requested += conversationId
        concurrent++
        maxConcurrent = maxOf(maxConcurrent, concurrent)
        try {
            gate?.await()
        } finally {
            concurrent--
        }
        return if (conversationId in failing) null else listOf(apiMessage("srv-$conversationId", conversationId))
    }
}

internal class FakePrefetchStore(
    private val held: Map<String, HeldMessageWindow> = emptyMap(),
) : MessagePrefetchStore {
    val persisted = mutableListOf<String>()
    var onPersist: () -> Unit = {}

    override suspend fun heldWindow(conversationId: String, limit: Int) =
        held[conversationId] ?: HeldMessageWindow.EMPTY

    override suspend fun persist(page: List<ApiMessage>, conversationId: String): Boolean {
        onPersist()
        persisted += conversationId
        return true
    }
}
