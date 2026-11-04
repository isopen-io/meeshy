package me.meeshy.sdk.model

/** Un geste de rangée : exécuté par l'hôte, jamais par le modèle. */
public sealed interface NotificationQuickAction {
    public data class Connect(val userId: String) : NotificationQuickAction
    public data class Write(val userId: String) : NotificationQuickAction
}

/**
 * Les gestes qu'une rangée propose — miroir de `APINotification.quickActions(isFriend:)` : un
 * contact qui vient de rejoindre Meeshy se salue ou se rejoint ; le badge « Invités venus » nomme
 * la personne venue par votre lien (déjà amis ⇒ « Écrire » seul).
 */
public fun ApiNotification.quickActions(isFriend: Boolean): List<NotificationQuickAction> {
    val userId = actor?.id?.takeIf { it.isNotBlank() } ?: return emptyList()
    return when {
        notificationType == MeeshyNotificationType.CONTACT_JOINED ->
            listOf(NotificationQuickAction.Connect(userId), NotificationQuickAction.Write(userId))
        notificationType == MeeshyNotificationType.BADGE_EARNED && metadata?.axisKey in INVITE_JOINED_AXES ->
            if (isFriend) listOf(NotificationQuickAction.Write(userId))
            else listOf(NotificationQuickAction.Write(userId), NotificationQuickAction.Connect(userId))
        else -> emptyList()
    }
}

/** La clé d'axe telle que la passerelle la sert (`social.invite_joined`) et ses graphies tolérées. */
private val INVITE_JOINED_AXES = setOf("social.invite_joined", "invite_joined", "inviteJoined")
