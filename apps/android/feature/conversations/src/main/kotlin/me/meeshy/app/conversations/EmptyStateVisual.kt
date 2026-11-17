package me.meeshy.app.conversations

/** Icon family for an empty-state card (mapped to a Material glyph in the screen). */
enum class EmptyStateGlyph { Error, NoResults, NoConversations, SearchNoResults }

/**
 * A resolvable copy slot. Kept enum-keyed (resolved to `R.string` in the screen)
 * so the empty-state decision stays pure and JVM-testable, free of Android
 * resource ids.
 */
enum class EmptyStateCopy {
    ErrorMessage,
    Retry,
    FilteredTitle,
    ColdTitle,
    NewConversation,
    SearchNoResultsTitle,
}

/**
 * The presentational shape of a conversation-list empty state — glyph + ONE line +
 * optional action (#17697, règle 4: an empty state holds in one line, plus an action when one exists).
 * The line of an error is always a translated resource: a transport or server error text
 * (« Unable to resolve host … ») is never shown to the user. The single source of truth for the empty-state
 * *card* (parity §B "error-with-retry empty state"; iOS shows an iconified card,
 * not a bare label), lifted out of [ConversationListScreen] so the copy/icon
 * choice is fully covered rather than untestable Composable glue.
 *
 * The two list-bearing arms — [ConversationListContent.Populated] and
 * [ConversationListContent.Skeleton] — have no card and map to `null`.
 */
data class EmptyStateVisual(
    val glyph: EmptyStateGlyph,
    val title: EmptyStateCopy,
    val cta: EmptyStateCopy?,
    val compact: Boolean = false,
) {
    companion object {
        fun of(content: ConversationListContent): EmptyStateVisual? = when (content) {
            is ConversationListContent.Error -> EmptyStateVisual(
                glyph = EmptyStateGlyph.Error,
                title = EmptyStateCopy.ErrorMessage,
                cta = EmptyStateCopy.Retry,
            )

            ConversationListContent.FilteredEmpty -> EmptyStateVisual(
                glyph = EmptyStateGlyph.NoResults,
                title = EmptyStateCopy.FilteredTitle,
                cta = null,
            )

            ConversationListContent.ColdEmpty -> EmptyStateVisual(
                glyph = EmptyStateGlyph.NoConversations,
                title = EmptyStateCopy.ColdTitle,
                cta = EmptyStateCopy.NewConversation,
            )

            ConversationListContent.SearchNoResults -> EmptyStateVisual(
                glyph = EmptyStateGlyph.SearchNoResults,
                title = EmptyStateCopy.SearchNoResultsTitle,
                cta = null,
                compact = true,
            )

            ConversationListContent.Populated,
            ConversationListContent.Skeleton -> null
        }
    }
}
