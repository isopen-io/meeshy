package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of the conversation category-picker decision core — a
 * faithful port of the pure logic embedded in iOS `CategoryPickerField`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Primitives/CategoryPickerField.swift`):
 * `displayedCategories` (pool minus the selected id, sorted by order, filtered by
 * the trimmed query), `canCreate`, and `submit()` (select an exact match else
 * create). Expectations are hand-written literals, never derived from the code
 * under test.
 */
class ConversationCategoryPickerTest {

    private fun cat(id: String, name: String, order: Int? = null) =
        CategoryOption(id = id, name = name, order = order)

    // --- displayed: empty query ---------------------------------------------

    @Test
    fun `empty query shows every category sorted by order`() {
        val state = ConversationCategoryPicker.resolve(
            categories = listOf(cat("b", "Work", order = 2), cat("a", "Family", order = 1)),
            selectedId = null,
            query = "",
        )
        assertThat(state.displayed.map { it.id }).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `empty query excludes the currently-selected category from the pool`() {
        val state = ConversationCategoryPicker.resolve(
            categories = listOf(cat("a", "Family", order = 1), cat("b", "Work", order = 2)),
            selectedId = "a",
            query = "",
        )
        assertThat(state.displayed.map { it.id }).containsExactly("b").inOrder()
    }

    @Test
    fun `a null order sorts as zero, ahead of positive orders`() {
        val state = ConversationCategoryPicker.resolve(
            categories = listOf(cat("a", "Work", order = 5), cat("b", "Family", order = null)),
            selectedId = null,
            query = "",
        )
        assertThat(state.displayed.map { it.id }).containsExactly("b", "a").inOrder()
    }

    @Test
    fun `categories with equal order keep their input order`() {
        val state = ConversationCategoryPicker.resolve(
            categories = listOf(cat("a", "Alpha", order = 1), cat("b", "Bravo", order = 1)),
            selectedId = null,
            query = "",
        )
        assertThat(state.displayed.map { it.id }).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `an unknown selected id excludes nothing`() {
        val state = ConversationCategoryPicker.resolve(
            categories = listOf(cat("a", "Family"), cat("b", "Work")),
            selectedId = "ghost",
            query = "",
        )
        assertThat(state.displayed.map { it.id }).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `an empty catalogue shows nothing`() {
        val state = ConversationCategoryPicker.resolve(
            categories = emptyList(),
            selectedId = null,
            query = "",
        )
        assertThat(state.displayed).isEmpty()
    }

    @Test
    fun `a blank whitespace query behaves like an empty query`() {
        val state = ConversationCategoryPicker.resolve(
            categories = listOf(cat("a", "Family", order = 1), cat("b", "Work", order = 2)),
            selectedId = null,
            query = "   ",
        )
        assertThat(state.displayed.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(state.canCreate).isFalse()
    }

    // --- displayed: filtered ------------------------------------------------

    @Test
    fun `query filters the pool case-insensitively by substring, still sorted`() {
        val state = ConversationCategoryPicker.resolve(
            categories = listOf(
                cat("a", "Homework", order = 3),
                cat("b", "Work", order = 1),
                cat("c", "Family", order = 2),
            ),
            selectedId = null,
            query = "work",
        )
        assertThat(state.displayed.map { it.id }).containsExactly("b", "a").inOrder()
    }

    @Test
    fun `a query with no substring match shows nothing`() {
        val state = ConversationCategoryPicker.resolve(
            categories = listOf(cat("a", "Family"), cat("b", "Work")),
            selectedId = null,
            query = "zzz",
        )
        assertThat(state.displayed).isEmpty()
    }

    @Test
    fun `the filtered pool also excludes the selected category`() {
        val state = ConversationCategoryPicker.resolve(
            categories = listOf(
                cat("a", "Work", order = 1),
                cat("b", "Homework", order = 2),
                cat("c", "Network", order = 3),
            ),
            selectedId = "b",
            query = "work",
        )
        assertThat(state.displayed.map { it.id }).containsExactly("a", "c").inOrder()
    }

    @Test
    fun `the query is trimmed before filtering`() {
        val state = ConversationCategoryPicker.resolve(
            categories = listOf(cat("a", "Urgent"), cat("b", "Family")),
            selectedId = null,
            query = "  urg  ",
        )
        assertThat(state.displayed.map { it.id }).containsExactly("a").inOrder()
    }

    // --- canCreate ----------------------------------------------------------

    @Test
    fun `canCreate is true for a brand-new name`() {
        val state = ConversationCategoryPicker.resolve(
            categories = listOf(cat("a", "Work")),
            selectedId = null,
            query = "Urgent",
        )
        assertThat(state.canCreate).isTrue()
    }

    @Test
    fun `canCreate is false when the name matches a known category case-insensitively`() {
        val state = ConversationCategoryPicker.resolve(
            categories = listOf(cat("a", "Work")),
            selectedId = null,
            query = "work",
        )
        assertThat(state.canCreate).isFalse()
    }

    @Test
    fun `canCreate is false when the name matches the selected category case-insensitively`() {
        val state = ConversationCategoryPicker.resolve(
            categories = listOf(cat("a", "Urgent")),
            selectedId = "a",
            query = "urgent",
        )
        assertThat(state.canCreate).isFalse()
    }

    @Test
    fun `canCreate is false for a blank query`() {
        val state = ConversationCategoryPicker.resolve(
            categories = emptyList(),
            selectedId = null,
            query = "   ",
        )
        assertThat(state.canCreate).isFalse()
    }

    // --- submit -------------------------------------------------------------

    @Test
    fun `submit selects an existing category on an exact case-insensitive name match`() {
        val state = ConversationCategoryPicker.resolve(
            categories = listOf(cat("a", "Work"), cat("b", "Family")),
            selectedId = null,
            query = "  work  ",
        )
        assertThat(state.submit).isEqualTo(CategorySubmit.Select("a"))
    }

    @Test
    fun `submit selects the first exact match when names collide`() {
        val state = ConversationCategoryPicker.resolve(
            categories = listOf(cat("a", "Work"), cat("b", "work")),
            selectedId = null,
            query = "WORK",
        )
        assertThat(state.submit).isEqualTo(CategorySubmit.Select("a"))
    }

    @Test
    fun `submit creates a new category when no name matches`() {
        val state = ConversationCategoryPicker.resolve(
            categories = listOf(cat("a", "Family")),
            selectedId = null,
            query = "  Urgent  ",
        )
        assertThat(state.submit).isEqualTo(CategorySubmit.Create("Urgent"))
    }

    @Test
    fun `submit is inert for a blank query`() {
        val state = ConversationCategoryPicker.resolve(
            categories = listOf(cat("a", "Family")),
            selectedId = null,
            query = "   ",
        )
        assertThat(state.submit).isEqualTo(CategorySubmit.None)
    }

    @Test
    fun `submit re-selects the already-selected category when the query is its name`() {
        val state = ConversationCategoryPicker.resolve(
            categories = listOf(cat("a", "Urgent")),
            selectedId = "a",
            query = "urgent",
        )
        assertThat(state.submit).isEqualTo(CategorySubmit.Select("a"))
    }

    @Test
    fun `submit creates on a non-empty catalogue with no match`() {
        val state = ConversationCategoryPicker.resolve(
            categories = emptyList(),
            selectedId = null,
            query = "Fresh",
        )
        assertThat(state.submit).isEqualTo(CategorySubmit.Create("Fresh"))
    }
}
