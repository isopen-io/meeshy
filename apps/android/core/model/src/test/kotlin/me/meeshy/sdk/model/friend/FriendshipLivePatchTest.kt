package me.meeshy.sdk.model.friend

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.NotificationActor
import me.meeshy.sdk.model.NotificationContext
import org.junit.Test

class FriendshipLivePatchTest {

    private fun notification(
        type: String,
        actorId: String? = "u-sender",
        friendRequestId: String? = "fr-1",
    ) = ApiNotification(
        id = "n-1",
        type = type,
        actor = actorId?.let { NotificationActor(id = it) },
        context = NotificationContext(friendRequestId = friendRequestId),
    )

    @Test
    fun `a friend request notification records a pending received request from its actor`() {
        val patch = FriendshipLivePatch.from(notification("friend_request"))

        assertThat(patch).isEqualTo(FriendshipLivePatch.Received(senderId = "u-sender", requestId = "fr-1"))
    }

    @Test
    fun `contact and legacy request types are received requests too`() {
        listOf("contact_request", "FRIEND_REQUEST").forEach { type ->
            assertThat(FriendshipLivePatch.from(notification(type)))
                .isEqualTo(FriendshipLivePatch.Received("u-sender", "fr-1"))
        }
    }

    @Test
    fun `a request without actor or request id patches nothing`() {
        assertThat(FriendshipLivePatch.from(notification("friend_request", actorId = null))).isNull()
        assertThat(FriendshipLivePatch.from(notification("friend_request", friendRequestId = null))).isNull()
        assertThat(FriendshipLivePatch.from(notification("friend_request", actorId = " "))).isNull()
    }

    @Test
    fun `an acceptance notification makes its actor a friend and needs no request id`() {
        listOf("friend_accepted", "contact_accepted", "FRIEND_ACCEPTED").forEach { type ->
            assertThat(FriendshipLivePatch.from(notification(type, friendRequestId = null)))
                .isEqualTo(FriendshipLivePatch.Accepted(accepterId = "u-sender"))
        }
    }

    @Test
    fun `an acceptance without actor patches nothing`() {
        assertThat(FriendshipLivePatch.from(notification("friend_accepted", actorId = null))).isNull()
    }

    @Test
    fun `other notification types never touch the friend graph`() {
        listOf("new_message", "post_like", "system", "unknown_wire").forEach { type ->
            assertThat(FriendshipLivePatch.from(notification(type))).isNull()
        }
    }
}
