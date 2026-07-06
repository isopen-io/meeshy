package me.meeshy.sdk.model

/**
 * A per-event notification category, in display order (feature-parity §L). Mirrors the
 * grouping iOS uses in its notification-type settings: message activity, calls, social
 * (feed/stories), groups & contacts, then system.
 */
public enum class NotificationCategory { MESSAGES, CALLS, SOCIAL, GROUPS, SYSTEM }

/**
 * A single per-event notification type — the fine-grained toggles that live *under* the
 * top-level push master (which is exposed as its own row). Excludes push/sound/vibration/
 * new-message (already surfaced) and the display options (preview/sender/badge).
 */
public enum class NotificationType {
    REPLY,
    MENTION,
    REACTION,
    CONVERSATION,
    MISSED_CALL,
    VOICEMAIL,
    POST_LIKE,
    POST_COMMENT,
    POST_REPOST,
    STORY_REACTION,
    COMMENT_REPLY,
    COMMENT_LIKE,
    CONTACT_REQUEST,
    GROUP_INVITE,
    MEMBER_JOINED,
    MEMBER_LEFT,
    SYSTEM,
}

/** A notification type paired with its current on/off state read from the prefs block. */
public data class NotificationTypeState(
    val type: NotificationType,
    val enabled: Boolean,
)

/** A category header with its (possibly filtered) member types, in declared order. */
public data class NotificationCategorySection(
    val category: NotificationCategory,
    val items: List<NotificationTypeState>,
)

/**
 * The single source of truth mapping each [NotificationType] to its category and to the
 * getter/setter lens over the matching [UserNotificationPreferences] boolean.
 */
public data class NotificationTypeDescriptor(
    val type: NotificationType,
    val category: NotificationCategory,
    val get: (UserNotificationPreferences) -> Boolean,
    val set: (UserNotificationPreferences, Boolean) -> UserNotificationPreferences,
)

/**
 * Pure catalog of the per-event notification types. Provides:
 *  - the toggle lens ([toggle]/[isEnabled]) so a single edit read-modify-writes exactly one
 *    boolean and never clobbers the rest of the block,
 *  - the grouped/ordered/filtered projection ([sections]) driving the editor UI.
 *
 * Search is locale-aware without leaking string resources into the core: the caller injects
 * a [label] function (localized name per type); the catalog only owns the grouping, ordering
 * and the case-insensitive/trimmed `contains` match.
 */
public object NotificationTypeCatalog {

