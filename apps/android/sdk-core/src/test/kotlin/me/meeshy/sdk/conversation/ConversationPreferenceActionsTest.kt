package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.category.CategoryRepository
import me.meeshy.sdk.model.CategoryOption
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test

/**
 * The single writer of the per-user conversation preferences (#13777), shared by the list menu
 * and the Options of the conversation info: optimistic cache write, outbox snapshot, flusher woken
 * only when something was queued, failures reported instead of thrown.
 */
class ConversationPreferenceActionsTest {

    private class Harness(
        val actions: ConversationPreferenceActions,
        val repository: ConversationRepository,
        val categories: CategoryRepository,
        val flushes: () -> Int,
    )

    private fun harness(): Harness {
        val repository = mockk<ConversationRepository>(relaxed = true)
        val categories = mockk<CategoryRepository>(relaxed = true)
        var flushes = 0
        val actions = ConversationPreferenceActions(repository, categories) { flushes++ }
        return Harness(actions, repository, categories) { flushes }
    }

    @Test
    fun `a queued write wakes the flusher once`() = runTest {
        val h = harness()
        coEvery { h.repository.setPinnedOptimistic("c1", true) } returns true

        val outcome = h.actions.setPinned("c1", true)

        assertThat(outcome).isEqualTo(PreferenceWrite.Queued)
        assertThat(h.flushes()).isEqualTo(1)
    }

    @Test
    fun `a write that changes nothing wakes nothing`() = runTest {
        val h = harness()
        coEvery { h.repository.setMutedOptimistic("c1", false) } returns false

        assertThat(h.actions.setMuted("c1", false)).isEqualTo(PreferenceWrite.Unchanged)
        assertThat(h.flushes()).isEqualTo(0)
    }

    @Test
    fun `a write that throws is reported as a failure`() = runTest {
        val h = harness()
        coEvery { h.repository.setArchivedOptimistic("c1", true) } throws IllegalStateException("disk")

        assertThat(h.actions.setArchived("c1", true)).isEqualTo(PreferenceWrite.Failed("disk"))
        assertThat(h.flushes()).isEqualTo(0)
    }

    @Test
    fun `every preference goes through its optimistic repository writer`() = runTest {
        val h = harness()

        h.actions.setMentionsOnly("c1", true)
        h.actions.setCustomName("c1", "Famille")
        h.actions.setReaction("c1", "🔥")
        h.actions.setTags("c1", listOf("work"))

        coVerify { h.repository.setMentionsOnlyOptimistic("c1", true) }
        coVerify { h.repository.setCustomNameOptimistic("c1", "Famille") }
        coVerify { h.repository.setReactionOptimistic("c1", "🔥") }
        coVerify { h.repository.setTagsOptimistic("c1", listOf("work")) }
    }

    @Test
    fun `assigning the category the conversation already sits in writes nothing`() = runTest {
        val h = harness()

        assertThat(h.actions.assignCategory("c1", currentCategoryId = "cat", targetCategoryId = "cat"))
            .isEqualTo(PreferenceWrite.Unchanged)
        coVerify(exactly = 0) { h.repository.setCategoryOptimistic(any(), any()) }
    }

    @Test
    fun `assigning another category writes it`() = runTest {
        val h = harness()
        coEvery { h.repository.setCategoryOptimistic("c1", "cat-2") } returns true

        assertThat(h.actions.assignCategory("c1", currentCategoryId = "cat", targetCategoryId = "cat-2"))
            .isEqualTo(PreferenceWrite.Queued)
    }

    @Test
    fun `creating a category then assigns the conversation to it`() = runTest {
        val h = harness()
        coEvery { h.categories.create("Amis") } returns NetworkResult.Success(CategoryOption(id = "new", name = "Amis"))
        coEvery { h.repository.setCategoryOptimistic("c1", "new") } returns true

        val outcome = h.actions.createCategoryAndAssign("c1", currentCategoryId = null, name = " Amis ")

        assertThat(outcome).isEqualTo(CategoryCreation.Assigned(CategoryOption(id = "new", name = "Amis"), PreferenceWrite.Queued))
    }

    @Test
    fun `a blank category name is inert and a refused creation is reported`() = runTest {
        val h = harness()
        coEvery { h.categories.create("Amis") } returns NetworkResult.Failure(ApiError(message = "taken"))

        assertThat(h.actions.createCategoryAndAssign("c1", null, "  ")).isEqualTo(CategoryCreation.Ignored)
        assertThat(h.actions.createCategoryAndAssign("c1", null, "Amis")).isEqualTo(CategoryCreation.Failed("taken"))
        coVerify(exactly = 0) { h.repository.setCategoryOptimistic(any(), any()) }
    }
}
