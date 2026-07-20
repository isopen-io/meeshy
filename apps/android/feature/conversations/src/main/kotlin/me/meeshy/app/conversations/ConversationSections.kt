package me.meeshy.app.conversations

import me.meeshy.sdk.model.ApiConversation

/** The kind of a conversation-list section (parity §B: Épingles first, then Mes conversations). */
public enum class ConversationSectionKind { PINNED, ALL }

/** A rendered conversation-list section: its [kind] and the rows it holds, in display order. */
public data class ConversationSection(
    val kind: ConversationSectionKind,
    val items: List<ApiConversation>,
)

/**
 * Splits the already filtered/ordered conversation list into display sections
 * (parity §B "Sectioned list … pinned section"). Single source of truth for the
 * split that previously lived as scattered `filter`/`filterNot` glue inside
 * [ConversationListScreen].
 *
 * - Pinned rows form the first section, the rest the second, each preserving the
 *   incoming relative order (drafts stay floated, filter order intact).
 * - An **empty** section is omitted — so an all-pinned account shows no phantom
 *   empty "Mes conversations" header, and a pin-free account shows no Pinned one.
 */
public object ConversationSections {
    public fun of(conversations: List<ApiConversation>): List<ConversationSection> {
        val pinned = conversations.filter { it.resolvedPreferences?.isPinned == true }
        val others = conversations.filterNot { it.resolvedPreferences?.isPinned == true }
        return buildList {
            if (pinned.isNotEmpty()) add(ConversationSection(ConversationSectionKind.PINNED, pinned))
            if (others.isNotEmpty()) add(ConversationSection(ConversationSectionKind.ALL, others))
        }
    }
}
