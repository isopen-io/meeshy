package me.meeshy.sdk.model.push

import me.meeshy.sdk.model.UserNotificationPreferences

/**
 * Tray grouping of a push — iOS `threadIdentifier` re-derived from the payload : one group
 * per conversation (`conversation:{id}`), else per post (`post:{id}`), else none. The
 * « Group notifications » preference turned off disables grouping altogether.
 */
public object PushGrouping {

    public fun groupKey(payload: PushPayload): String? =
        payload.conversationId?.let { "conversation:$it" } ?: payload.postId?.let { "post:$it" }

    public fun groupKey(payload: PushPayload, preferences: UserNotificationPreferences): String? =
        if (preferences.groupNotifications) groupKey(payload) else null

    /** The stable `NotificationManager` id of a group's summary. */
    public fun summaryNotificationId(groupKey: String): Int = "summary:$groupKey".hashCode()
}

/**
 * Le nombre que porte UNE bannière (`Notification.number`) : les messages qu'elle regroupe, jamais le total de
 * conversations non lues du serveur. Android n'a pas de compteur absolu de l'icône : les lanceurs ADDITIONNENT les
 * `number` des bannières actives, si bien qu'un total global posé sur chacune d'elles gonflait l'icône (3 conversations
 * de 1, 2 et 3 non lus annonçaient 6). Le total reste affaire d'iOS (`aps.badge`), de la liste et du cache.
 * `0` quand l'utilisateur a coupé les pastilles (efface un nombre résiduel, même règle qu'iOS et la passerelle).
 */
public object PushBadgePolicy {

    /**
     * @param previous le nombre de la bannière déjà posée sous le même index, `null` sans bannière
     * @param addsMessage `false` pour une CORRECTION de texte (message modifié) : elle ne compte pas un message de plus
     */
    public fun bannerCount(preferences: UserNotificationPreferences, previous: Int?, addsMessage: Boolean = true): Int {
        if (!preferences.notificationBadgeEnabled) return 0
        val before = (previous ?: 0).coerceAtLeast(0)
        return if (addsMessage) before + 1 else before.coerceAtLeast(1)
    }
}

/** The curated channel family a push type posts to. An unknown type falls into the generic [MESSAGES] family. */
public enum class PushChannelCategory {
    MESSAGES,
    SOCIAL,
    SYSTEM,
    ;

    public companion object {
        private val SOCIAL_TYPES: Set<String> = setOf(
            "post_like", "POST_LIKE", "post_comment", "POST_COMMENT", "post_repost",
            "story_reaction", "status_reaction", "STORY_REPLY", "comment_reply", "comment_like", "comment_reaction",
            "story_new_comment", "friend_story_comment", "story_thread_reply",
            "friend_new_story", "friend_new_post", "friend_new_mood",
            "contact_request", "friend_request", "FRIEND_REQUEST", "contact_accepted", "friend_accepted",
            "FRIEND_ACCEPTED", "contact_joined", "contact_recently_active",
            "game_duo_invited", "game_duo_accepted", "game_league_result", "game_season_step", "game_mission_window",
            "community_invite", "GROUP_INVITE", "member_joined", "community_joined",
        )
        private val SYSTEM_TYPES: Set<String> = setOf(
            "security_alert", "login_new_device", "SYSTEM_ALERT", "password_changed",
            "two_factor_enabled", "two_factor_disabled", "system", "maintenance", "update_available",
            "report_resolved", "content_removed",
        )

        public fun of(rawType: String?): PushChannelCategory = when (rawType.orEmpty()) {
            in SOCIAL_TYPES -> SOCIAL
            in SYSTEM_TYPES -> SYSTEM
            else -> MESSAGES
        }
    }
}
