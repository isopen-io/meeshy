package me.meeshy.sdk.model

/**
 * The complete set of backend notification `type` strings the app understands — a
 * faithful port of every `MeeshyNotificationType` raw value (67 canonical + 14 legacy
 * uppercase aliases, `NotificationModels.swift`). It exists so the category filter can
 * reproduce iOS's decode-then-fallback exactly: iOS resolves a row's category via
 * `MeeshyNotificationType(rawValue: type) ?? .system`, so an UNKNOWN wire type collapses
 * onto the `system` category while a KNOWN-but-uncategorised type keeps its own identity
 * (and therefore matches no default chip).
 */
public object NotificationTypeVocabulary {

    /**
     * Types that belong to no default filter chip but are still recognised wire values —
     * they surface only under [NotificationFilterCategory.ALL] (and [UNREAD] when unread),
     * exactly as on iOS, where their enum case is in no category's `matchingTypes`.
     */
    public val UNCATEGORIZED: Set<String> = setOf(
        "new_conversation_direct", "new_conversation_group", "comment_reaction",
        "story_new_comment", "friend_story_comment", "story_thread_reply",
        "friend_new_story", "friend_new_post", "friend_new_mood",
    )

    /** Every recognised wire type: the union of the chip sets plus the uncategorised ones. */
    public val KNOWN_TYPES: Set<String> =
        NotificationFilterCategory.defaultChipTypes + UNCATEGORIZED

    /**
     * Collapses an unrecognised type onto `"system"` (iOS `rawValue ?? .system`); a known
     * type is returned unchanged so it keeps its own category identity.
     */
    public fun canonical(type: String): String = if (type in KNOWN_TYPES) type else "system"
}

/**
 * One notification-center filter chip — a faithful port of iOS `NotificationCategory`
 * (`MeeshyUI/Notifications/NotificationListView.swift`). Each chip owns the set of backend
 * `type` strings it accepts ([matchingTypes]) and a [matches] predicate; [filter] projects a
 * loaded list exactly like iOS `NotificationListViewModel.filteredNotifications`.
 *
 * SOTA over iOS: the per-chip type sets are built once as immutable statics (iOS rebuilds a
 * `Set` on every `matchingTypes` access inside a `switch`), and the unknown→system collapse is
 * an explicit, unit-tested [NotificationTypeVocabulary.canonical] step rather than an implicit
 * enum-decode side effect.
 *
 * [accentHex] mirrors iOS's per-category `color` (bare 6-digit hex, bridged to Compose via
 * `hexColor(...)` like the rest of the Meeshy colour pipeline).
 */
public enum class NotificationFilterCategory(public val accentHex: String) {
    ALL("6366F1"),
    UNREAD("FF6B6B"),
    MESSAGES("3498DB"),
    REACTIONS("FF6B6B"),
    MENTIONS("9B59B6"),
    SOCIAL("F8B500"),
    CONTACTS("4ECDC4"),
    GROUPS("F8B500"),
    CALLS("E91E63"),
    TRANSLATIONS("08D9D6"),
    SYSTEM("6366F1");

    /**
     * The backend `type` strings this chip accepts. [ALL]/[UNREAD] accept every known type
     * (they never narrow by type — [UNREAD] narrows by read state instead, see [filter]).
     */
    public val matchingTypes: Set<String>
        get() = DEFAULT_MATCHING[this] ?: NotificationTypeVocabulary.KNOWN_TYPES

    /** iOS `matches`: does a row of this [type] belong to this chip (after unknown→system)? */
    public fun matches(type: String): Boolean =
        matchingTypes.contains(NotificationTypeVocabulary.canonical(type))

    /**
     * iOS `filteredNotifications`: [ALL] keeps every row, [UNREAD] keeps only unread rows
     * (any type), every other chip keeps only rows whose type [matches] — read or not.
     * Input order is preserved.
     */
    public fun filter(notifications: List<ApiNotification>): List<ApiNotification> = when (this) {
        ALL -> notifications
        UNREAD -> notifications.filter { !it.state.isRead }
        else -> notifications.filter { matches(it.type) }
    }

    public companion object {

        private val DEFAULT_MATCHING: Map<NotificationFilterCategory, Set<String>> = mapOf(
            MESSAGES to setOf(
                "new_message", "NEW_MESSAGE", "message_reply", "reply",
                "message_edited", "message_deleted", "message_pinned", "message_forwarded",
            ),
            REACTIONS to setOf(
                "message_reaction", "reaction", "MESSAGE_REACTION",
                "post_like", "POST_LIKE", "story_reaction", "status_reaction", "comment_like",
            ),
            MENTIONS to setOf(
                "user_mentioned", "mention", "MENTION",
            ),
            SOCIAL to setOf(
                "post_comment", "POST_COMMENT", "post_repost", "comment_reply", "STORY_REPLY",
            ),
            CONTACTS to setOf(
                "friend_request", "contact_request", "FRIEND_REQUEST",
                "friend_accepted", "contact_accepted", "FRIEND_ACCEPTED", "STATUS_UPDATE",
            ),
            GROUPS to setOf(
                "community_invite", "community_joined", "community_left",
                "GROUP_INVITE", "GROUP_JOINED", "GROUP_LEFT",
                "member_joined", "member_left", "member_removed",
                "member_promoted", "member_demoted", "member_role_changed",
                "added_to_conversation", "new_conversation", "removed_from_conversation",
            ),
            CALLS to setOf(
                "missed_call", "call_declined", "CALL_MISSED",
                "incoming_call", "call", "call_ended", "CALL_INCOMING",
            ),
            TRANSLATIONS to setOf(
                "translation_completed", "translation_ready", "TRANSLATION_READY",
                "transcription_completed", "voice_clone_ready",
            ),
            SYSTEM to setOf(
                "security_alert", "login_new_device", "SYSTEM_ALERT",
                "password_changed", "two_factor_enabled", "two_factor_disabled",
                "system", "maintenance", "update_available",
                "achievement_unlocked", "ACHIEVEMENT_UNLOCKED", "streak_milestone", "badge_earned",
                "AFFILIATE_SIGNUP",
            ),
        )

        /** Union of every default chip's accepted types (the categorised half of the vocabulary). */
        public val defaultChipTypes: Set<String> =
            DEFAULT_MATCHING.values.flatMapTo(mutableSetOf()) { it }
    }
}
