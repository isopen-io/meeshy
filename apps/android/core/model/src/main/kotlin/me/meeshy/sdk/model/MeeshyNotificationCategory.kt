package me.meeshy.sdk.model

/**
 * La taxonomie des catégories de notification, miroir de `MeeshyNotificationCategory`
 * (`apps/ios/Meeshy/AppDelegate.swift`) et de `pushCategoryForNotificationType` côté passerelle
 * (`services/gateway/.../push-header.ts`). Une catégorie inconnue (ancien binaire, type neuf de la
 * passerelle) tombe sur [GENERIC] : la notification est rangée, jamais perdue.
 *
 * [SYSTEM] n'existe pas côté iOS : c'est la famille « compte et sécurité » que le pipeline Android
 * rendait déjà sur son propre canal.
 */
public enum class MeeshyNotificationCategory(public val wire: String?) {
    MESSAGE("MEESHY_MESSAGE"),
    MENTION("MEESHY_MENTION"),
    FRIEND_REQUEST("MEESHY_FRIEND_REQUEST"),
    SOCIAL("MEESHY_SOCIAL"),
    SOCIAL_COMMENTABLE("MEESHY_SOCIAL_COMMENTABLE"),
    CALL_INCOMING("MEESHY_CALL_INCOMING"),
    CALL_MISSED("MEESHY_CALL_MISSED"),
    LOCATION("MEESHY_LOCATION"),
    CONTACT("MEESHY_CONTACT"),
    INVITATION("MEESHY_INVITE"),
    AUDIO("MEESHY_AUDIO"),
    EPHEMERAL("MEESHY_EPHEMERAL"),
    SYSTEM(null),
    GENERIC(null),
    ;

    public companion object {
        private val BY_WIRE: Map<String, MeeshyNotificationCategory> =
            entries.mapNotNull { category -> category.wire?.let { it to category } }.toMap() +
                ("MEESHY_CALL" to CALL_INCOMING) +
                ("MEESHY_LOCKED_CONVERSATION" to MESSAGE)

        private val MESSAGE_TYPES = setOf(
            "new_message", "message_reply", "reply", "message_forwarded", "message_reaction", "reaction",
            "new_conversation", "new_conversation_direct", "new_conversation_group", "added_to_conversation",
        )
        private val MENTION_TYPES = setOf("mention", "user_mentioned", "MENTION")
        private val FRIEND_REQUEST_TYPES = setOf("friend_request", "contact_request", "FRIEND_REQUEST")
        private val CONTACT_TYPES = setOf(
            "contact_accepted", "friend_accepted", "FRIEND_ACCEPTED", "contact_joined", "contact_recently_active",
        )
        private val INVITATION_TYPES = setOf("community_invite", "GROUP_INVITE", "member_joined", "community_joined")
        private val SOCIAL_TYPES = setOf(
            "post_like", "POST_LIKE", "post_comment", "POST_COMMENT", "post_repost",
            "story_reaction", "status_reaction", "STORY_REPLY", "comment_reply", "comment_like", "comment_reaction",
            "story_new_comment", "friend_story_comment", "story_thread_reply",
            "friend_content_reaction", "friend_content_share", "friend_content_repost", "friend_content_quote",
            "friend_new_story", "friend_new_post", "friend_new_mood",
            "game_duo_invited", "game_duo_accepted", "game_league_result", "game_season_step", "game_mission_window",
        )
        private val COMMENTABLE_TYPES = setOf("post_comment", "POST_COMMENT", "story_new_comment", "friend_story_comment")
        private val CALL_INCOMING_TYPES = setOf("incoming_call", "call_incoming")
        private val CALL_MISSED_TYPES = setOf("missed_call", "call_ended", "call_declined", "call_recording_ready")
        private val SYSTEM_TYPES = setOf(
            "security_alert", "login_new_device", "SYSTEM_ALERT", "password_changed",
            "two_factor_enabled", "two_factor_disabled", "system", "maintenance", "update_available",
            "report_resolved", "content_removed",
        )

        /** La catégorie qu'un identifiant `MEESHY_*` nomme ; `null` pour toute autre chaîne. */
        public fun fromWire(raw: String?): MeeshyNotificationCategory? = raw?.let { BY_WIRE[it] }

        /**
         * La catégorie d'un push : l'identifiant `MEESHY_*` s'il est connu, sinon dérivée du `type`
         * de la passerelle. Un message à durée de vie ([ephemeral]) ou un vocal ([audio]) se range
         * dans sa catégorie de contenu ; tout le reste inconnu est [GENERIC].
         */
        public fun of(
            rawCategory: String? = null,
            type: String? = null,
            ephemeral: Boolean = false,
            audio: Boolean = false,
        ): MeeshyNotificationCategory {
            fromWire(rawCategory)?.let { return it }
            val raw = type.orEmpty()
            return when {
                raw in MESSAGE_TYPES -> when {
                    ephemeral -> EPHEMERAL
                    audio -> AUDIO
                    else -> MESSAGE
                }
                raw in MENTION_TYPES -> MENTION
                raw in FRIEND_REQUEST_TYPES -> FRIEND_REQUEST
                raw in CONTACT_TYPES -> CONTACT
                raw in INVITATION_TYPES -> INVITATION
                raw in COMMENTABLE_TYPES -> SOCIAL_COMMENTABLE
                raw in SOCIAL_TYPES -> SOCIAL
                raw in CALL_INCOMING_TYPES -> CALL_INCOMING
                raw in CALL_MISSED_TYPES -> CALL_MISSED
                raw in SYSTEM_TYPES -> SYSTEM
                else -> GENERIC
            }
        }
    }
}
