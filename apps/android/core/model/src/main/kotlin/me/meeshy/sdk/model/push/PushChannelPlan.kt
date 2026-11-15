package me.meeshy.sdk.model.push

import me.meeshy.sdk.model.MeeshyNotificationCategory
import me.meeshy.sdk.model.NotificationChannelImportance
import me.meeshy.sdk.model.NotificationChannelPlan

/** Le canal et l'importance sur lesquels un push est rendu. */
public data class PushChannelAssignment(val channelId: String, val importance: NotificationChannelImportance)

/**
 * Type de push -> canal et importance : messages et mentions/réponses HIGH, social et contacts/groupes DEFAULT,
 * système selon le plan. Un type inconnu retombe sur le canal des messages, jamais perdu.
 */
public object PushChannelPlan {

    public fun assign(type: String?, ephemeral: Boolean = false): PushChannelAssignment {
        val id = NotificationChannelPlan.channelIdFor(MeeshyNotificationCategory.of(type = type, ephemeral = ephemeral))
        val importance = NotificationChannelPlan.channels.firstOrNull { it.id == id }?.importance
            ?: NotificationChannelImportance.HIGH
        return PushChannelAssignment(id, importance)
    }
}
