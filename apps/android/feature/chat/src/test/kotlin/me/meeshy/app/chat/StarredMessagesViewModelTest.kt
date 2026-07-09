package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.chat.InMemoryStarredMessagesStore
import me.meeshy.sdk.model.StarredAttachmentKind
import me.meeshy.sdk.model.StarredMessage
import me.meeshy.sdk.model.StarredMessages
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class StarredMessagesViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun snapshot(
        id: String,
        conversationId: String = "c1",
        preview: String = "hello",
        kind: StarredAttachmentKind? = null,
        starredAtMillis: Long = 0L,
    ) = StarredMessage(
        messageId = id,
        conversationId = conversationId,
        contentPreview = preview,
        attachmentKind = kind,
        starredAtMillis = starredAtMillis,
    )

    // --- Pure UI-state projection -------------------------------------------------

    @Test
    fun `of orders rows newest-star first`() {
        val state = StarredMessagesUiState.of(
            StarredMessages(
                listOf(
                    snapshot("a", starredAtMillis = 10),
                    snapshot("b", starredAtMillis = 30),
                    snapshot("c", starredAtMillis = 20),
                ),
            ),
        )

        assertThat(state.rows.map { it.message.messageId })
            .containsExactly("b", "c", "a").inOrder()
        assertThat(state.isEmpty).isFalse()
    }

    @Test
    fun `of on an empty set yields an empty state`() {
        val state = StarredMessagesUiState.of(StarredMessages())

        assertThat(state.rows).isEmpty()
        assertThat(state.isEmpty).isTrue()
    }

    @Test
    fun `of projects a text message to a Text snippet`() {
        val state = StarredMessagesUiState.of(StarredMessages(listOf(snapshot("a", preview = "  bonjour  "))))

        assertThat(state.rows.single().snippet).isEqualTo(PinnedSnippet.Text("bonjour"))
    }

    @Test
    fun `of projects an image-only star to an Image snippet`() {
        val state = StarredMessagesUiState.of(
            StarredMessages(listOf(snapshot("a", preview = "", kind = StarredAttachmentKind.IMAGE))),
        )

        assertThat(state.rows.single().snippet).isEqualTo(PinnedSnippet.Image)
    }

    @Test
    fun `of projects a file-only star to a File snippet`() {
        val state = StarredMessagesUiState.of(
            StarredMessages(listOf(snapshot("a", preview = "", kind = StarredAttachmentKind.FILE))),
        )

        assertThat(state.rows.single().snippet).isEqualTo(PinnedSnippet.File)
    }

    @Test
    fun `of keeps text over an attachment badge when both are present`() {
        val state = StarredMessagesUiState.of(
            StarredMessages(listOf(snapshot("a", preview = "caption", kind = StarredAttachmentKind.IMAGE))),
        )

        assertThat(state.rows.single().snippet).isEqualTo(PinnedSnippet.Text("caption"))
    }

    @Test
    fun `of projects a blank text with no attachment to an Empty snippet`() {
        val state = StarredMessagesUiState.of(StarredMessages(listOf(snapshot("a", preview = "   "))))

        assertThat(state.rows.single().snippet).isEqualTo(PinnedSnippet.Empty)
    }

    // --- ViewModel behaviour ------------------------------------------------------

    @Test
    fun `initial state is hydrated from the store synchronously`() = runTest(dispatcher) {
        val store = InMemoryStarredMessagesStore(
            StarredMessages(listOf(snapshot("a", starredAtMillis = 1), snapshot("b", starredAtMillis = 2))),
        )
        val vm = StarredMessagesViewModel(store)

        assertThat(vm.state.value.rows.map { it.message.messageId })
            .containsExactly("b", "a").inOrder()
    }

    @Test
    fun `state reacts when the store gains a star`() = runTest(dispatcher) {
        val store = InMemoryStarredMessagesStore()
        val vm = StarredMessagesViewModel(store)
        assertThat(vm.state.value.isEmpty).isTrue()

        store.toggle(snapshot("a", starredAtMillis = 5))

        assertThat(vm.state.value.rows.map { it.message.messageId }).containsExactly("a")
    }

    @Test
    fun `unstar removes the row via the store`() = runTest(dispatcher) {
        val store = InMemoryStarredMessagesStore(
            StarredMessages(listOf(snapshot("a", starredAtMillis = 1), snapshot("b", starredAtMillis = 2))),
        )
        val vm = StarredMessagesViewModel(store)

        vm.unstar("a")

        assertThat(store.starred.value.isStarred("a")).isFalse()
        assertThat(vm.state.value.rows.map { it.message.messageId }).containsExactly("b")
    }

    @Test
    fun `unstar of an unknown id is inert`() = runTest(dispatcher) {
        val store = InMemoryStarredMessagesStore(StarredMessages(listOf(snapshot("a", starredAtMillis = 1))))
        val vm = StarredMessagesViewModel(store)

        vm.unstar("nope")

        assertThat(vm.state.value.rows.map { it.message.messageId }).containsExactly("a")
    }
}
