package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.CategoryOption
import org.junit.Test

/**
 * iOS `showsSectionHeader`: the FLAT list — a single « My conversations » section, no pinned
 * row, no category in use — shows no header at all; as soon as a second section exists,
 * every section names itself.
 */
class SectionHeaderVisibilityTest {

    private fun conv(id: String, pinned: Boolean = false, categoryId: String? = null) = ApiConversation(
        id = id,
        userPreferences = listOf(ApiConversationPreferences(isPinned = pinned, categoryId = categoryId)),
    )

    @Test
    fun `a flat list of uncategorised rows shows no header`() {
        val sections = ConversationSections.of(listOf(conv("a"), conv("b")))

        assertThat(ConversationSections.showsHeaders(sections)).isFalse()
    }

    @Test
    fun `a pinned row makes every section name itself`() {
        val sections = ConversationSections.of(listOf(conv("p", pinned = true), conv("a")))

        assertThat(ConversationSections.showsHeaders(sections)).isTrue()
    }

    @Test
    fun `a category alone still names itself`() {
        val sections = ConversationSections.of(
            listOf(conv("a", categoryId = "work")),
            listOf(CategoryOption(id = "work", name = "Work", order = 0)),
        )

        assertThat(ConversationSections.showsHeaders(sections)).isTrue()
    }

    @Test
    fun `no section shows no header`() {
        assertThat(ConversationSections.showsHeaders(emptyList())).isFalse()
    }
}
