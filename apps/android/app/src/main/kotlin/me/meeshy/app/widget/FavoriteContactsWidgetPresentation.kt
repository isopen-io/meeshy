package me.meeshy.app.widget

import me.meeshy.app.conversations.ConversationRowTime
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.theme.accentHex
import me.meeshy.sdk.theme.displayTitle

/**
 * A single rendered row of [FavoriteContactsWidget] — kept separate from the
 * `@Composable` content so it is coverable on the JVM (`TDD-COVERAGE.md`).
 */
internal data class FavoriteContactRow(
    val id: String,
    val name: String,
    val accentHex: String,
)

/**
 * Pure display state for [FavoriteContactsWidget] — parity target: iOS
 * `WidgetDataManager.publishFavoriteContacts` (`conversations.filter { isPinned &&
 * type == .direct }.prefix(8)`). Reuses the existing `:sdk-core`/
 * `:feature:conversations` SSOTs ([ApiConversation.displayTitle],
 * [ApiConversation.accentHex], [ConversationRowTime]) rather than re-implementing
 * any of them — same posture as the sibling [RecentConversationsWidgetPresentation].
 *
 * A "favorite contact" is a **pinned direct conversation**, not a standalone
 * contacts concept — mirrors iOS exactly, which reads the same
 * `MeeshyConversation.userState.isPinned`/`.type == .direct` fields rather than a
 * separate favorites list.
 */
internal data class FavoriteContactsWidgetPresentation(
    val rows: List<FavoriteContactRow>,
) {
    val isEmpty: Boolean get() = rows.isEmpty()

    companion object {
        /** Matches iOS's own `.prefix(8)` in `publishFavoriteContacts`. */
        private const val MAX_ROWS = 8

        fun from(
            conversations: List<ApiConversation>,
            currentUserId: String?,
        ): FavoriteContactsWidgetPresentation {
            val rows = conversations
                .filter { it.resolvedPreferences?.isPinned == true && it.type.lowercase() in directConversationTypes }
                .sortedByDescending { ConversationRowTime.epochMillis(it) ?: Long.MIN_VALUE }
                .take(MAX_ROWS)
                .map { conversation ->
                    FavoriteContactRow(
                        id = conversation.id,
                        name = conversation.displayTitle(currentUserId),
                        accentHex = conversation.accentHex(),
                    )
                }
            return FavoriteContactsWidgetPresentation(rows)
        }
    }
}
