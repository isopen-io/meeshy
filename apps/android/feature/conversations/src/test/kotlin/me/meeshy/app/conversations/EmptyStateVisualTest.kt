package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Empty-state *card* presentation (parity §B "error-with-retry empty state"; iOS
 * shows an iconified card — glyph + title + subtitle + Réessayer — not a bare
 * label). The single source of truth for *what a non-list arm looks like* —
 * asserted through the pure [EmptyStateVisual.of], never the Composable card.
 * Copy is enum-keyed (resolved to R.string in the screen) so the decision stays
 * pure and JVM-testable, free of Android resource ids. A server or transport
 * error text never reaches the card (parity iOS `conversations.error.subtitle`).
 */
class EmptyStateVisualTest {

    @Test
    fun `error arm becomes a retryable error card with the translated subtitle, never the raw server message`() {
        val visual = EmptyStateVisual.of(ConversationListContent.Error("Unable to resolve host gate.meeshy.me"))

        assertThat(visual).isEqualTo(
            EmptyStateVisual(
                glyph = EmptyStateGlyph.Error,
                title = EmptyStateCopy.ErrorTitle,
                subtitle = EmptyStateSubtitle.Resource(EmptyStateCopy.ErrorSubtitle),
                cta = EmptyStateCopy.Retry,
            ),
        )
    }

    @Test
    fun `a blank error message gets the same translated subtitle`() {
        val visual = EmptyStateVisual.of(ConversationListContent.Error("   "))

        assertThat(visual?.subtitle).isEqualTo(EmptyStateSubtitle.Resource(EmptyStateCopy.ErrorSubtitle))
    }

    @Test
    fun `filtered-empty arm becomes a no-results card with no retry`() {
        val visual = EmptyStateVisual.of(ConversationListContent.FilteredEmpty)

        assertThat(visual).isEqualTo(
            EmptyStateVisual(
                glyph = EmptyStateGlyph.NoResults,
                title = EmptyStateCopy.FilteredTitle,
                subtitle = EmptyStateSubtitle.Resource(EmptyStateCopy.FilteredSubtitle),
                cta = null,
            ),
        )
    }

    @Test
    fun `cold-empty arm becomes a no-conversations card with a New conversation CTA`() {
        val visual = EmptyStateVisual.of(ConversationListContent.ColdEmpty)

        assertThat(visual).isEqualTo(
            EmptyStateVisual(
                glyph = EmptyStateGlyph.NoConversations,
                title = EmptyStateCopy.ColdTitle,
                subtitle = EmptyStateSubtitle.Resource(EmptyStateCopy.ColdSubtitle),
                cta = EmptyStateCopy.NewConversation,
            ),
        )
    }

    @Test
    fun `search-no-results arm is a compact no-results card with no CTA`() {
        val visual = EmptyStateVisual.of(ConversationListContent.SearchNoResults)

        assertThat(visual).isEqualTo(
            EmptyStateVisual(
                glyph = EmptyStateGlyph.SearchNoResults,
                title = EmptyStateCopy.SearchNoResultsTitle,
                subtitle = EmptyStateSubtitle.Resource(EmptyStateCopy.SearchNoResultsSubtitle),
                cta = null,
                compact = true,
            ),
        )
    }

    @Test
    fun `search and filter empties carry different copy`() {
        val search = EmptyStateVisual.of(ConversationListContent.SearchNoResults)
        val filter = EmptyStateVisual.of(ConversationListContent.FilteredEmpty)

        assertThat(search?.title).isNotEqualTo(filter?.title)
    }

    @Test
    fun `the populated arm has no card`() {
        assertThat(EmptyStateVisual.of(ConversationListContent.Populated)).isNull()
    }

    @Test
    fun `the skeleton arm has no card`() {
        assertThat(EmptyStateVisual.of(ConversationListContent.Skeleton)).isNull()
    }
}
