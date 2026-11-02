package me.meeshy.app.widget

import me.meeshy.app.conversations.ConversationRowTime
import me.meeshy.app.widget.kit.WidgetPresence
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.theme.accentHex
import me.meeshy.sdk.theme.displayTitle
import me.meeshy.sdk.theme.otherParticipantUserId

/**
 * A single rendered row of [FavoriteContactsWidget] — kept separate from the
 * `@Composable` content so it is coverable on the JVM (`TDD-COVERAGE.md`).
 */
internal data class FavoriteContactRow(
    val id: String,
    val name: String,
    val accentHex: String,
    val presence: String? = null,
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

        /** Les conversations épinglées directes que le widget montre, dans l'ordre affiché. */
        fun selection(conversations: List<ApiConversation>): List<ApiConversation> =
            conversations
                .filter { it.resolvedPreferences?.isPinned == true && it.type.lowercase() in directConversationTypes }
                .sortedByDescending { ConversationRowTime.epochMillis(it) ?: Long.MIN_VALUE }
                .take(MAX_ROWS)

        /** [presence] : le palier servi de chaque pair (`userId`) ; un pair absent n'a pas de point. */
        fun from(
            conversations: List<ApiConversation>,
            currentUserId: String?,
            presence: Map<String, PresenceState> = emptyMap(),
        ): FavoriteContactsWidgetPresentation =
            FavoriteContactsWidgetPresentation(
                selection(conversations).map { conversation ->
                    FavoriteContactRow(
                        id = conversation.id,
                        name = conversation.displayTitle(currentUserId),
                        accentHex = conversation.accentHex(),
                        presence = conversation.otherParticipantUserId(currentUserId)
                            ?.let { WidgetPresence.token(presence[it]) },
                    )
                },
            )
    }
}
