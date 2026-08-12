package me.meeshy.app.conversations

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.CategoryOption

/**
 * The kind of a conversation-list section (parity §B): Épingles first, then the
 * user's categories in catalogue order, then the "Mes conversations" catch-all.
 */
public enum class ConversationSectionKind { PINNED, CATEGORY, ALL }

/**
 * A rendered conversation-list section: its [kind] and the rows it holds, in display
 * order. For a [ConversationSectionKind.CATEGORY] section, [categoryId] and [title]
 * carry the user category's identity and display name; both are `null` for the
 * static [ConversationSectionKind.PINNED]/[ConversationSectionKind.ALL] sections,
 * whose titles come from string resources.
 */
public data class ConversationSection(
    val kind: ConversationSectionKind,
    val items: List<ApiConversation>,
    val categoryId: String? = null,
    val title: String? = null,
)

/**
 * Splits the already filtered/ordered conversation list into display sections
 * (parity §B "Sectioned list … pinned section, then user categories, then Autres").
 * Single source of truth for the split — a faithful port of iOS
 * `ConversationListViewModel.groupConversations`
 * (`apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift`).
 *
 * Bucketing (matches iOS's `Dictionary(grouping:)` key):
 * - A **pinned** conversation *without* a category floats to the first
 *   [ConversationSectionKind.PINNED] section (iOS `isPinned && sectionId == nil`).
 * - A conversation whose [me.meeshy.sdk.model.ApiConversationPreferences.categoryId]
 *   names a category present in [categories] lands in that category's section —
 *   **even when pinned** (iOS keeps a pinned-with-category row inside its category,
 *   pinned-sorted upstream, not floated to Épingles).
 * - Everything else — uncategorized rows and rows whose category is absent from the
 *   catalogue (orphaned, e.g. a deleted category) — falls into the
 *   [ConversationSectionKind.ALL] catch-all (iOS `.other`, "Mes conversations").
 *
 * Section order: pinned, then each catalogue category **in its given order**, then
 * the catch-all. An **empty** section is omitted (no phantom header). Incoming
 * relative order is preserved inside every section — the list arrives pre-ordered
 * from `DraftAwareOrdering`, so no second sort is applied (SOTA over iOS, which
 * re-sorts each section: Android orders once upstream and sections stay stable).
 *
 * With the default empty [categories] this reduces to the pinned/all split it
 * replaces: no `categoryId` can match an empty catalogue, so every non-pinned row
 * (and any orphaned-category row) lands in [ConversationSectionKind.ALL].
 */
public object ConversationSections {
    private const val PINNED_KEY = "__pinned__"
    private const val OTHER_KEY = "__other__"

    public fun of(
        conversations: List<ApiConversation>,
        categories: List<CategoryOption> = emptyList(),
    ): List<ConversationSection> {
        val categoryIds = categories.mapTo(HashSet()) { it.id }
        val grouped = conversations.groupBy { conv ->
            val prefs = conv.resolvedPreferences
            val categoryId = prefs?.categoryId
            when {
                prefs?.isPinned == true && categoryId == null -> PINNED_KEY
                categoryId != null && categoryId in categoryIds -> categoryId
                else -> OTHER_KEY
            }
        }
        return buildList {
            grouped[PINNED_KEY]?.let { add(ConversationSection(ConversationSectionKind.PINNED, it)) }
            categories.forEach { category ->
                grouped[category.id]?.let {
                    add(
                        ConversationSection(
                            kind = ConversationSectionKind.CATEGORY,
                            items = it,
                            categoryId = category.id,
                            title = category.name,
                        ),
                    )
                }
            }
            grouped[OTHER_KEY]?.let { add(ConversationSection(ConversationSectionKind.ALL, it)) }
        }
    }
}
