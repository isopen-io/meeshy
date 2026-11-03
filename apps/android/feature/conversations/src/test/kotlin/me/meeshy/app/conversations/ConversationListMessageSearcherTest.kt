package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiTextTranslation
import me.meeshy.sdk.model.search.ListMessageSearch
import me.meeshy.sdk.model.search.ListMessageSearchPhase
import me.meeshy.sdk.search.ListMessageSearchSource
import me.meeshy.sdk.search.RemoteMessageSearch
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConversationListMessageSearcherTest {

    private fun TestScope.settle() {
        advanceTimeBy(ListMessageSearch.DEBOUNCE_MS + 1)
        runCurrent()
    }

    private class FakeSource(
        val local: List<ApiMessage> = emptyList(),
        val remote: RemoteMessageSearch? = RemoteMessageSearch(emptyList(), failed = false),
    ) : ListMessageSearchSource {
        val localQueries = mutableListOf<String>()
        val remoteAsked = mutableListOf<List<String>>()
        override suspend fun local(query: String): List<ApiMessage> = local.also { localQueries += query }
        override suspend fun remote(query: String, conversationIds: List<String>): RemoteMessageSearch? =
            remote.also { remoteAsked += conversationIds }
    }

    private fun message(id: String, conversationId: String = "c1", isViewOnce: Boolean? = null) = ApiMessage(
        id = id,
        conversationId = conversationId,
        content = "Hello $id",
        originalLanguage = "en",
        createdAt = "2026-11-02T10:00:00Z",
        translations = listOf(ApiTextTranslation(targetLanguage = "fr", translatedContent = "Bonjour $id")),
        isViewOnce = isViewOnce,
    )

    private val conversations = listOf(
        ApiConversation(id = "c1"),
        ApiConversation(id = "secret", encryptionMode = "e2ee"),
    )

    @Test
    fun the_typing_is_debounced_and_only_the_last_query_searches() = runTest {
        val source = FakeSource()
        val searcher = ConversationListMessageSearcher(backgroundScope, source, { listOf("fr") }, { conversations })

        searcher.onQueryChanged("he")
        advanceTimeBy(ListMessageSearch.DEBOUNCE_MS / 2)
        searcher.onQueryChanged("hel")
        settle()

        assertThat(source.localQueries).containsExactly("hel")
    }

    @Test
    fun local_then_server_hits_are_served_in_the_reader_language_without_any_e2ee_conversation_asked() = runTest {
        val source = FakeSource(
            local = listOf(message("m1")),
            remote = RemoteMessageSearch(listOf(message("m2"), message("m3", isViewOnce = true)), failed = false),
        )
        val searcher = ConversationListMessageSearcher(backgroundScope, source, { listOf("fr") }, { conversations })

        searcher.onQueryChanged("hello")
        settle()

        val state = searcher.state.value
        assertThat(state.phase).isEqualTo(ListMessageSearchPhase.LOADED)
        assertThat(state.hits.map { it.text }).containsExactly("Bonjour m1", "Bonjour m2")
        assertThat(source.remoteAsked).containsExactly(listOf("c1"))
    }

    @Test
    fun offline_the_section_answers_from_the_device_alone() = runTest {
        val source = FakeSource(local = listOf(message("m1")), remote = null)
        val searcher = ConversationListMessageSearcher(backgroundScope, source, { emptyList() }, { conversations })

        searcher.onQueryChanged("hello")
        settle()

        assertThat(searcher.state.value.phase).isEqualTo(ListMessageSearchPhase.LOADED)
        assertThat(searcher.state.value.hits.map { it.text }).containsExactly("Hello m1")
    }

    @Test
    fun clearing_the_query_hides_the_section_at_once() = runTest {
        val source = FakeSource(local = listOf(message("m1")))
        val searcher = ConversationListMessageSearcher(backgroundScope, source, { emptyList() }, { conversations })
        searcher.onQueryChanged("hello")
        settle()

        searcher.onQueryChanged("h")
        runCurrent()

        assertThat(searcher.state.value.showsSection).isFalse()
        assertThat(searcher.state.value.hits).isEmpty()
    }

    @Test
    fun a_locked_conversation_shows_none_of_its_messages_and_is_never_asked() = runTest {
        val source = FakeSource(
            local = listOf(message("m1", conversationId = "c1"), message("m2", conversationId = "locked")),
            remote = RemoteMessageSearch(listOf(message("m3", conversationId = "locked")), failed = false),
        )
        val searcher = ConversationListMessageSearcher(
            backgroundScope,
            source,
            { emptyList() },
            { conversations + ApiConversation(id = "locked") },
            isConcealed = { it == "locked" },
        )

        searcher.onQueryChanged("hello")
        settle()

        assertThat(searcher.state.value.hits.map { it.messageId }).containsExactly("m1")
        assertThat(source.remoteAsked).containsExactly(listOf("c1"))
    }

    @Test
    fun a_hit_the_server_already_served_is_shown_as_served_without_a_second_prism_pass() = runTest {
        val served = me.meeshy.sdk.model.search.ListMessageHit(
            messageId = "s1",
            conversationId = "c9",
            createdAtMillis = 5L,
            text = "Servi en français",
            senderName = "Ada",
            conversationTitle = "Ada",
        )
        val source = FakeSource(remote = RemoteMessageSearch(served = listOf(served)))
        val searcher = ConversationListMessageSearcher(backgroundScope, source, { listOf("en") }, { conversations })

        searcher.onQueryChanged("servi")
        settle()

        assertThat(searcher.state.value.hits).containsExactly(served)
    }
}
