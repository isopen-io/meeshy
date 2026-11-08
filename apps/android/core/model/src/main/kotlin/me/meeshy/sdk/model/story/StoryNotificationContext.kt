package me.meeshy.sdk.model.story

import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.MeeshyNotificationType
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.sdk.model.push.PushPayload

/**
 * L'instantané de la notification nécessaire pour dessiner l'écran cible même quand la story n'existe plus
 * (miroir de iOS `StoryNotificationContext`) : QUI a agi et CE QUI l'a déclenché (une réaction ou un commentaire).
 */
data class StoryNotificationContext(
    val actorAvatar: String?,
    val actorDisplayName: String,
    val trigger: Trigger,
    val occurredAtMillis: Long,
) {
    sealed interface Trigger {
        data class Reaction(val emoji: String) : Trigger
        data class Comment(val preview: String) : Trigger
    }

    companion object {
        const val DEFAULT_REACTION_EMOJI: String = "❤️"

        private val REACTION_TYPES = setOf(MeeshyNotificationType.STORY_REACTION, MeeshyNotificationType.STATUS_REACTION)

        /** Chaque repli produit une valeur d'affichage : l'écran sait toujours se dessiner. */
        fun from(notification: ApiNotification, nowMillis: Long): StoryNotificationContext {
            val metadata = notification.metadata
            val trigger = if (notification.notificationType in REACTION_TYPES) {
                Trigger.Reaction(
                    metadata?.reactionEmoji.presentOrNull() ?: metadata?.emoji.presentOrNull() ?: DEFAULT_REACTION_EMOJI,
                )
            } else {
                Trigger.Comment(metadata?.commentPreview.presentOrNull() ?: metadata?.messagePreview.presentOrNull().orEmpty())
            }
            val actor = notification.actor
            return StoryNotificationContext(
                actorAvatar = actor?.avatar.presentOrNull(),
                actorDisplayName = actor?.displayName.presentOrNull() ?: actor?.username.presentOrNull().orEmpty(),
                trigger = trigger,
                occurredAtMillis = isoToEpochMillisOrNull(notification.state.createdAt) ?: nowMillis,
            )
        }

        /** Le même instantané depuis la charge d'un push (toucher d'une bannière système). */
        fun from(payload: PushPayload, nowMillis: Long): StoryNotificationContext {
            val type = payload.type.orEmpty()
            val trigger = if (type == "story_reaction" || type == "status_reaction") {
                Trigger.Reaction(DEFAULT_REACTION_EMOJI)
            } else {
                Trigger.Comment(payload.body.presentOrNull().orEmpty())
            }
            return StoryNotificationContext(
                actorAvatar = payload.senderAvatar.presentOrNull(),
                actorDisplayName = payload.senderDisplayName.presentOrNull() ?: payload.senderUsername.presentOrNull().orEmpty(),
                trigger = trigger,
                occurredAtMillis = isoToEpochMillisOrNull(payload.createdAt) ?: nowMillis,
            )
        }

        private fun String?.presentOrNull(): String? = this?.takeIf { it.isNotBlank() }
    }
}
