package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationPreferences
import org.junit.Test

/**
 * Conversation-list sectioning (parity §B "Sectioned list … pinned section").
 * Behaviour asserted through the pure [ConversationSections.of] SSOT on real
 * [ApiConversation]s — the partition, the empty-section omission (no phantom
 * "All" header when every row is pinned), the pinned-first ordering, and the
 * order preservation inside each group.
 */
class ConversationSectionsTest {

    private fun conv(id: String, pinned: Boolean = false, viaUserPrefs: Boolean = false): ApiConversation {
        val prefs = ApiConversationPreferences(isPinned = pinned)
        return if (viaUserPrefs) {
            ApiConversation(id = id, userPreferences = listOf(prefs))
        } else {
            ApiConversation(id = id, preferences = prefs)
        }
    }

    private fun ids(section: ConversationSection) = section.items.map { it.id }

    @Test
    fun `an empty list produces no sections`() {
        assertThat(ConversationSections.of(emptyList())).isEmpty()
    }

    @Test
    fun `no pinned rows yields a single All section holding every row in order`() {
        val input = listOf(conv("a"), conv("b"), conv("c"))

        val sections = ConversationSections.of(input)

        assertThat(sections).hasSize(1)
        assertThat(sections.single().kind).isEqualTo(ConversationSectionKind.ALL)
        assertThat(ids(sections.single())).containsExactly("a", "b", "c").inOrder()
    }

    @Test
    fun `every row pinned yields only a Pinned section — no phantom empty All header`() {
        val input = listOf(conv("a", pinned = true), conv("b", pinned = true))

        val sections = ConversationSections.of(input)

        assertThat(sections).hasSize(1)
        assertThat(sections.single().kind).isEqualTo(ConversationSectionKind.PINNED)
        assertThat(ids(sections.single())).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `a mix yields Pinned first then All`() {
        val input = listOf(conv("a"), conv("b", pinned = true), conv("c"))

        val sections = ConversationSections.of(input)

        assertThat(sections.map { it.kind })
            .containsExactly(ConversationSectionKind.PINNED, ConversationSectionKind.ALL)
            .inOrder()
    }

    @Test
    fun `each group preserves the incoming relative order across interleaving`() {
        val input = listOf(
            conv("a", pinned = true),
            conv("b"),
            conv("c", pinned = true),
            conv("d"),
            conv("e", pinned = true),
        )

        val sections = ConversationSections.of(input)

        val pinned = sections.first { it.kind == ConversationSectionKind.PINNED }
        val all = sections.first { it.kind == ConversationSectionKind.ALL }
        assertThat(ids(pinned)).containsExactly("a", "c", "e").inOrder()
        assertThat(ids(all)).containsExactly("b", "d").inOrder()
    }

    @Test
    fun `a single pinned row yields one Pinned section`() {
        val sections = ConversationSections.of(listOf(conv("only", pinned = true)))

        assertThat(sections.map { it.kind }).containsExactly(ConversationSectionKind.PINNED)
        assertThat(ids(sections.single())).containsExactly("only")
    }

    @Test
    fun `a single non-pinned row yields one All section`() {
        val sections = ConversationSections.of(listOf(conv("only")))

        assertThat(sections.map { it.kind }).containsExactly(ConversationSectionKind.ALL)
        assertThat(ids(sections.single())).containsExactly("only")
    }

    @Test
    fun `pin resolved from userPreferences also lands in the Pinned section`() {
        val input = listOf(conv("a", pinned = true, viaUserPrefs = true), conv("b"))

        val sections = ConversationSections.of(input)

        val pinned = sections.first { it.kind == ConversationSectionKind.PINNED }
        assertThat(ids(pinned)).containsExactly("a")
    }

    @Test
    fun `a row with no preferences is treated as not pinned`() {
        val input = listOf(ApiConversation(id = "a"), conv("b", pinned = true))

        val sections = ConversationSections.of(input)

        val all = sections.first { it.kind == ConversationSectionKind.ALL }
        assertThat(ids(all)).containsExactly("a")
    }
}