    public val descriptors: List<NotificationTypeDescriptor> = listOf(
        NotificationTypeDescriptor(
            NotificationType.REPLY, NotificationCategory.MESSAGES,
            { it.replyEnabled }, { p, e -> p.copy(replyEnabled = e) },
        ),
        NotificationTypeDescriptor(
            NotificationType.MENTION, NotificationCategory.MESSAGES,
            { it.mentionEnabled }, { p, e -> p.copy(mentionEnabled = e) },
        ),
        NotificationTypeDescriptor(
            NotificationType.REACTION, NotificationCategory.MESSAGES,
            { it.reactionEnabled }, { p, e -> p.copy(reactionEnabled = e) },
        ),
        NotificationTypeDescriptor(
            NotificationType.CONVERSATION, NotificationCategory.MESSAGES,
            { it.conversationEnabled }, { p, e -> p.copy(conversationEnabled = e) },
        ),
        NotificationTypeDescriptor(
            NotificationType.MISSED_CALL, NotificationCategory.CALLS,
            { it.missedCallEnabled }, { p, e -> p.copy(missedCallEnabled = e) },
        ),
        NotificationTypeDescriptor(
            NotificationType.VOICEMAIL, NotificationCategory.CALLS,
            { it.voicemailEnabled }, { p, e -> p.copy(voicemailEnabled = e) },
        ),
        NotificationTypeDescriptor(
            NotificationType.POST_LIKE, NotificationCategory.SOCIAL,
            { it.postLikeEnabled }, { p, e -> p.copy(postLikeEnabled = e) },
        ),
        NotificationTypeDescriptor(
            NotificationType.POST_COMMENT, NotificationCategory.SOCIAL,
            { it.postCommentEnabled }, { p, e -> p.copy(postCommentEnabled = e) },
        ),
        NotificationTypeDescriptor(
            NotificationType.POST_REPOST, NotificationCategory.SOCIAL,
            { it.postRepostEnabled }, { p, e -> p.copy(postRepostEnabled = e) },
        ),
        NotificationTypeDescriptor(
            NotificationType.STORY_REACTION, NotificationCategory.SOCIAL,
            { it.storyReactionEnabled }, { p, e -> p.copy(storyReactionEnabled = e) },
        ),
        NotificationTypeDescriptor(
            NotificationType.COMMENT_REPLY, NotificationCategory.SOCIAL,
            { it.commentReplyEnabled }, { p, e -> p.copy(commentReplyEnabled = e) },
        ),
        NotificationTypeDescriptor(
            NotificationType.COMMENT_LIKE, NotificationCategory.SOCIAL,
            { it.commentLikeEnabled }, { p, e -> p.copy(commentLikeEnabled = e) },
        ),
        NotificationTypeDescriptor(
            NotificationType.CONTACT_REQUEST, NotificationCategory.GROUPS,
            { it.contactRequestEnabled }, { p, e -> p.copy(contactRequestEnabled = e) },
        ),
        NotificationTypeDescriptor(
            NotificationType.GROUP_INVITE, NotificationCategory.GROUPS,
            { it.groupInviteEnabled }, { p, e -> p.copy(groupInviteEnabled = e) },
        ),
        NotificationTypeDescriptor(
            NotificationType.MEMBER_JOINED, NotificationCategory.GROUPS,
            { it.memberJoinedEnabled }, { p, e -> p.copy(memberJoinedEnabled = e) },
        ),
        NotificationTypeDescriptor(
            NotificationType.MEMBER_LEFT, NotificationCategory.GROUPS,
            { it.memberLeftEnabled }, { p, e -> p.copy(memberLeftEnabled = e) },
        ),
        NotificationTypeDescriptor(
            NotificationType.SYSTEM, NotificationCategory.SYSTEM,
            { it.systemEnabled }, { p, e -> p.copy(systemEnabled = e) },
        ),
    )

    private val byType: Map<NotificationType, NotificationTypeDescriptor> =
        descriptors.associateBy { it.type }

    /** The current on/off state of [type] in [prefs]. */
    public fun isEnabled(prefs: UserNotificationPreferences, type: NotificationType): Boolean =
        byType.getValue(type).get(prefs)

    /** Returns a copy of [prefs] with [type]'s boolean set to [enabled], all else unchanged. */
    public fun toggle(
        prefs: UserNotificationPreferences,
        type: NotificationType,
        enabled: Boolean,
    ): UserNotificationPreferences = byType.getValue(type).set(prefs, enabled)

    /**
     * Projects [prefs] into category-grouped sections in [NotificationCategory] display order,
     * each item in declared order and carrying its live enabled state. A blank/whitespace
     * [query] keeps everything; otherwise a category is dropped when none of its localized
     * [label]s contain the query (case-insensitive).
     */
    public fun sections(
        prefs: UserNotificationPreferences,
        query: String = "",
        label: (NotificationType) -> String = { it.name },
    ): List<NotificationCategorySection> {
        val normalized = query.trim().lowercase()
        val matching = descriptors.filter { descriptor ->
            normalized.isEmpty() || label(descriptor.type).lowercase().contains(normalized)
        }
        return NotificationCategory.entries.mapNotNull { category ->
            val items = matching
                .filter { it.category == category }
                .map { NotificationTypeState(it.type, it.get(prefs)) }
            if (items.isEmpty()) null else NotificationCategorySection(category, items)
        }
    }
}
