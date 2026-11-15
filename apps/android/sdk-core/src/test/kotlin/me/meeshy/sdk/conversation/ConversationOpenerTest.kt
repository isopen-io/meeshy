package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.currentTime
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConversationOpenerTest {

    private class FakeStore(
        var cachedConversation: ApiConversation? = null,
        val fetches: MutableList<NetworkResult<ApiConversation>> = mutableListOf(),
    ) : ConversationOpenerStore {
        var fetchCount = 0
        val remembered = mutableListOf<ApiConversation>()
        override suspend fun cached(id: String) = cachedConversation
        override suspend fun fetch(id: String): NetworkResult<ApiConversation> {
            fetchCount++
            return fetches.removeAt(0)
        }
        override suspend fun remember(conversation: ApiConversation) { remembered += conversation }
    }

    private fun conv(id: String = "c1") = ApiConversation(id = id)
    private fun failure(message: String) = NetworkResult.Failure(ApiError(message))

    @Test
    fun `a conversation known in memory navigates at once without touching cache or network`() = runTest {
        val store = FakeStore()
        val navigated = mutableListOf<Pair<String, String?>>()
        val outcome = ConversationOpener(store, { }).open("c1", "m9", isKnown = true) { id, m -> navigated += id to m }
        assertThat(outcome).isEqualTo(ConversationOpenOutcome.Known)
        assertThat(navigated).containsExactly("c1" to "m9")
        assertThat(store.fetchCount).isEqualTo(0)
    }

    @Test
    fun `a cached conversation navigates before a silent refresh that merges the fresh copy`() = runTest {
        val refreshed = conv().copy(title = "Neuf")
        val store = FakeStore(cachedConversation = conv(), fetches = mutableListOf(NetworkResult.Success(refreshed)))
        val order = mutableListOf<String>()
        val outcome = ConversationOpener(store, { }).open("c1") { _, _ -> order += "nav:${store.fetchCount}" }
        assertThat(outcome).isEqualTo(ConversationOpenOutcome.Cached)
        assertThat(order).containsExactly("nav:0")
        assertThat(store.remembered).containsExactly(refreshed)
    }

    @Test
    fun `a failed background refresh of a cached conversation stays silent`() = runTest {
        val store = FakeStore(cachedConversation = conv(), fetches = mutableListOf(failure("offline")))
        val outcome = ConversationOpener(store, { }).open("c1") { _, _ -> }
        assertThat(outcome).isEqualTo(ConversationOpenOutcome.Cached)
        assertThat(store.remembered).isEmpty()
    }

    @Test
    fun `off cache the second attempt 600 ms later succeeds and the conversation is merged`() = runTest {
        val store = FakeStore(fetches = mutableListOf(failure("race"), NetworkResult.Success(conv())))
        val navigated = mutableListOf<String>()
        val outcome = ConversationOpener(store).open("c1", "m1") { id, _ -> navigated += id }
        assertThat(outcome).isEqualTo(ConversationOpenOutcome.Fetched)
        assertThat(currentTime).isEqualTo(600)
        assertThat(navigated).containsExactly("c1")
        assertThat(store.remembered).containsExactly(conv())
    }

    @Test
    fun `two failed attempts return the underlying detail and never navigate`() = runTest {
        val store = FakeStore(fetches = mutableListOf(failure("first"), failure("HTTP 404")))
        var navigated = false
        val outcome = ConversationOpener(store).open("c1") { _, _ -> navigated = true }
        assertThat(outcome).isEqualTo(ConversationOpenOutcome.Failed("HTTP 404"))
        assertThat(store.fetchCount).isEqualTo(2)
        assertThat(currentTime).isEqualTo(600)
        assertThat(navigated).isFalse()
    }
}
