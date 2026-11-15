package me.meeshy.app.shortcuts

import androidx.annotation.StringRes
import me.meeshy.app.R
import me.meeshy.app.conversations.ConversationRowTime
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.theme.displayTitle

/**
 * A single dynamic launcher shortcut — kept separate from the
 * `ShortcutManagerCompat`/`ShortcutInfoCompat` platform glue so it is coverable on
 * the JVM (`TDD-COVERAGE.md`).
 */
internal data class DynamicShortcutRow(
    val id: String,
    val shortLabel: String,
)

/**
 * Pure display state for the app's dynamic launcher shortcuts (long-press the
 * launcher icon) — Android's closest local, fully-testable equivalent to iOS's
 * `OpenRecentConversationIntent` App Shortcut. Reuses the same pinned-first-then-
 * recency ordering the home-screen widgets already apply
 * ([ConversationRowTime]) and [ApiConversation.displayTitle] for the label — zero
 * re-implementation.
 */
internal data class DynamicShortcutsPresentation(
    val rows: List<DynamicShortcutRow>,
) {
    companion object {
        fun from(
            conversations: List<ApiConversation>,
            currentUserId: String?,
            maxCount: Int,
        ): DynamicShortcutsPresentation {
            val cap = maxCount.coerceAtLeast(0)
            val rows = conversations
                .sortedWith(
                    compareByDescending<ApiConversation> { it.resolvedPreferences?.isPinned == true }
                        .thenByDescending { ConversationRowTime.epochMillis(it) ?: Long.MIN_VALUE },
                )
                .take(cap)
                .map { conversation ->
                    DynamicShortcutRow(
                        id = conversation.id,
                        shortLabel = conversation.displayTitle(currentUserId),
                    )
                }
            return DynamicShortcutsPresentation(rows)
        }
    }
}

/**
 * Les deux raccourcis d'ENTRÉE du lanceur (iOS App Shortcuts « Conversations récentes » et « Non lues »), posés avant
 * les conversations : leur adresse est celle que la racine élit ([me.meeshy.sdk.model.link.ConversationListEntry]).
 */
internal enum class EntryShortcut(val shortcutId: String, val address: String, @StringRes val labelRes: Int) {
    RECENT("entry-recent", "meeshy://conversations/recent", R.string.shortcut_recent_conversations),
    UNREAD("entry-unread", "meeshy://conversations/unread", R.string.shortcut_unread_conversations),
    ;

    companion object {
        /** Les places que les conversations gardent une fois les raccourcis d'entrée posés. */
        fun conversationSlots(maxCount: Int): Int = (maxCount - all.size).coerceAtLeast(0)

        val all: List<EntryShortcut> = values().toList()
    }
}
