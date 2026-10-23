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
    "contact_joined", "contact_recently_active",
    "added_to_conversation", "new_conversation", "new_conversation_direct",
    "new_conversation_group", "removed_from_conversation",
    -> "4ECDC4"

    // Community, membership & achievements → gold.
    "community_invite", "community_joined", "community_left",
    "member_joined", "member_left", "member_removed", "member_promoted",
    "member_demoted", "member_role_changed",
    "GROUP_INVITE", "GROUP_JOINED", "GROUP_LEFT",
    -> "F8B500"

    // Engagement (succès, séries, niveaux, jeu) → ambre des badges de « Progression »,
    // distinct de la famille communauté : un badge ne ressemble plus à une invitation.
    "achievement_unlocked", "ACHIEVEMENT_UNLOCKED", "streak_milestone", "badge_earned", "level_up",
    "game_duo_invited", "game_duo_accepted", "game_league_result", "game_season_step",
    "game_mission_window",
    -> "FBBF24"

    // Calls → pink.
    "missed_call", "CALL_MISSED", "call_declined",
    "incoming_call", "call", "CALL_INCOMING", "call_ended",
    -> "E91E63"

    // Affiliate signup → green.
    "AFFILIATE_SIGNUP" -> "2ECC71"

    // Security & account → alert red.
    "security_alert", "login_new_device", "SYSTEM_ALERT",
    "password_changed", "two_factor_enabled", "two_factor_disabled",
    "content_removed",
    -> "EF4444"

    // Translation, transcription & voice pipeline → cyan.
    "translation_completed", "translation_ready", "TRANSLATION_READY",
    "transcription_completed", "voice_clone_ready",
    -> "08D9D6"

    // System & friend-new social content → brand indigo (explicit, matches iOS).
    "system", "maintenance", "update_available", "report_resolved",
    "friend_new_story", "friend_new_post", "friend_new_mood",
    -> "6366F1"

    // Unknown / absent → brand indigo fallback (iOS: rawValue ?? .system).
    else -> "6366F1"
}

/**
 * Le glyphe d'un type de notification — miroir de `MeeshyNotificationType.systemIcon` (iOS),
 * en clés neutres que la couche Compose projette sur une icône (Material), sans que
 * `:core:model` ne connaisse d'icône.
 */
public enum class NotificationGlyph {
    MESSAGE, REACTION, MENTION, FRIEND_REQUEST, FRIENDS, CONTACT_JOINED, CONTACT_ACTIVE, GROUP, MEMBER_JOINED,
    MEMBER_LEFT, MISSED_CALL, CALL, LIKE, COMMENT, STORY, POST, MOOD, TROPHY, MEDAL, STREAK, STAR,
    GAME_DUO, GAME_SEASON, GAME_TIMER, TRANSLATION, ALERT, BELL, REPORT_RESOLVED, CONTENT_REMOVED, AFFILIATE,
    DOT, WAVEFORM, REPOST, CONVERSATION, MEMBER_DEMOTED, MEMBER_ROLE, EDITED, DELETED, PINNED, FORWARDED, REPLY,
}

/** Le glyphe de [type] (valeur brute du fil) ; un type inconnu prend celui de `system`. */
public fun notificationTypeGlyph(type: String): NotificationGlyph = when (type) {
    "new_message", "NEW_MESSAGE", "message_reply" -> NotificationGlyph.MESSAGE
    "message_reaction", "reaction", "MESSAGE_REACTION", "comment_reaction" -> NotificationGlyph.REACTION
    "user_mentioned", "mention", "MENTION" -> NotificationGlyph.MENTION
    "friend_request", "contact_request", "FRIEND_REQUEST" -> NotificationGlyph.FRIEND_REQUEST
    "friend_accepted", "contact_accepted", "FRIEND_ACCEPTED", "game_duo_invited", "game_duo_accepted" ->
        NotificationGlyph.FRIENDS
    "contact_joined" -> NotificationGlyph.CONTACT_JOINED
    "contact_recently_active" -> NotificationGlyph.CONTACT_ACTIVE
    "community_invite", "GROUP_INVITE" -> NotificationGlyph.GROUP
    "community_joined", "member_joined", "GROUP_JOINED" -> NotificationGlyph.MEMBER_JOINED
    "community_left", "member_left", "GROUP_LEFT", "removed_from_conversation", "member_removed" ->
        NotificationGlyph.MEMBER_LEFT
    "missed_call", "call_declined", "CALL_MISSED" -> NotificationGlyph.MISSED_CALL
    "incoming_call", "call", "call_ended", "CALL_INCOMING" -> NotificationGlyph.CALL
    "post_like", "POST_LIKE", "story_reaction", "status_reaction", "comment_like" -> NotificationGlyph.LIKE
    "post_comment", "comment_reply", "POST_COMMENT", "STORY_REPLY", "story_new_comment",
    "friend_story_comment", "story_thread_reply",
    -> NotificationGlyph.COMMENT
    "friend_new_story" -> NotificationGlyph.STORY
    "friend_new_post" -> NotificationGlyph.POST
    "friend_new_mood" -> NotificationGlyph.MOOD
    "achievement_unlocked", "ACHIEVEMENT_UNLOCKED", "game_league_result" -> NotificationGlyph.TROPHY
    "badge_earned" -> NotificationGlyph.MEDAL
    "streak_milestone" -> NotificationGlyph.STREAK
    "level_up", "member_promoted" -> NotificationGlyph.STAR
    "game_season_step" -> NotificationGlyph.GAME_SEASON
    "game_mission_window" -> NotificationGlyph.GAME_TIMER
    "translation_completed", "translation_ready", "TRANSLATION_READY", "transcription_completed" ->
        NotificationGlyph.TRANSLATION
    "security_alert", "login_new_device", "SYSTEM_ALERT", "password_changed", "two_factor_enabled",
    "two_factor_disabled",
    -> NotificationGlyph.ALERT
    "report_resolved" -> NotificationGlyph.REPORT_RESOLVED
    "content_removed" -> NotificationGlyph.CONTENT_REMOVED
    "AFFILIATE_SIGNUP" -> NotificationGlyph.AFFILIATE
    "STATUS_UPDATE" -> NotificationGlyph.DOT
    "voice_clone_ready" -> NotificationGlyph.WAVEFORM
    "post_repost" -> NotificationGlyph.REPOST
    "added_to_conversation", "new_conversation", "new_conversation_direct", "new_conversation_group" ->
        NotificationGlyph.CONVERSATION
    "member_demoted" -> NotificationGlyph.MEMBER_DEMOTED
    "member_role_changed" -> NotificationGlyph.MEMBER_ROLE
    "message_edited" -> NotificationGlyph.EDITED
    "message_deleted" -> NotificationGlyph.DELETED
    "message_pinned" -> NotificationGlyph.PINNED
    "message_forwarded" -> NotificationGlyph.FORWARDED
    "reply" -> NotificationGlyph.REPLY
    else -> NotificationGlyph.BELL
}
