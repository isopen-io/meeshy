package me.meeshy.sdk.model

/** Les groupes de canaux visibles dans les réglages système. */
public enum class NotificationChannelGroup(public val id: String) {
    MESSAGES("meeshy_group_messages"),
    SOCIAL("meeshy_group_social"),
    FRIENDS("meeshy_group_friends"),
    CALLS("meeshy_group_calls"),
    OTHERS("meeshy_group_others"),
}

/** L'importance d'un canal (valeurs `NotificationManager.IMPORTANCE_*` : LOW 2, DEFAULT 3, HIGH 4). */
public enum class NotificationChannelImportance(public val androidLevel: Int) {
    LOW(2),
    DEFAULT(3),
    HIGH(4),
}

public enum class NotificationChannelSound { DEFAULT, RINGTONE, NONE }

/** Un canal Android : son identifiant est immuable, ses réglages ne changent plus après création. */
public data class NotificationChannelSpec(
    val id: String,
    val group: NotificationChannelGroup,
    val importance: NotificationChannelImportance,
    val sound: NotificationChannelSound,
    val vibrate: Boolean,
)

/**
 * Le plan pur des canaux : chaque [MeeshyNotificationCategory] a UN canal, rangé dans un groupe. Les
 * identifiants `meeshy_messages_v2`, `meeshy_social_v2`, `meeshy_system_v2` et `meeshy_calls_v2`
 * sont ceux que l'app crée déjà ; `meeshy_notifications` (le canal v1 que la passerelle nomme
 * encore) n'est PAS dans le plan : il est supprimé à l'installation.
 */
public object NotificationChannelPlan {
    public const val MESSAGES: String = "meeshy_messages_v2"
    public const val MENTIONS: String = "meeshy_mentions"
    public const val EPHEMERAL: String = "meeshy_ephemeral"
    public const val FRIENDS: String = "meeshy_friends"
    public const val SOCIAL: String = "meeshy_social_v2"
    public const val CALLS: String = "meeshy_calls_v2"
    public const val CALLS_MISSED: String = "meeshy_calls_missed"
    public const val INVITATIONS: String = "meeshy_invitations"
    public const val SYSTEM: String = "meeshy_system_v2"

    private fun spec(
        id: String,
        group: NotificationChannelGroup,
        importance: NotificationChannelImportance,
        sound: NotificationChannelSound = NotificationChannelSound.DEFAULT,
        vibrate: Boolean = true,
    ) = NotificationChannelSpec(id, group, importance, sound, vibrate)

    public val channels: List<NotificationChannelSpec> = listOf(
        spec(MESSAGES, NotificationChannelGroup.MESSAGES, NotificationChannelImportance.HIGH),
        spec(MENTIONS, NotificationChannelGroup.MESSAGES, NotificationChannelImportance.HIGH),
        spec(
            EPHEMERAL, NotificationChannelGroup.MESSAGES, NotificationChannelImportance.LOW,
            sound = NotificationChannelSound.NONE, vibrate = false,
        ),
        spec(FRIENDS, NotificationChannelGroup.FRIENDS, NotificationChannelImportance.DEFAULT),
        spec(SOCIAL, NotificationChannelGroup.SOCIAL, NotificationChannelImportance.DEFAULT),
        spec(
            CALLS, NotificationChannelGroup.CALLS, NotificationChannelImportance.HIGH,
            sound = NotificationChannelSound.RINGTONE,
        ),
        spec(CALLS_MISSED, NotificationChannelGroup.CALLS, NotificationChannelImportance.HIGH),
        spec(INVITATIONS, NotificationChannelGroup.OTHERS, NotificationChannelImportance.DEFAULT),
        spec(SYSTEM, NotificationChannelGroup.OTHERS, NotificationChannelImportance.HIGH),
    )

    private val byId: Map<String, NotificationChannelSpec> = channels.associateBy { it.id }

    /** Le canal d'une catégorie ; la catégorie générique (et donc toute inconnue) rend le canal des messages. */
    public fun channelIdFor(category: MeeshyNotificationCategory): String = when (category) {
        MeeshyNotificationCategory.MESSAGE,
        MeeshyNotificationCategory.LOCATION,
        MeeshyNotificationCategory.AUDIO,
        MeeshyNotificationCategory.GENERIC,
        -> MESSAGES
        MeeshyNotificationCategory.MENTION -> MENTIONS
        MeeshyNotificationCategory.EPHEMERAL -> EPHEMERAL
        MeeshyNotificationCategory.FRIEND_REQUEST,
        MeeshyNotificationCategory.CONTACT,
        -> FRIENDS
        MeeshyNotificationCategory.SOCIAL,
        MeeshyNotificationCategory.SOCIAL_COMMENTABLE,
        -> SOCIAL
        MeeshyNotificationCategory.CALL_INCOMING -> CALLS
        MeeshyNotificationCategory.CALL_MISSED -> CALLS_MISSED
        MeeshyNotificationCategory.INVITATION -> INVITATIONS
        MeeshyNotificationCategory.SYSTEM -> SYSTEM
    }

    public fun channelFor(category: MeeshyNotificationCategory): NotificationChannelSpec =
        byId.getValue(channelIdFor(category))
}
