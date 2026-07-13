package me.meeshy.sdk.model

/**
 * Semantic accent colour for a notification row, keyed on its backend `type`
 * string — a faithful port of iOS `MeeshyNotificationType.accentHex`
 * (NotificationModels.swift). Both the current lowercase wire form
 * (`"new_message"`) and the historical uppercase alias (`"NEW_MESSAGE"`) resolve
 * to the same category colour, so a row never flips accent depending on which
 * form the gateway emitted.
 *
 * Returned as a bare 6-digit hex (no `#`) to match the rest of the Meeshy colour
 * pipeline (`DynamicColorGenerator`, `conversation.accentColor`); the Compose
 * layer bridges it via `hexColor(...)`. Any unknown/absent type falls back to the
 * brand indigo `6366F1` — the same "unknown → system" collapse iOS gets from
 * `MeeshyNotificationType(rawValue:) ?? .system`.
 */
public fun notificationTypeAccentHex(type: String): String = when (type) {
    // Messages, replies & message lifecycle → blue.
    "new_message", "NEW_MESSAGE", "message_reply", "reply",
    "post_comment", "POST_COMMENT", "comment_reply",
    "story_new_comment", "friend_story_comment", "story_thread_reply", "STORY_REPLY",
    "message_edited", "message_deleted", "message_pinned", "message_forwarded",
    -> "3498DB"

    // Reactions & likes → coral.
    "message_reaction", "MESSAGE_REACTION", "reaction",
    "post_like", "POST_LIKE", "story_reaction", "status_reaction",
    "comment_like", "comment_reaction",
    -> "FF6B6B"

    // Mentions & reposts → purple.
    "user_mentioned", "mention", "MENTION", "post_repost",
    -> "9B59B6"

    // Friend graph & conversation lifecycle → teal.
    "friend_request", "FRIEND_REQUEST", "contact_request",
    "friend_accepted", "FRIEND_ACCEPTED", "contact_accepted", "STATUS_UPDATE",
    "added_to_conversation", "new_conversation", "new_conversation_direct",
    "new_conversation_group", "removed_from_conversation",
    -> "4ECDC4"

    // Community, membership & achievements → gold.
    "community_invite", "community_joined", "community_left",
    "member_joined", "member_left", "member_removed", "member_promoted",
    "member_demoted", "member_role_changed",
    "GROUP_INVITE", "GROUP_JOINED", "GROUP_LEFT",
    "achievement_unlocked", "ACHIEVEMENT_UNLOCKED", "streak_milestone", "badge_earned",
    -> "F8B500"

    // Calls → pink.
    "missed_call", "CALL_MISSED", "call_declined",
    "incoming_call", "CALL_INCOMING", "call_ended",
    -> "E91E63"

    // Affiliate signup → green.
    "AFFILIATE_SIGNUP" -> "2ECC71"

    // Security & account → alert red.
    "security_alert", "login_new_device", "SYSTEM_ALERT",
    "password_changed", "two_factor_enabled", "two_factor_disabled",
    -> "EF4444"

    // Translation, transcription & voice pipeline → cyan.
    "translation_completed", "translation_ready", "TRANSLATION_READY",
    "transcription_completed", "voice_clone_ready",
    -> "08D9D6"

    // System & friend-new social content → brand indigo (explicit, matches iOS).
    "system", "maintenance", "update_available",
    "friend_new_story", "friend_new_post", "friend_new_mood",
    -> "6366F1"

    // Unknown / absent → brand indigo fallback (iOS: rawValue ?? .system).
    else -> "6366F1"
}
