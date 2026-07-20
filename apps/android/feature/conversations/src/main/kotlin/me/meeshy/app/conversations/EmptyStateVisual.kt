package me.meeshy.app.conversations

/** Icon family for an empty-state card (mapped to a Material glyph in the screen). */
enum class EmptyStateGlyph { Error, NoResults, NoConversations }

/**
 * A resolvable copy slot. Kept enum-keyed (resolved to `R.string` in the screen)
 * so the empty-state decision stays pure and JVM-testable, free of Android
 * resource ids.
 */
enum class EmptyStateCopy {
    ErrorTitle,
    ErrorSubtitle,
    Retry,
    FilteredTitle,
    FilteredSubtitle,
    ColdTitle,
    ColdSubtitle,
}

/**
 * The empty-state subtitle is either a fixed resource string (generic guidance)
 * or a dynamic literal — the server's own error message, shown verbatim so the
 * user sees the real failure rather than a generic one.
 */
sealed interface EmptyStateSubtitle {
    data class Resource(val copy: EmptyStateCopy) : EmptyStateSubtitle
    data class Literal(val text: String) : EmptyStateSubtitle
}

/**
 * The presentational shape of a conversation-list empty state — glyph + title +
 * subtitle + optional retry CTA. The single source of truth for the empty-state
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
    val subtitle: EmptyStateSubtitle?,
    val cta: EmptyStateCopy?,
) {
    companion object {
        fun of(content: ConversationListContent): EmptyStateVisual? = when (content) {
            is ConversationListContent.Error -> EmptyStateVisual(
                glyph = EmptyStateGlyph.Error,
                title = EmptyStateCopy.ErrorTitle,
                subtitle = content.message.trim().takeIf { it.isNotEmpty() }
                    ?.let { EmptyStateSubtitle.Literal(it) }
                    ?: EmptyStateSubtitle.Resource(EmptyStateCopy.ErrorSubtitle),
                cta = EmptyStateCopy.Retry,
            )

            ConversationListContent.FilteredEmpty -> EmptyStateVisual(
                glyph = EmptyStateGlyph.NoResults,
                title = EmptyStateCopy.FilteredTitle,
                subtitle = EmptyStateSubtitle.Resource(EmptyStateCopy.FilteredSubtitle),
                cta = null,
            )

            ConversationListContent.ColdEmpty -> EmptyStateVisual(
                glyph = EmptyStateGlyph.NoConversations,
                title = EmptyStateCopy.ColdTitle,
                subtitle = EmptyStateSubtitle.Resource(EmptyStateCopy.ColdSubtitle),
                cta = null,
            )

            ConversationListContent.Populated,
            ConversationListContent.Skeleton -> null
        }
    }
}
