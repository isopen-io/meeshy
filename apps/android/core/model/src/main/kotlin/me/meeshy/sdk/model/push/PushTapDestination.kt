package me.meeshy.sdk.model.push

import me.meeshy.sdk.model.game.GameTarget

/**
 * Où mène le toucher d'une notification système : la table `type × identifiants → destination`
 * de l'application, miroir de iOS `RootNotificationNavigator.navigateFromNotification` et de
 * `NotificationContentRouter`. Pure : la plateforme lit les extras du toucher, ce module décide.
 *
 * Le TYPE n'est jamais le discriminant de l'entité : le fan-out de commentaires émet
 * `story_thread_reply` pour n'importe quel contenu, réel compris. Seul `postType` dit lequel.
 */
public sealed interface PushTapDestination {
    public data class Conversation(val conversationId: String, val highlightMessageId: String?) : PushTapDestination
    public data class Post(val postId: String) : PushTapDestination
    public data class Reel(val postId: String) : PushTapDestination
    public data class Story(val userId: String) : PushTapDestination
    public data class Mood(val statusId: String) : PushTapDestination
    public data class Profile(val userId: String) : PushTapDestination
    public data object Notifications : PushTapDestination
    public data class Game(val target: GameTarget) : PushTapDestination
    public data object None : PushTapDestination

    public companion object {
        private val CONVERSATION_TYPES = setOf(
            "new_message", "message_reply", "reply", "story_reply",
            "message_edited", "message_deleted", "message_pinned", "message_forwarded",
            "user_mentioned", "mention", "message_reaction", "reaction",
            "translation_completed", "translation_ready", "transcription_completed",
            "missed_call", "call_declined", "incoming_call", "call_ended", "call",
            "added_to_conversation", "new_conversation", "new_conversation_direct", "new_conversation_group",
            "removed_from_conversation",
            "community_invite", "community_joined", "community_left",
            "member_joined", "member_left", "member_removed", "member_promoted", "member_demoted",
            "member_role_changed",
        )

        private val RELATION_TYPES = setOf(
            "friend_request", "contact_request", "friend_accepted", "contact_accepted", "status_update",
            "contact_joined", "contact_recently_active",
        )

        private val ACCOUNT_TYPES = setOf(
            "security_alert", "login_new_device", "system_alert", "password_changed",
            "two_factor_enabled", "two_factor_disabled", "system", "maintenance", "update_available",
            "voice_clone_ready", "report_resolved",
        )

        private const val PROGRESSION_ROUTE = "progression"
        private val EPHEMERAL_ENTITIES = setOf("STORY", "STATUS", "MOOD")

        public fun resolve(payload: PushPayload, routeHint: String? = null): PushTapDestination {
            val type = payload.type?.lowercase()
            val conversationId = payload.conversationId
            val postId = payload.postId
            val conversation = conversationId?.let { Conversation(it, payload.messageId) }

            return when {
                type == null -> conversation ?: None
                type in CONVERSATION_TYPES -> conversation ?: postId?.let { content(payload, type, it) } ?: None
                type in RELATION_TYPES -> payload.senderId?.let(::Profile) ?: Notifications
                type in GameTarget.NOTIFICATION_TYPES -> Game(GameTarget.forNotification(type) ?: GameTarget.Home)
                routeHint.equals(PROGRESSION_ROUTE, ignoreCase = true) -> Game(GameTarget.Home)
                type in ACCOUNT_TYPES -> Notifications
                postId != null -> content(payload, type, postId)
                else -> conversation ?: None
            }
        }

        private fun content(payload: PushPayload, type: String, postId: String): PushTapDestination {
            if (type == "friend_new_mood") return Mood(postId)
            val entity = payload.postType?.uppercase()
            if (entity == "REEL") return Reel(postId)
            if (entity in EPHEMERAL_ENTITIES && type == "friend_new_story") {
                payload.senderId?.let { return Story(it) }
            }
            return Post(postId)
        }
    }
}
