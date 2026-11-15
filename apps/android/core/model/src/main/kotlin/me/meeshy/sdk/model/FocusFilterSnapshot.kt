package me.meeshy.sdk.model

/**
 * Minimal snapshot of the user's Focus filter — port of FocusFilterSnapshot
 * (UserNotificationPreferences+Filter.swift). Carries which notification
 * categories are currently allowed.
 *
 * Android has no Focus intent: the system Do-Not-Disturb mode (the notification
 * manager's interruption filter) is projected onto this same table by
 * [fromInterruptionFilter], so one rule governs both platforms.
 */
data class FocusFilterSnapshot(
    val allowDirectMessages: Boolean = true,
    val allowGroupMessages: Boolean = true,
    val allowMentions: Boolean = true,
    val allowReactions: Boolean = true,
    val allowSocial: Boolean = true,
    val allowCalls: Boolean = true,
    val isActive: Boolean = false,
) {

    /**
     * Whether this filter lets a notification of wire [rawType] through — iOS
     * `FocusFilterSnapshot.allows(type:isDirectConversation:)`. An inactive filter is a
     * no-op; contacts, communities, system and unknown types always pass while a filter
     * is active (rare and worth surfacing).
     */
    fun allows(rawType: String?, isDirectConversation: Boolean): Boolean {
        if (!isActive) return true
        val type = rawType.orEmpty()
        return when (type) {
            in MESSAGE_TYPES -> if (isDirectConversation) allowDirectMessages else allowGroupMessages
            in MENTION_TYPES -> allowMentions
            in REACTION_TYPES -> allowReactions
            in SOCIAL_TYPES -> allowSocial
            in CALL_TYPES -> allowCalls
            else -> true
        }
    }

    companion object {
        val PERMISSIVE = FocusFilterSnapshot()

        // Valeurs de `android.app.NotificationManager.INTERRUPTION_FILTER_*`, recopiées pour
        // garder ce module en Kotlin pur.
        const val INTERRUPTION_FILTER_UNKNOWN: Int = 0
        const val INTERRUPTION_FILTER_ALL: Int = 1
        const val INTERRUPTION_FILTER_PRIORITY: Int = 2
        const val INTERRUPTION_FILTER_NONE: Int = 3
        const val INTERRUPTION_FILTER_ALARMS: Int = 4

        /**
         * Projects the system interruption filter onto the Focus table : `ALL` (or a filter
         * the system could not report) is permissive ; `PRIORITY` keeps what a priority
         * contact expects to reach them (direct messages, mentions, calls) ; `NONE` and
         * `ALARMS` silence every governed category.
         */
        fun fromInterruptionFilter(filter: Int): FocusFilterSnapshot = when (filter) {
            INTERRUPTION_FILTER_PRIORITY -> FocusFilterSnapshot(
                allowDirectMessages = true,
                allowGroupMessages = false,
                allowMentions = true,
                allowReactions = false,
                allowSocial = false,
                allowCalls = true,
                isActive = true,
            )
            INTERRUPTION_FILTER_NONE, INTERRUPTION_FILTER_ALARMS -> FocusFilterSnapshot(
                allowDirectMessages = false,
                allowGroupMessages = false,
                allowMentions = false,
                allowReactions = false,
                allowSocial = false,
                allowCalls = false,
                isActive = true,
            )
            else -> PERMISSIVE
        }

        private val MESSAGE_TYPES: Set<String> = setOf(
            "new_message", "NEW_MESSAGE", "message_reply", "reply",
            "message_edited", "message_deleted", "message_pinned", "message_forwarded",
        )
        private val MENTION_TYPES: Set<String> = setOf("user_mentioned", "mention", "MENTION")
        private val REACTION_TYPES: Set<String> = setOf(
            "message_reaction", "reaction", "MESSAGE_REACTION",
            "story_reaction", "status_reaction", "comment_like", "post_like", "POST_LIKE",
        )
        private val SOCIAL_TYPES: Set<String> = setOf(
            "post_comment", "POST_COMMENT", "post_repost", "comment_reply", "STORY_REPLY",
        )
        private val CALL_TYPES: Set<String> = setOf(
            "missed_call", "CALL_MISSED", "incoming_call", "call", "call_ended", "call_declined", "CALL_INCOMING",
        )
    }
}
