package me.meeshy.sdk.model

/**
 * L'ensemble des types de notification que l'application comprend — chaque valeur de
 * [MeeshyNotificationType] (miroir de `MeeshyNotificationType` iOS). Il reproduit le
 * « décoder, sinon `system` » d'iOS (`MeeshyNotificationType(rawValue:) ?? .system`) : un type
 * INCONNU se replie sur la catégorie `system`, un type connu garde son identité.
 *
 * Depuis ce lot, chaque type connu appartient à une catégorie : plus aucun type de story ou de
 * contenu d'ami n'est orphelin.
 */
public object NotificationTypeVocabulary {

    /** Chaque type reconnu — dérivé de l'énumération, jamais recopié. */
    public val KNOWN_TYPES: Set<String> = MeeshyNotificationType.entries.mapTo(linkedSetOf()) { it.wire }

    /** Replie un type inconnu sur `"system"` ; un type connu est rendu tel quel. */
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
    ENGAGEMENT("FBBF24"),
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

    /**
     * La loi que la passerelle applique ([serverQuery]), rejouée sur une ligne reçue par le
     * socket ou modifiée par un geste optimiste : une ligne LUE d'une famille consommable n'est
     * plus acceptée ; [UNREAD] ne garde que le non lu ; une catégorie garde ses types.
     */
    public fun accepts(notification: ApiNotification): Boolean {
        if (isConsumed(notification)) return false
        return when (this) {
            ALL -> true
            UNREAD -> !notification.state.isRead
            else -> matches(notification.type)
        }
    }

    /**
     * Les paramètres de `GET /notifications` qui rendent CETTE catégorie. Les types partent
     * TRIÉS : une même catégorie formule toujours la même requête.
     */
    public val serverQuery: NotificationListQuery
        get() = when (this) {
            ALL -> NotificationListQuery(unreadOnly = false, types = emptyList(), hideReadTypes = CONSUMED_ON_READ_TYPES.sorted())
            UNREAD -> NotificationListQuery(unreadOnly = true, types = emptyList(), hideReadTypes = emptyList())
            else -> NotificationListQuery(
                unreadOnly = false,
                types = matchingTypes.sorted(),
                hideReadTypes = matchingTypes.intersect(CONSUMED_ON_READ_TYPES).sorted(),
            )
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
                "comment_reaction",
            ),
            MENTIONS to setOf(
                "user_mentioned", "mention", "MENTION",
            ),
            SOCIAL to setOf(
                "post_comment", "POST_COMMENT", "post_repost", "comment_reply", "STORY_REPLY",
                "story_new_comment", "friend_story_comment", "story_thread_reply",
                "friend_new_story", "friend_new_post", "friend_new_mood",
            ),
            ENGAGEMENT to setOf(
                "achievement_unlocked", "ACHIEVEMENT_UNLOCKED", "streak_milestone", "level_up", "badge_earned",
                "game_duo_invited", "game_duo_accepted", "game_league_result", "game_season_step",
                "game_mission_window",
            ),
            CONTACTS to setOf(
                "friend_request", "contact_request", "FRIEND_REQUEST",
                "friend_accepted", "contact_accepted", "FRIEND_ACCEPTED",
                "contact_joined", "contact_recently_active", "STATUS_UPDATE",
            ),
            GROUPS to setOf(
                "community_invite", "community_joined", "community_left",
                "GROUP_INVITE", "GROUP_JOINED", "GROUP_LEFT",
                "member_joined", "member_left", "member_removed",
                "member_promoted", "member_demoted", "member_role_changed",
                "added_to_conversation", "new_conversation", "new_conversation_direct",
                "new_conversation_group", "removed_from_conversation",
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
                "system", "maintenance", "update_available", "report_resolved", "content_removed",
                "AFFILIATE_SIGNUP",
            ),
        )

        /**
         * Les familles dont une ligne LUE quitte la cloche : le contenu a été ouvert, la
         * notification n'a plus rien à dire (#8958).
         */
        public val CONSUMED_ON_READ: List<NotificationFilterCategory> = listOf(MESSAGES, REACTIONS, MENTIONS, SOCIAL)

        public val CONSUMED_ON_READ_TYPES: Set<String> =
            CONSUMED_ON_READ.flatMapTo(linkedSetOf()) { DEFAULT_MATCHING.getValue(it) }

        /** Une ligne lue d'une famille consommable — elle ne s'affiche plus. */
        public fun isConsumed(notification: ApiNotification): Boolean =
            notification.state.isRead && notification.type in CONSUMED_ON_READ_TYPES

        /** Union of every default chip's accepted types (the categorised half of the vocabulary). */
        public val defaultChipTypes: Set<String> =
            DEFAULT_MATCHING.values.flatMapTo(mutableSetOf()) { it }
    }
}

/** Ce qu'une catégorie demande à la passerelle (`GET /notifications`). */
public data class NotificationListQuery(
    val unreadOnly: Boolean,
    val types: List<String>,
    val hideReadTypes: List<String>,
)
