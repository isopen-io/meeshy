package me.meeshy.sdk.friend

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import me.meeshy.sdk.model.friend.FriendshipLivePatch
import me.meeshy.sdk.socket.MessageSocketManager

/**
 * Keeps [FriendshipCache] live off the notification socket: a request received or accepted flips
 * the cache the moment the frame lands, so the Requests badge, the Requests tab and the Contacts
 * list follow without a manual refresh. Scoped for the app's lifetime (the socket flows have no
 * replay); each patch is idempotent, so a duplicated frame never double counts.
 */
fun CoroutineScope.observeFriendshipLive(
    friendshipCache: FriendshipCache,
    messageSocketManager: MessageSocketManager,
) {
    messageSocketManager.notificationReceived
        .onEach { notification ->
            when (val patch = FriendshipLivePatch.from(notification)) {
                is FriendshipLivePatch.Received -> friendshipCache.didReceiveRequest(patch.senderId, patch.requestId)
                is FriendshipLivePatch.Accepted -> friendshipCache.didAcceptRequest(patch.accepterId)
                null -> Unit
            }
        }
        .launchIn(this)
}
