package me.meeshy.sdk.model.conversationoptions

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.CategoryOption
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

    @Test
    fun `removing the category of a categorized conversation clears it`() {
        val outcome = ConversationCategoryReassignment.resolve(
            currentCategoryId = "work",
            targetCategoryId = null,
        )

        assertThat(outcome).isEqualTo(CategoryReassignment.Clear)
    }

    @Test
    fun `removing the category of an uncategorized conversation is a no-op`() {
        val outcome = ConversationCategoryReassignment.resolve(
            currentCategoryId = null,
            targetCategoryId = null,
        )

        assertThat(outcome).isEqualTo(CategoryReassignment.Unchanged)
    }

    private val categories = listOf(
        CategoryOption(id = "family", name = "Famille", order = 2),
        CategoryOption(id = "work", name = "Travail", order = 1),
    )

    @Test
    fun `the move menu ticks the current category and lists my conversations last`() {
        val targets = ConversationMoveMenu.targets(categories, currentCategoryId = "family")

        assertThat(targets.map { it.categoryId }).containsExactly("work", "family", null).inOrder()
        assertThat(targets.filter { it.isCurrent }.map { it.categoryId }).containsExactly("family")
    }

    @Test
    fun `my conversations is ticked when the conversation sits in no category`() {
        val targets = ConversationMoveMenu.targets(categories, currentCategoryId = null)

        assertThat(targets.filter { it.isCurrent }.map { it.categoryId }).containsExactly(null)
    }

    @Test
    fun `touching the current category takes the conversation out of it`() {
        val current = ConversationMoveMenu.targets(categories, "family").first { it.categoryId == "family" }

        assertThat(ConversationMoveMenu.reassignment("family", current)).isEqualTo(CategoryReassignment.Clear)
    }

    @Test
    fun `touching my conversations clears the category and is inert from nowhere`() {
        val mine = ConversationMoveMenu.targets(categories, "family").last()
        val mineFromNowhere = ConversationMoveMenu.targets(categories, null).last()

        assertThat(ConversationMoveMenu.reassignment("family", mine)).isEqualTo(CategoryReassignment.Clear)
        assertThat(ConversationMoveMenu.reassignment(null, mineFromNowhere)).isEqualTo(CategoryReassignment.Unchanged)
    }

    @Test
    fun `touching another category assigns it`() {
        val work = ConversationMoveMenu.targets(categories, "family").first { it.categoryId == "work" }

        assertThat(ConversationMoveMenu.reassignment("family", work)).isEqualTo(CategoryReassignment.AssignTo("work"))
    }
}
