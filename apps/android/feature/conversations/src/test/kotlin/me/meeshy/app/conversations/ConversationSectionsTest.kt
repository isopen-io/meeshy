package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.CategoryOption
import org.junit.Test

/**
 * Conversation-list sectioning (parity §B "Sectioned list … pinned section").
 * Behaviour asserted through the pure [ConversationSections.of] SSOT on real
 * [ApiConversation]s — the partition, the empty-section omission (no phantom
 * "All" header when every row is pinned), the pinned-first ordering, and the
 * order preservation inside each group.
 */
class ConversationSectionsTest {

    private fun conv(
        id: String,
        pinned: Boolean = false,
        viaUserPrefs: Boolean = false,
        categoryId: String? = null,
    ): ApiConversation {
        val prefs = ApiConversationPreferences(isPinned = pinned, categoryId = categoryId)
        return if (viaUserPrefs) {
            ApiConversation(id = id, userPreferences = listOf(prefs))
        } else {
            ApiConversation(id = id, preferences = prefs)
        }
    }

    private fun cat(id: String, name: String = id, order: Int? = null) = CategoryOption(id, name, order)

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

    // --- User-category grouping (parity §B: categories between Pinned and Autres) ---

    @Test
    fun `categorized rows are grouped under their category in catalogue order`() {
        val input = listOf(
            conv("w1", categoryId = "work"),
            conv("f1", categoryId = "fam"),
            conv("w2", categoryId = "work"),
        )
        val categories = listOf(cat("work", "Travail"), cat("fam", "Famille"))

        val sections = ConversationSections.of(input, categories)

        assertThat(sections.map { it.kind })
            .containsExactly(ConversationSectionKind.CATEGORY, ConversationSectionKind.CATEGORY)
            .inOrder()
        assertThat(sections[0].categoryId).isEqualTo("work")
        assertThat(sections[0].title).isEqualTo("Travail")
        assertThat(ids(sections[0])).containsExactly("w1", "w2").inOrder()
        assertThat(sections[1].categoryId).isEqualTo("fam")
        assertThat(sections[1].title).isEqualTo("Famille")
        assertThat(ids(sections[1])).containsExactly("f1")
    }

    @Test
    fun `sections order is Pinned then categories then the All catch-all`() {
        val input = listOf(
            conv("p", pinned = true),
            conv("w", categoryId = "work"),
            conv("o"),
        )
        val categories = listOf(cat("work"))

        val sections = ConversationSections.of(input, categories)

        assertThat(sections.map { it.kind })
            .containsExactly(
                ConversationSectionKind.PINNED,
                ConversationSectionKind.CATEGORY,
                ConversationSectionKind.ALL,
            )
            .inOrder()
        assertThat(ids(sections.first { it.kind == ConversationSectionKind.ALL })).containsExactly("o")
    }

    @Test
    fun `a pinned conversation with a category stays inside its category section`() {
        val input = listOf(conv("w", pinned = true, categoryId = "work"))
        val categories = listOf(cat("work"))

        val sections = ConversationSections.of(input, categories)

        assertThat(sections).hasSize(1)
        assertThat(sections.single().kind).isEqualTo(ConversationSectionKind.CATEGORY)
        assertThat(sections.single().categoryId).isEqualTo("work")
        assertThat(ids(sections.single())).containsExactly("w")
    }

    @Test
    fun `a pinned conversation without a category still floats to Pinned when categories exist`() {
        val input = listOf(conv("p", pinned = true), conv("w", categoryId = "work"))
        val categories = listOf(cat("work"))

        val sections = ConversationSections.of(input, categories)

        assertThat(sections.first().kind).isEqualTo(ConversationSectionKind.PINNED)
        assertThat(ids(sections.first())).containsExactly("p")
    }

    @Test
    fun `a row whose category is absent from the catalogue is orphaned into All`() {
        val input = listOf(conv("ghost", categoryId = "deleted"), conv("plain"))
        val categories = listOf(cat("work"))

        val sections = ConversationSections.of(input, categories)

        assertThat(sections.map { it.kind }).containsExactly(ConversationSectionKind.ALL)
        assertThat(ids(sections.single())).containsExactly("ghost", "plain").inOrder()
    }

    @Test
    fun `an empty category produces no section`() {
        val input = listOf(conv("w", categoryId = "work"))
        val categories = listOf(cat("work"), cat("empty"))

        val sections = ConversationSections.of(input, categories)

        assertThat(sections.map { it.categoryId }).containsExactly("work")
    }

    @Test
    fun `an empty catalogue orphans every categorized row into All`() {
        val input = listOf(conv("a", categoryId = "work"), conv("b"))

        val sections = ConversationSections.of(input, categories = emptyList())

        assertThat(sections.map { it.kind }).containsExactly(ConversationSectionKind.ALL)
        assertThat(ids(sections.single())).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `a category section preserves the incoming relative order of its rows`() {
        val input = listOf(
            conv("w1", categoryId = "work"),
            conv("f1", categoryId = "fam"),
            conv("w2", categoryId = "work"),
            conv("w3", categoryId = "work"),
        )
        val categories = listOf(cat("work"), cat("fam"))

        val sections = ConversationSections.of(input, categories)

        assertThat(ids(sections.first { it.categoryId == "work" }))
            .containsExactly("w1", "w2", "w3").inOrder()
    }
}
