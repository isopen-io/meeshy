package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Empty-state *card* presentation (parity §B "error-with-retry empty state"; iOS
 * shows an iconified card — glyph + title + subtitle + Réessayer — not a bare
 * label). The single source of truth for *what a non-list arm looks like* —
 * asserted through the pure [EmptyStateVisual.of], never the Composable card.
 * Copy is enum-keyed (resolved to R.string in the screen) so the decision stays
 * pure and JVM-testable, free of Android resource ids; only the dynamic server
 * error text ever travels as a literal.
 */
class EmptyStateVisualTest {

    @Test
    fun `error arm becomes a retryable error card carrying the server message`() {
        val visual = EmptyStateVisual.of(ConversationListContent.Error("network down"))

        assertThat(visual).isEqualTo(
            EmptyStateVisual(
                glyph = EmptyStateGlyph.Error,
                title = EmptyStateCopy.ErrorTitle,
                subtitle = EmptyStateSubtitle.Literal("network down"),
                cta = EmptyStateCopy.Retry,
            ),
        )
    }

    @Test
    fun `error message is trimmed before it becomes the subtitle literal`() {
        val visual = EmptyStateVisual.of(ConversationListContent.Error("  offline  "))

        assertThat(visual?.subtitle).isEqualTo(EmptyStateSubtitle.Literal("offline"))
    }

    @Test
    fun `a blank error message falls back to the generic error subtitle, still retryable`() {
        val visual = EmptyStateVisual.of(ConversationListContent.Error("   "))

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
    fun `an empty error message falls back to the generic error subtitle`() {
        val visual = EmptyStateVisual.of(ConversationListContent.Error(""))

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
    fun `cold-empty arm becomes a no-conversations card with no retry`() {
        val visual = EmptyStateVisual.of(ConversationListContent.ColdEmpty)

        assertThat(visual).isEqualTo(
            EmptyStateVisual(
                glyph = EmptyStateGlyph.NoConversations,
                title = EmptyStateCopy.ColdTitle,
                subtitle = EmptyStateSubtitle.Resource(EmptyStateCopy.ColdSubtitle),
                cta = null,
            ),
        )
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
