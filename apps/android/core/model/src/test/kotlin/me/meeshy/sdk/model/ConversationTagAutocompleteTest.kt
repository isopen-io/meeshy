package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of the conversation tag-autocomplete decision core — a
 * faithful port of the pure logic scattered inside iOS `TagInputField`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Primitives/TagInputField.swift`):
 * `suggestions`, `canCreate`, `submit()` and `addTag()`. Expectations are
 * hand-written literals, never derived from the code under test.
 */
class ConversationTagAutocompleteTest {

    // --- suggestions: empty query -------------------------------------------

    @Test
    fun `empty query returns the whole pool in order`() {
        val state = ConversationTagAutocomplete.resolve(
            knownTags = listOf("work", "family", "urgent"),
            selectedTags = emptyList(),
            query = "",
        )
        assertThat(state.suggestions).containsExactly("work", "family", "urgent").inOrder()
    }

    @Test
    fun `empty query excludes already-selected tags from the pool`() {
        val state = ConversationTagAutocomplete.resolve(
            knownTags = listOf("work", "family", "urgent"),
            selectedTags = listOf("family"),
            query = "",
        )
        assertThat(state.suggestions).containsExactly("work", "urgent").inOrder()
    }

    @Test
    fun `blank whitespace query behaves like an empty query`() {
        val state = ConversationTagAutocomplete.resolve(
            knownTags = listOf("work", "family"),
            selectedTags = emptyList(),
            query = "   ",
        )
        assertThat(state.suggestions).containsExactly("work", "family").inOrder()
        assertThat(state.canCreate).isFalse()
    }

    @Test
    fun `empty query caps the pool at the max suggestion count`() {
        val known = (1..12).map { "tag$it" }
        val state = ConversationTagAutocomplete.resolve(
            knownTags = known,
            selectedTags = emptyList(),
            query = "",
        )
        assertThat(state.suggestions).hasSize(ConversationTagAutocomplete.MAX_SUGGESTIONS)
        assertThat(state.suggestions.first()).isEqualTo("tag1")
        assertThat(state.suggestions.last()).isEqualTo("tag8")
    }

    // --- suggestions: filtered ----------------------------------------------

    @Test
    fun `query filters the pool case-insensitively by substring`() {
        val state = ConversationTagAutocomplete.resolve(
            knownTags = listOf("Work", "Homework", "Family"),
            selectedTags = emptyList(),
            query = "work",
        )
        assertThat(state.suggestions).containsExactly("Work", "Homework").inOrder()
    }

    @Test
    fun `query with no substring match returns no suggestions`() {
        val state = ConversationTagAutocomplete.resolve(
            knownTags = listOf("work", "family"),
            selectedTags = emptyList(),
            query = "zzz",
        )
        assertThat(state.suggestions).isEmpty()
    }

    @Test
    fun `filtered suggestions also exclude selected tags`() {
        val state = ConversationTagAutocomplete.resolve(
            knownTags = listOf("work", "homework", "network"),
            selectedTags = listOf("homework"),
            query = "work",
        )
        assertThat(state.suggestions).containsExactly("work", "network").inOrder()
    }

    @Test
    fun `filtered suggestions are capped at the max suggestion count`() {
        val known = (1..12).map { "work$it" }
        val state = ConversationTagAutocomplete.resolve(
            knownTags = known,
            selectedTags = emptyList(),
            query = "work",
        )
        assertThat(state.suggestions).hasSize(ConversationTagAutocomplete.MAX_SUGGESTIONS)
    }

    @Test
    fun `query is trimmed before filtering`() {
        val state = ConversationTagAutocomplete.resolve(
            knownTags = listOf("urgent", "family"),
            selectedTags = emptyList(),
            query = "  urg  ",
        )
        assertThat(state.suggestions).containsExactly("urgent").inOrder()
    }

    // --- canCreate ----------------------------------------------------------

    @Test
    fun `canCreate is true for a brand-new tag`() {
        val state = ConversationTagAutocomplete.resolve(
            knownTags = listOf("work"),
            selectedTags = listOf("family"),
            query = "urgent",
        )
        assertThat(state.canCreate).isTrue()
    }

    @Test
    fun `canCreate is false when the query matches a known tag case-insensitively`() {
        val state = ConversationTagAutocomplete.resolve(
            knownTags = listOf("Work"),
            selectedTags = emptyList(),
            query = "work",
        )
        assertThat(state.canCreate).isFalse()
    }

    @Test
    fun `canCreate is false when the query matches a selected tag case-insensitively`() {
        val state = ConversationTagAutocomplete.resolve(
            knownTags = emptyList(),
            selectedTags = listOf("Urgent"),
            query = "urgent",
        )
        assertThat(state.canCreate).isFalse()
    }

    @Test
    fun `canCreate is false for a blank query`() {
        val state = ConversationTagAutocomplete.resolve(
            knownTags = emptyList(),
            selectedTags = emptyList(),
            query = "   ",
        )
        assertThat(state.canCreate).isFalse()
    }

    // --- submitTag ----------------------------------------------------------

    @Test
    fun `submit picks the first suggestion when the panel has matches`() {
        val state = ConversationTagAutocomplete.resolve(
            knownTags = listOf("Work", "Homework"),
            selectedTags = emptyList(),
            query = "work",
        )
        assertThat(state.submitTag).isEqualTo("Work")
    }

    @Test
    fun `submit creates the trimmed query when there are no suggestions but it is creatable`() {
        val state = ConversationTagAutocomplete.resolve(
            knownTags = listOf("family"),
            selectedTags = emptyList(),
            query = "  urgent  ",
        )
        assertThat(state.submitTag).isEqualTo("urgent")
    }

    @Test
    fun `submit is a no-op when there are no suggestions and nothing to create`() {
        val state = ConversationTagAutocomplete.resolve(
            knownTags = emptyList(),
            selectedTags = listOf("urgent"),
            query = "urgent",
        )
        assertThat(state.submitTag).isNull()
    }

    @Test
    fun `submit on an empty query with an empty pool is a no-op`() {
        val state = ConversationTagAutocomplete.resolve(
            knownTags = emptyList(),
            selectedTags = emptyList(),
            query = "",
        )
        assertThat(state.submitTag).isNull()
    }

    @Test
    fun `submit on an empty query with a non-empty pool picks the first suggestion`() {
        val state = ConversationTagAutocomplete.resolve(
            knownTags = listOf("work", "family"),
            selectedTags = emptyList(),
            query = "",
        )
        assertThat(state.submitTag).isEqualTo("work")
    }

    // --- append -------------------------------------------------------------

    @Test
    fun `append adds a trimmed tag to the selection`() {
        val next = ConversationTagAutocomplete.append(listOf("work"), "  urgent  ")
        assertThat(next).containsExactly("work", "urgent").inOrder()
    }

    @Test
    fun `append returns null for a blank name`() {
        val next = ConversationTagAutocomplete.append(listOf("work"), "   ")
        assertThat(next).isNull()
    }

    @Test
    fun `append returns null when the exact tag is already selected`() {
        val next = ConversationTagAutocomplete.append(listOf("urgent"), "urgent")
        assertThat(next).isNull()
    }

    @Test
    fun `append preserves order and appends at the end`() {
        val next = ConversationTagAutocomplete.append(listOf("a", "b"), "c")
        assertThat(next).containsExactly("a", "b", "c").inOrder()
    }

    @Test
    fun `append treats a case difference as a distinct tag`() {
        val next = ConversationTagAutocomplete.append(listOf("urgent"), "Urgent")
        assertThat(next).containsExactly("urgent", "Urgent").inOrder()
    }
}
