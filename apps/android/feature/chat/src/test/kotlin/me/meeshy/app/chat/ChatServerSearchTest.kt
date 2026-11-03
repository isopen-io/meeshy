package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.conversation.MessageSearchException
import me.meeshy.sdk.conversation.MessageSearchPage
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiTextTranslation
import me.meeshy.sdk.model.search.SearchMatchType
import me.meeshy.ui.component.bubble.BubbleContent
import org.junit.Test

class ChatServerSearchTest {

    private class Host(override val scope: CoroutineScope, val ui: MutableStateFlow<ChatUiState>) : ChatControllerHost {
        override val conversationId = "c1"
        override val uiState: StateFlow<ChatUiState> = ui
        override val messages: StateFlow<List<LocalMessage>> = MutableStateFlow(emptyList())
        override fun reportError(message: String?) = Unit
    }

    private fun hit(id: String, content: String = "hello $id", translations: List<ApiTextTranslation> = emptyList()) =
        ApiMessage(id = id, conversationId = "c1", content = content, translations = translations)

    private fun page(vararg ids: String, next: String? = null, more: Boolean = false) =
        MessageSearchPage(ids.map { hit(it) }, next, more)

    private class Rig(val repo: MessageRepository, ui: ChatUiState = ChatUiState(conversationId = "c1")) {
        val scope = TestScope(StandardTestDispatcher())
        val controller = ChatServerSearch(repo).also { it.attach(Host(scope, MutableStateFlow(ui))) }
        val state get() = controller.state.value
    }

    private fun rig(ui: ChatUiState = ChatUiState(conversationId = "c1")) = Rig(mockk(relaxed = true), ui)

    @Test
    fun `a trimmed query under two characters yields nothing and never calls the network`() {
        val r = rig()

        r.controller.onQuery(" a ")
        r.scope.advanceUntilIdle()

        assertThat(r.state).isEqualTo(ChatServerSearchState())
        coVerify(exactly = 0) { r.repo.searchMessages(any(), any(), any(), any()) }
    }

    @Test
    fun `two characters or more asks the server for twenty results`() {
        val r = rig()
        coEvery { r.repo.searchMessages("c1", "he", null, 20) } returns page("m1", "m2")

        r.controller.onQuery(" he ")
        assertThat(r.state.isSearching).isTrue()
        r.scope.advanceUntilIdle()

        assertThat(r.state.results.map { it.id }).containsExactly("m1", "m2").inOrder()
        assertThat(r.state.isSearching).isFalse()
        assertThat(r.state.panelOpen).isTrue()
    }

    @Test
    fun `the next page follows the cursor and appends without duplicates`() {
        val r = rig()
        coEvery { r.repo.searchMessages("c1", "he", null, 20) } returns page("m1", "m2", next = "m2", more = true)
        coEvery { r.repo.searchMessages("c1", "he", "m2", 20) } returns page("m2", "m3")
        r.controller.onQuery("he")
        r.scope.advanceUntilIdle()

        r.controller.loadMore()
        r.scope.advanceUntilIdle()

        assertThat(r.state.results.map { it.id }).containsExactly("m1", "m2", "m3").inOrder()
        assertThat(r.state.hasMore).isFalse()
        r.controller.loadMore()
        r.scope.advanceUntilIdle()
        coVerify(exactly = 1) { r.repo.searchMessages("c1", "he", "m2", 20) }
    }

    @Test
    fun `a stale request is cancelled by a newer query`() {
        val r = rig()
        val slow = CompletableDeferred<MessageSearchPage>()
        coEvery { r.repo.searchMessages("c1", "he", null, 20) } coAnswers { slow.await() }
        coEvery { r.repo.searchMessages("c1", "hey", null, 20) } returns page("fresh")
        r.controller.onQuery("he")
        r.scope.advanceTimeBy(300)
        r.scope.runCurrent()

        r.controller.onQuery("hey")
        slow.complete(page("stale"))
        r.scope.advanceUntilIdle()

        assertThat(r.state.results.map { it.id }).containsExactly("fresh")
    }

    @Test
    fun `typing quickly only asks for the last query`() {
        val r = rig()
        coEvery { r.repo.searchMessages(any(), any(), any(), any()) } returns page("m1")

        r.controller.onQuery("he")
        r.scope.advanceTimeBy(100)
        r.controller.onQuery("hel")
        r.scope.advanceUntilIdle()

        coVerify(exactly = 0) { r.repo.searchMessages("c1", "he", any(), any()) }
        coVerify(exactly = 1) { r.repo.searchMessages("c1", "hel", null, 20) }
    }

    @Test
    fun `a content hit is typed content, a translation hit is typed translation with its text`() {
        val r = rig()
        val bonjour = ApiTextTranslation(targetLanguage = "fr", translatedContent = "bonjour tout le monde")
        coEvery { r.repo.searchMessages("c1", "bonjour", null, 20) } returns MessageSearchPage(
            listOf(hit("m1", content = "Bonjour"), hit("m2", content = "hello all", translations = listOf(bonjour))), null, false,
        )

        r.controller.onQuery("bonjour")
        r.scope.advanceUntilIdle()

        assertThat(r.state.results.map { it.matchType }).containsExactly(SearchMatchType.CONTENT, SearchMatchType.TRANSLATION).inOrder()
        assertThat(r.state.results[1].matchedText).isEqualTo("bonjour tout le monde")
    }

    @Test
    fun `a server error offers a retry that replays the query`() {
        val r = rig()
        coEvery { r.repo.searchMessages("c1", "he", null, 20) } throws MessageSearchException("boom", unreachable = false)
        r.controller.onQuery("he")
        r.scope.advanceUntilIdle()
        assertThat(r.state.failed).isTrue()

        coEvery { r.repo.searchMessages("c1", "he", null, 20) } returns page("m1")
        r.controller.retry()
        r.scope.advanceUntilIdle()

        assertThat(r.state.failed).isFalse()
        assertThat(r.state.results.map { it.id }).containsExactly("m1")
    }

    @Test
    fun `offline the local matches are served without any error`() {
        val bubble = BubbleContent(
            messageId = "local1", text = "hello there", isOutgoing = false, isTranslated = false, originalText = null,
            senderName = "Ada", showSenderName = false, isEdited = false, isDeleted = false, createdAtIso = null,
        )
        val ui = ChatUiState(conversationId = "c1", messages = listOf(bubble), search = ChatSearchState(isActive = true, query = "hello", matchIds = listOf("local1")))
        val r = rig(ui)
        coEvery { r.repo.searchMessages(any(), any(), any(), any()) } throws MessageSearchException("down", unreachable = true)

        r.controller.onQuery("hello")
        r.scope.advanceUntilIdle()

        assertThat(r.state.isOffline).isTrue()
        assertThat(r.state.failed).isFalse()
        assertThat(r.state.results.map { it.id }).containsExactly("local1")
        assertThat(r.state.results.single().senderName).isEqualTo("Ada")
    }

    @Test
    fun `an empty answer shows the empty state and closing the panel keeps the query`() {
        val r = rig()
        coEvery { r.repo.searchMessages("c1", "zz", null, 20) } returns MessageSearchPage.EMPTY
        r.controller.onQuery("zz")
        r.scope.advanceUntilIdle()
        assertThat(r.state.showsEmpty).isTrue()

        r.controller.closePanel()

        assertThat(r.state.panelOpen).isFalse()
        assertThat(r.state.query).isEqualTo("zz")
    }
}
