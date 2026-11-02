package me.meeshy.sdk.model.friend

import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.MeeshyNotificationType

/**
 * What a live notification changes in the friend graph — port of iOS
 * `NotificationToastManager.updateFriendshipCacheIfNeeded`: a request received
 * becomes a pending entry, an acceptance makes the accepter a friend. Anything
 * else (or a frame missing the ids it needs) patches nothing.
 */
sealed interface FriendshipLivePatch {
    data class Received(val senderId: String, val requestId: String) : FriendshipLivePatch
    data class Accepted(val accepterId: String) : FriendshipLivePatch

    companion object {
        fun from(notification: ApiNotification): FriendshipLivePatch? {
            val actorId = notification.actor?.id?.takeIf { it.isNotBlank() } ?: return null
            return when (notification.notificationType) {
                MeeshyNotificationType.FRIEND_REQUEST,
                MeeshyNotificationType.CONTACT_REQUEST,
                MeeshyNotificationType.LEGACY_FRIEND_REQUEST -> {
                    val requestId = notification.context?.friendRequestId?.takeIf { it.isNotBlank() } ?: return null
                    Received(senderId = actorId, requestId = requestId)
                }
                MeeshyNotificationType.FRIEND_ACCEPTED,
                MeeshyNotificationType.CONTACT_ACCEPTED,
                MeeshyNotificationType.LEGACY_FRIEND_ACCEPTED -> Accepted(accepterId = actorId)
                else -> null
            }
        }
    }
}
