package me.meeshy.app.widget

import me.meeshy.app.conversations.ConversationRowTime
import me.meeshy.app.conversations.LastMessagePreviewLabels
import me.meeshy.app.widget.kit.WidgetOutsidePreview
import me.meeshy.app.widget.kit.WidgetPresence
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.theme.accentHex
import me.meeshy.sdk.theme.displayTitle
import me.meeshy.sdk.theme.otherParticipantUserId

/** Shared with [FavoriteContactsWidgetPresentation] — the same "is this a 1:1 chat"
 * gate both widgets need (sender-prefix suppression here, favorite-contact
 * eligibility there). */
internal val directConversationTypes = setOf("direct", "dm")

/**
 * A single rendered row of [RecentConversationsWidget] — the pure decision behind
 * each Glance list item (title/preview/badges), kept separate from the
 * `@Composable` content so it is coverable on the JVM (`TDD-COVERAGE.md`).
 */
internal data class RecentConversationRow(
    val id: String,
    val title: String,
    val preview: String,
    val isUnread: Boolean,
    val isPinned: Boolean,
    val accentHex: String,
    val presence: String? = null,
    val epochMillis: Long? = null,
    val deepLink: String = WidgetDeepLink.HOME,
)

/** Les trois faces du widget, miroir des familles iOS `systemSmall` / `systemMedium` / `systemLarge`. */
internal enum class RecentConversationsFace(val rowCount: Int) {
    SMALL(1),
    MEDIUM(2),
    LARGE(5),
    ;

    companion object {
        /** Taille minimale (dp) d'une face : la moyenne dès 4x2 cellules, la grande dès 4x4. */
        const val MEDIUM_MIN_WIDTH_DP = 250
        const val LARGE_MIN_HEIGHT_DP = 250

        fun forSize(widthDp: Float, heightDp: Float): RecentConversationsFace = when {
            widthDp < MEDIUM_MIN_WIDTH_DP -> SMALL
            heightDp < LARGE_MIN_HEIGHT_DP -> MEDIUM
            else -> LARGE
        }
    }
}

/**
 * Pure display state for [RecentConversationsWidget] — parity target: iOS
 * `WidgetDataManager.publishConversations` (ordering: pinned first, then most
 * recently active) + `formatLastMessage` (a sender prefix only on non-direct
 * conversations). Reuses the existing `:sdk-core`/`:feature:conversations` SSOTs
 * ([ApiConversation.displayTitle], [ApiConversation.accentHex], [WidgetOutsidePreview],
 * [ConversationRowTime]) rather than re-implementing any of them.
 */
internal data class RecentConversationsWidgetPresentation(
    val rows: List<RecentConversationRow>,
    val unreadTotal: Int = 0,
    val signedIn: Boolean = true,
) {
    val isEmpty: Boolean get() = rows.isEmpty()

    /** La pilule « N non lus » : absente à zéro. */
    val showUnreadPill: Boolean get() = unreadTotal > 0

    /** Les lignes que montre une [face], dans l'ordre épinglées puis récentes. */
    fun rowsFor(face: RecentConversationsFace): List<RecentConversationRow> = rows.take(face.rowCount)

    companion object {
        /** iOS keeps up to 50 for the share-sheet's sake but renders `.prefix(5)` in
         * every widget face — Android has no equivalent share-sheet reuse yet, so the
         * widget's own cap is applied directly here. */
        private const val MAX_ROWS = 5

        /** Les conversations que le widget montre, dans l'ordre affiché : épinglées d'abord, puis les plus récentes. */
        fun selection(conversations: List<ApiConversation>): List<ApiConversation> =
            conversations.sortedWith(
                compareByDescending<ApiConversation> { it.resolvedPreferences?.isPinned == true }
                    .thenByDescending { ConversationRowTime.epochMillis(it) ?: Long.MIN_VALUE },
            ).take(MAX_ROWS)

        /** [presence] : le palier servi de chaque pair (`userId`) ; seules les conversations directes ont un pair, un absent n'a pas de point. */
        fun from(
            conversations: List<ApiConversation>,
            currentUserId: String?,
            previewLabels: LastMessagePreviewLabels,
            preferredLanguages: List<String> = emptyList(),
            ephemeralLabel: String = "",
            nowMillis: Long = System.currentTimeMillis(),
            presence: Map<String, PresenceState> = emptyMap(),
            totalUnread: Int? = null,
            signedIn: Boolean = true,
        ): RecentConversationsWidgetPresentation {
            val rows = selection(conversations).map { conversation ->
                RecentConversationRow(
                    id = conversation.id,
                    title = conversation.displayTitle(currentUserId),
                    preview = WidgetOutsidePreview.text(
                        conversation = conversation,
                        currentUserId = currentUserId,
                        showSender = conversation.type.lowercase() !in directConversationTypes,
                        labels = previewLabels,
                        ephemeralLabel = ephemeralLabel,
                        preferredLanguages = preferredLanguages,
                        nowMillis = nowMillis,
                    ),
                    isUnread = conversation.unreadCount > 0,
                    isPinned = conversation.resolvedPreferences?.isPinned == true,
                    accentHex = conversation.accentHex(),
                    epochMillis = ConversationRowTime.epochMillis(conversation),
                    deepLink = WidgetDeepLink.conversation(conversation.id),
                    presence = conversation.takeIf { it.type.lowercase() in directConversationTypes }
                        ?.otherParticipantUserId(currentUserId)
                        ?.let { WidgetPresence.token(presence[it]) },
                )
            }
            return RecentConversationsWidgetPresentation(
                rows = rows,
                unreadTotal = (totalUnread ?: conversations.sumOf { it.unreadCount }).coerceAtLeast(0),
                signedIn = signedIn,
            )
        }
    }
}
