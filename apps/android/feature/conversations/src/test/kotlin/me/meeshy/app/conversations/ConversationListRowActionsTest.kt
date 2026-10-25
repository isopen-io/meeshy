package me.meeshy.app.conversations

import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.category.CategoryRepository
import me.meeshy.sdk.chat.InMemoryConversationDraftStore
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationPreferences
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConversationListRowActionsTest {

    private class Harness(
        val actions: ConversationListRowActions,
        val state: MutableStateFlow<ConversationListUiState>,
        val repo: ConversationRepository,
        val workManager: WorkManager,
    )

    private fun TestScope.harness(vararg conversations: ApiConversation, active: String? = null): Harness {
        val repo = mockk<ConversationRepository>(relaxed = true)
        val workManager = mockk<WorkManager>(relaxed = true)
        val state = MutableStateFlow(ConversationListUiState(conversations = conversations.toList()))
        val actions = ConversationListRowActions(
            scope = backgroundScope,
            state = state,
            rawConversations = { conversations.toList() },
            repository = repo,
            messageRepository = mockk<MessageRepository>(relaxed = true),
            categoryRepository = mockk<CategoryRepository>(relaxed = true),
            draftStore = InMemoryConversationDraftStore(),
            workManager = workManager,
            activeConversationId = { active },
        )
        return Harness(actions, state, repo, workManager)
    }

    @Test
    fun `a queued optimistic mutation wakes the outbox flush`() = runTest(StandardTestDispatcher()) {
        val h = harness(ApiConversation(id = "c1"))
        coEvery { h.repo.setPinnedOptimistic("c1", true) } returns true

        h.actions.togglePin("c1")
        runCurrent()

        coVerify { h.repo.setPinnedOptimistic("c1", true) }
        verify(exactly = 1) { h.workManager.enqueue(any<androidx.work.WorkRequest>()) }
    }

    @Test
    fun `a no-op mutation never wakes WorkManager`() = runTest(StandardTestDispatcher()) {
        val h = harness(ApiConversation(id = "c1"))
        coEvery { h.repo.setPinnedOptimistic("c1", true) } returns false

        h.actions.togglePin("c1")
        runCurrent()

        verify(exactly = 0) { h.workManager.enqueue(any<androidx.work.WorkRequest>()) }
    }

    @Test
    fun `a failing mutation surfaces its error and wakes nothing`() = runTest(StandardTestDispatcher()) {
        val h = harness(ApiConversation(id = "c1"))
        coEvery { h.repo.setMutedOptimistic("c1", true) } throws IllegalStateException("rolled back")

        h.actions.toggleMute("c1")
        runCurrent()

        assertThat(h.state.value.errorMessage).isEqualTo("rolled back")
        verify(exactly = 0) { h.workManager.enqueue(any<androidx.work.WorkRequest>()) }
    }

    @Test
    fun `mark unread goes through the optimistic repository path`() = runTest(StandardTestDispatcher()) {
        val h = harness(ApiConversation(id = "c1"))
        coEvery { h.repo.markUnreadOptimistic("c1") } returns true

        h.actions.markUnread("c1")
        runCurrent()

        coVerify { h.repo.markUnreadOptimistic("c1") }
        verify(exactly = 1) { h.workManager.enqueue(any<androidx.work.WorkRequest>()) }
    }

    @Test
    fun `reassigning to the current category is inert`() = runTest(StandardTestDispatcher()) {
        val h = harness(
            ApiConversation(id = "c1", preferences = ApiConversationPreferences(categoryId = "work")),
        )

        h.actions.reassignCategory("c1", "work")
        runCurrent()

        coVerify(exactly = 0) { h.repo.setCategoryOptimistic(any(), any()) }
    }

    @Test
    fun `reassigning to an absent category still writes optimistically`() = runTest(StandardTestDispatcher()) {
        val h = harness(
            ApiConversation(id = "c1", preferences = ApiConversationPreferences(categoryId = "work")),
        )
        coEvery { h.repo.setCategoryOptimistic("c1", "ghost") } returns true

        h.actions.reassignCategory("c1", "ghost")
        runCurrent()

        coVerify { h.repo.setCategoryOptimistic("c1", "ghost") }
    }

    @Test
    fun `mark read on the open conversation clears the cache locally and never reaches the network`() =
        runTest(StandardTestDispatcher()) {
            val h = harness(ApiConversation(id = "c1", unreadCount = 3), active = "c1")

            h.actions.markRead("c1")
            runCurrent()

            coVerify { h.repo.markReadLocally("c1") }
            coVerify(exactly = 0) { h.repo.markReadOptimistic(any()) }
            verify(exactly = 0) { h.workManager.enqueue(any<androidx.work.WorkRequest>()) }
        }

    @Test
    fun `mark read on another conversation goes through the outbox`() = runTest(StandardTestDispatcher()) {
        val h = harness(ApiConversation(id = "c1", unreadCount = 3), active = "c2")
        coEvery { h.repo.markReadOptimistic("c1") } returns true

        h.actions.markRead("c1")
        runCurrent()

        coVerify { h.repo.markReadOptimistic("c1") }
        coVerify(exactly = 0) { h.repo.markReadLocally(any()) }
        verify(exactly = 1) { h.workManager.enqueue(any<androidx.work.WorkRequest>()) }
    }

    @Test
    fun `mark read clears the badge at once, sections included`() = runTest(StandardTestDispatcher()) {
        val pinned = ApiConversation(id = "c1", unreadCount = 3, preferences = ApiConversationPreferences(isPinned = true))
        val other = ApiConversation(id = "c2", unreadCount = 2)
        val h = harness(pinned, other)

        h.actions.markRead("c1")

        val sections = ConversationSections.of(h.state.value.conversations, emptyList())
        val unreadById = sections.flatMap { it.items }.associate { it.id to it.unreadCount }
        assertThat(unreadById).containsExactly("c1", 0, "c2", 2)
    }

    @Test
    fun `archive sets the archived preference without toggling`() = runTest(StandardTestDispatcher()) {
        val h = harness(ApiConversation(id = "c1", preferences = ApiConversationPreferences(isArchived = true)))

        h.actions.archive("c1")
        runCurrent()

        coVerify { h.repo.setArchivedOptimistic("c1", true) }
    }
}
