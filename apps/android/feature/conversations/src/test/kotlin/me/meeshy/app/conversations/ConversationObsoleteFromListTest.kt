package me.meeshy.app.conversations

import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.category.CategoryRepository
import me.meeshy.sdk.chat.InMemoryConversationDraftStore
import me.meeshy.sdk.chat.InMemoryStarredMessagesStore
import me.meeshy.sdk.conversation.ConversationLivePatcher
import me.meeshy.sdk.conversation.ConversationObsoleting
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ConversationObsoleted
import me.meeshy.sdk.model.ConversationObsoletedSocketEvent
import me.meeshy.sdk.model.UserPreferencesConversationUpdatedSocketData
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.PreferencesSocketManager
import org.junit.Test

/**
 * « Rendre obsolète » depuis la liste (#14645) : la rangée tombe dans l'image du geste, un refus la rend
 * avec son message ; `conversation:obsoleted` retire la ligne et son cache chez tous.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ConversationObsoleteFromListTest {

    private val rows = listOf(ApiConversation(id = "c1", title = "Équipe"), ApiConversation(id = "c2", title = "Autre"))

    private fun TestScope.actions(
        state: MutableStateFlow<ConversationListUiState>,
        obsoleter: ConversationObsoleting,
    ) = ConversationListRowActions(
        scope = backgroundScope,
        state = state,
        rawConversations = { rows },
        repository = mockk<ConversationRepository>(relaxed = true),
        messageRepository = mockk<MessageRepository>(relaxed = true),
        categoryRepository = mockk<CategoryRepository>(relaxed = true),
        draftStore = InMemoryConversationDraftStore(),
        workManager = mockk<WorkManager>(relaxed = true),
        obsoleter = obsoleter,
    )

    @Test
    fun `the row leaves the list at once, before the gateway answers`() = runTest(StandardTestDispatcher()) {
        val state = MutableStateFlow(ConversationListUiState(conversations = rows))
        val answer = CompletableDeferred<NetworkResult<ConversationObsoleted>>()
        val actions = actions(state) { answer.await() }

        actions.makeConversationObsolete("c1")

        assertThat(state.value.conversations.map { it.id }).containsExactly("c2")
        answer.complete(NetworkResult.Success(ConversationObsoleted("c1")))
        runCurrent()
        assertThat(state.value.conversations.map { it.id }).containsExactly("c2")
        assertThat(state.value.errorMessage).isNull()
    }

    @Test
    fun `a refusal brings the row back and says why`() = runTest(StandardTestDispatcher()) {
        val state = MutableStateFlow(ConversationListUiState(conversations = rows))
        val actions = actions(state) { NetworkResult.Failure(ApiError(message = "Admin role required")) }

        actions.makeConversationObsolete("c1")
        runCurrent()

        assertThat(state.value.conversations.map { it.id }).containsExactly("c1", "c2")
        assertThat(state.value.pendingRemovals).isEmpty()
        assertThat(state.value.errorMessage).isEqualTo("Admin role required")
    }

    @Test
    fun `an obsoleted frame removes the row and its cache, a blank one is inert`() = runTest(StandardTestDispatcher()) {
        val obsoleted = MutableSharedFlow<ConversationObsoletedSocketEvent>(extraBufferCapacity = 8)
        val patcher = mockk<ConversationLivePatcher>(relaxed = true)
        ConversationListRealtimeBinder(
            scope = backgroundScope,
            repository = mockk(relaxed = true),
            messageSocketManager = mockk<MessageSocketManager> {
                every { messageReceived } returns MutableSharedFlow()
                every { messageEdited } returns MutableSharedFlow()
                every { messageDeleted } returns MutableSharedFlow()
                every { conversationUpdated } returns MutableSharedFlow()
                every { unreadUpdated } returns MutableSharedFlow()
                every { conversationRestored } returns MutableSharedFlow()
                every { conversationDeleted } returns MutableSharedFlow()
                every { conversationClosed } returns MutableSharedFlow()
                every { conversationObsoleted } returns obsoleted
                every { participantLeft } returns MutableSharedFlow()
                every { participantBanned } returns MutableSharedFlow()
                every { participantJoined } returns MutableSharedFlow()
                every { participantUnbanned } returns MutableSharedFlow()
            },
            preferencesSocketManager = mockk<PreferencesSocketManager> {
                every { conversationPreferencesUpdated } returns MutableSharedFlow<UserPreferencesConversationUpdatedSocketData>()
            },
            starredStore = InMemoryStarredMessagesStore(),
            currentUserId = { "me" },
            patcher = patcher,
        ).start()
        runCurrent()

        obsoleted.emit(ConversationObsoletedSocketEvent(conversationId = "c1", obsoletedBy = "admin"))
        obsoleted.emit(ConversationObsoletedSocketEvent(conversationId = " "))
        runCurrent()

        io.mockk.coVerify(exactly = 1) { patcher.remove("c1") }
        io.mockk.coVerify(exactly = 0) { patcher.remove(" ") }
    }
}
