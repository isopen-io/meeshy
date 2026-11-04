package me.meeshy.app.conversations

import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.category.CategoryRepository
import me.meeshy.sdk.chat.InMemoryConversationDraftStore
import me.meeshy.sdk.conversation.ConversationRemoval
import me.meeshy.sdk.conversation.ConversationRemovalWrite
import me.meeshy.sdk.conversation.ConversationRemoving
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.model.ApiConversation
import org.junit.Test

/**
 * Quitter ou supprimer une conversation hors ligne (#15920) : la rangée tombe dans l'image du geste, y compris tant que la
 * requête attend le réseau ; un refus définitif la rend ; rien ne part directement vers la passerelle.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ConversationLeaveOfflineTest {

    private val rows = listOf(ApiConversation(id = "c1", title = "Équipe"), ApiConversation(id = "c2", title = "Autre"))

    private fun TestScope.actions(state: MutableStateFlow<ConversationListUiState>, remover: ConversationRemoving) =
        ConversationListRowActions(
            scope = backgroundScope,
            state = state,
            rawConversations = { rows },
            repository = mockk<ConversationRepository>(relaxed = true),
            messageRepository = mockk<MessageRepository>(relaxed = true),
            categoryRepository = mockk<CategoryRepository>(relaxed = true),
            draftStore = InMemoryConversationDraftStore(),
            workManager = mockk<WorkManager>(relaxed = true),
            remover = remover,
        )

    private fun listState() = MutableStateFlow(ConversationListUiState(conversations = rows))

    @Test
    fun `leaving drops the row at once and the request waits in the queue`() = runTest(StandardTestDispatcher()) {
        val state = listState()
        val remover = FakeConversationRemover()

        actions(state, remover).leaveConversation("c1")

        assertThat(state.value.conversations.map { it.id }).containsExactly("c2")
        runCurrent()
        assertThat(remover.calls).containsExactly("c1" to ConversationRemoval.LEAVE)
        assertThat(state.value.conversations.map { it.id }).containsExactly("c2")
        assertThat(state.value.errorMessage).isNull()
    }

    @Test
    fun `the row is gone before the queue even answers`() = runTest(StandardTestDispatcher()) {
        val state = listState()
        val answer = CompletableDeferred<ConversationRemovalWrite>()
        val slow = object : ConversationRemoving {
            override suspend fun remove(conversationId: String, removal: ConversationRemoval) = answer.await()
        }

        actions(state, slow).deleteConversationForAll("c1")

        assertThat(state.value.conversations.map { it.id }).containsExactly("c2")
        answer.complete(ConversationRemovalWrite.Queued)
        runCurrent()
        assertThat(state.value.conversations.map { it.id }).containsExactly("c2")
    }

    @Test
    fun `a queue that cannot take the gesture gives the row back and warns`() = runTest(StandardTestDispatcher()) {
        val state = listState()
        var warned = 0
        val remover = FakeConversationRemover(ConversationRemovalWrite.Failed("full"))

        actions(state, remover).leaveConversation("c1") { warned++ }
        runCurrent()

        assertThat(state.value.conversations.map { it.id }).containsExactly("c1", "c2")
        assertThat(state.value.errorMessage).isEqualTo("full")
        assertThat(warned).isEqualTo(1)
    }

    @Test
    fun `a row the queue restored after a refusal shows in the list again`() = runTest(StandardTestDispatcher()) {
        val state = listState()
        actions(state, FakeConversationRemover()).deleteConversationForMe("c1")
        runCurrent()

        val withoutRow = state.value.withVisible(listOf(ApiConversation(id = "c2")))
        val restored = withoutRow.withVisible(rows)

        assertThat(withoutRow.conversations.map { it.id }).containsExactly("c2")
        assertThat(restored.conversations.map { it.id }).containsExactly("c1", "c2")
    }

    @Test
    fun `each removal goes to the queue as its own kind`() = runTest(StandardTestDispatcher()) {
        val state = listState()
        val remover = FakeConversationRemover()
        val actions = actions(state, remover)

        actions.leaveConversation("c1")
        actions.deleteConversationForMe("c2")
        actions.deleteConversationForAll("c3")
        runCurrent()

        assertThat(remover.calls).containsExactly(
            "c1" to ConversationRemoval.LEAVE,
            "c2" to ConversationRemoval.DELETE_FOR_ME,
            "c3" to ConversationRemoval.DELETE_FOR_ALL,
        ).inOrder()
    }
}
