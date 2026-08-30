package me.meeshy.sdk.model

/**
 * Resolves whether an incoming notification of a given backend `type` string is enabled by
 * the user's PER-TYPE toggles — a faithful port of iOS
 * `UserNotificationPreferences.isTypeEnabled` (`UserNotificationPreferences+Filter.swift`),
 * the 80-case switch over `MeeshyNotificationType`.
 *
 * This is the wire-type→toggle resolver [NotificationToastPolicy] previously declared missing:
 * it keys directly on the raw wire string (both the lowercase canonical form and the legacy
 * uppercase alias) so no `MeeshyNotificationType` enum needs to exist on Android. The
 * unknown-type collapse reuses [NotificationTypeVocabulary.canonical] (iOS
 * `MeeshyNotificationType(rawValue:) ?? .system`): an unrecognised type is gated by
 * `systemEnabled`, exactly as iOS gates a decoded `.system`.
 *
 * SOTA over iOS: the switch is expressed once as data (type-set → predicate), built into an
 * immutable lookup at class-load, rather than an 80-arm `switch` re-walked on every call; a
 * unit test asserts the lookup covers every [NotificationTypeVocabulary.KNOWN_TYPES] entry so
 * a newly-added wire type can never silently fall through.
 *
 * Full iOS parity: incoming-call types are gated on `callsEnabled` and friend feed/story/mood
 * on `friendContentEnabled` — the two fields [UserNotificationPreferences] now carries. The
 * only remaining always-enabled types are the ones iOS itself leaves toggle-less (power-user
 * features — translation, transcription, voice-clone — plus gamification and the legacy
 * status/affiliate cases), exactly as its `isTypeEnabled` returns `true` for them.
 */
public object NotificationTypeToggle {

    private data class ToggleGroup(
        val types: Set<String>,
        val enabled: (UserNotificationPreferences) -> Boolean,
    )

    /** Known types that no per-type toggle governs (iOS `isTypeEnabled` returns `true`). */
    private val ALWAYS_ON: Set<String> = setOf(
        // Power-user features: no toggle yet, always allow (iOS parity).
        "translation_completed", "translation_ready", "TRANSLATION_READY",
        "transcription_completed", "voice_clone_ready",
        // Gamification + legacy status/affiliate: iOS `return true`.
        "achievement_unlocked", "ACHIEVEMENT_UNLOCKED", "streak_milestone", "badge_earned",
        "AFFILIATE_SIGNUP", "STATUS_UPDATE",
    )

    private val GROUPS: List<ToggleGroup> = listOf(
        ToggleGroup(
            setOf(
                "new_message", "NEW_MESSAGE",
                "message_edited", "message_deleted", "message_pinned", "message_forwarded",
            ),
        ) { it.newMessageEnabled },
        ToggleGroup(setOf("message_reply", "reply")) { it.replyEnabled },
        ToggleGroup(setOf("user_mentioned", "mention", "MENTION")) { it.mentionEnabled },
        ToggleGroup(setOf("message_reaction", "reaction", "MESSAGE_REACTION")) { it.reactionEnabled },
        ToggleGroup(setOf("post_like", "POST_LIKE")) { it.postLikeEnabled },
        ToggleGroup(setOf("post_comment", "POST_COMMENT", "story_new_comment", "friend_story_comment", "story_thread_reply")) { it.postCommentEnabled },
        ToggleGroup(setOf("post_repost")) { it.postRepostEnabled },
        ToggleGroup(setOf("story_reaction", "status_reaction", "STORY_REPLY")) { it.storyReactionEnabled },
        ToggleGroup(setOf("comment_reply")) { it.commentReplyEnabled },
        ToggleGroup(setOf("comment_like", "comment_reaction")) { it.commentLikeEnabled },
        ToggleGroup(setOf("missed_call", "CALL_MISSED", "call_ended", "call_declined")) { it.missedCallEnabled },
        ToggleGroup(setOf("incoming_call", "call", "CALL_INCOMING")) { it.callsEnabled },
        ToggleGroup(setOf("friend_new_story", "friend_new_post", "friend_new_mood")) { it.friendContentEnabled },
        ToggleGroup(
            setOf("contact_request", "friend_request", "FRIEND_REQUEST", "contact_accepted", "friend_accepted", "FRIEND_ACCEPTED"),
        ) { it.contactRequestEnabled },
        ToggleGroup(
            setOf("new_conversation", "new_conversation_direct", "new_conversation_group", "added_to_conversation", "removed_from_conversation"),
        ) { it.conversationEnabled },
        ToggleGroup(setOf("community_invite", "GROUP_INVITE")) { it.groupInviteEnabled },
        ToggleGroup(setOf("member_joined")) { it.memberJoinedEnabled },
        ToggleGroup(
            setOf("member_left", "member_removed", "member_promoted", "member_demoted", "member_role_changed", "community_joined", "community_left", "GROUP_JOINED", "GROUP_LEFT"),
        ) { it.memberLeftEnabled },
        ToggleGroup(
            setOf("security_alert", "login_new_device", "SYSTEM_ALERT", "password_changed", "two_factor_enabled", "two_factor_disabled", "system", "maintenance", "update_available"),
        ) { it.systemEnabled },
        ToggleGroup(ALWAYS_ON) { true },
    )

    private val BY_TYPE: Map<String, (UserNotificationPreferences) -> Boolean> =
        buildMap {
            GROUPS.forEach { group -> group.types.forEach { type -> put(type, group.enabled) } }
        }

    /**
     * Whether a notification of wire [type] passes the user's per-type toggles. An unknown
     * type is gated by `systemEnabled` (iOS's `rawValue ?? .system`); a known type with no
     * governing toggle is always enabled.
     */
    public fun isEnabled(type: String, preferences: UserNotificationPreferences): Boolean {
        val lens = BY_TYPE[type] ?: BY_TYPE[NotificationTypeVocabulary.canonical(type)]
        return lens?.invoke(preferences) ?: true
    }
}
