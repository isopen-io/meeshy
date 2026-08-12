package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Drag-to-category reassignment decision (parity §B, iOS
 * `ConversationOptionsViewModel.setCategory`). Behaviour asserted through the pure
 * [ConversationCategoryReassignment.resolve] SSOT: assigning an uncategorized row,
 * moving between categories, and the idempotent no-op that must never fire a
 * wasted network write when the row is already in the target category.
 */
class ConversationCategoryReassignmentTest {

    @Test
    fun `assigning an uncategorized conversation targets the category`() {
        val outcome = ConversationCategoryReassignment.resolve(
            currentCategoryId = null,
            targetCategoryId = "work",
        )

        assertThat(outcome).isEqualTo(CategoryReassignment.AssignTo("work"))
    }

    @Test
    fun `moving a conversation to a different category reassigns it`() {
        val outcome = ConversationCategoryReassignment.resolve(
            currentCategoryId = "work",
            targetCategoryId = "family",
        )

        assertThat(outcome).isEqualTo(CategoryReassignment.AssignTo("family"))
    }

    @Test
    fun `dropping a conversation on the category it already belongs to is a no-op`() {
        val outcome = ConversationCategoryReassignment.resolve(
            currentCategoryId = "work",
            targetCategoryId = "work",
        )

        assertThat(outcome).isEqualTo(CategoryReassignment.Unchanged)
    }
}
