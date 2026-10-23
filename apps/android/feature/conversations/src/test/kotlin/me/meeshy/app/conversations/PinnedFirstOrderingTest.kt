package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.ConversationDraft
import org.junit.Test

/**
 * The total order of the list (iOS `conversationsAreInOrder`): pinned rows first, in their
 * activity order; a draft only floats a NON-pinned row, and never above a pinned one. So a
 * pinned conversation the sections leave inside « My conversations » or a category (its
 * category set) still heads that section.
 */
class PinnedFirstOrderingTest {

    private fun conv(id: String, pinned: Boolean = false) =
        ApiConversation(id = id, userPreferences = listOf(ApiConversationPreferences(isPinned = pinned)))

    private fun draft(id: String, updatedAt: String? = null) =
        ConversationDraft(conversationId = id, text = "wip", updatedAt = updatedAt)

    private fun ids(list: List<ApiConversation>) = list.map { it.id }

    @Test
    fun `pinned rows head the list in their incoming order, without any draft`() {
        val input = listOf(conv("a"), conv("p1", pinned = true), conv("b"), conv("p2", pinned = true))

        assertThat(ids(DraftAwareOrdering.apply(input, emptyMap())))
            .containsExactly("p1", "p2", "a", "b").inOrder()
    }

    @Test
    fun `a draft floats a non-pinned row below the pinned ones, never above`() {
        val input = listOf(conv("p", pinned = true), conv("a"), conv("b"))

        assertThat(ids(DraftAwareOrdering.apply(input, mapOf("b" to draft("b")))))
            .containsExactly("p", "b", "a").inOrder()
    }

    @Test
    fun `a draft gives no priority among pinned rows`() {
        val input = listOf(conv("p1", pinned = true), conv("p2", pinned = true), conv("a"))

        assertThat(ids(DraftAwareOrdering.apply(input, mapOf("p2" to draft("p2", "2026-10-20T00:00:00Z")))))
            .containsExactly("p1", "p2", "a").inOrder()
    }

    @Test
    fun `a pinned row kept in the catch-all section heads it`() {
        val ordered = DraftAwareOrdering.apply(
            listOf(conv("recent"), conv("orphan-pinned", pinned = true).let {
                it.copy(userPreferences = listOf(ApiConversationPreferences(isPinned = true, categoryId = "gone")))
            }),
            emptyMap(),
        )

        val catchAll = ConversationSections.of(ordered).single { it.kind == ConversationSectionKind.ALL }

        assertThat(catchAll.items.map { it.id }).containsExactly("orphan-pinned", "recent").inOrder()
    }
}
