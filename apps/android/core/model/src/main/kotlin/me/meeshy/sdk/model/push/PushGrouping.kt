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
 * The app-icon badge a push carries : the unread conversations the gateway counted
 * (`unreadCount`), else the local count derived from the cache, never negative ; `0` when
 * the user turned badges off (clears a residual badge, same rule as iOS and the gateway).
 */
public object PushBadgePolicy {

    public fun badge(payload: PushPayload, preferences: UserNotificationPreferences, localUnreadConversations: Int?): Int? {
        if (!preferences.notificationBadgeEnabled) return 0
        return (payload.unreadCount ?: localUnreadConversations)?.coerceAtLeast(0)
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
