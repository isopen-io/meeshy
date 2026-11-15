package me.meeshy.sdk.model.friend

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.UserUpdatedEvent
import me.meeshy.sdk.model.UserUpdatedEvent.OptionalMediaChange
import org.junit.Test

class FriendRepaintTest {
    private val event = UserUpdatedEvent(
        userId = "u1", username = "new", displayName = null, firstName = "Ann", lastName = null,
        hasNameGroup = true, avatar = OptionalMediaChange.Replaced("n.png"),
    )

    @Test
    fun `account object keeps a cleared displayName cleared`() {
        val r = event.repainted(FriendRequestUser(id = "u1", username = "old", displayName = "Old", avatar = "o.png"))!!
        assertThat(r.displayName).isNull()
        assertThat(r.username).isEqualTo("new")
        assertThat(r.firstName).isEqualTo("Ann")
        assertThat(r.avatar).isEqualTo("n.png")
    }

    @Test
    fun `request is repainted on sender side and on receiver side`() {
        val other = FriendRequestUser(id = "u2", username = "z")
        val me = FriendRequestUser(id = "u1", username = "old")
        val asSender = event.repainted(FriendRequest(id = "r", sender = me, receiver = other))!!
        assertThat(asSender.sender!!.username).isEqualTo("new")
        assertThat(asSender.receiver).isSameInstanceAs(other)
        val asReceiver = event.repainted(FriendRequest(id = "r", sender = other, receiver = me))!!
        assertThat(asReceiver.receiver!!.username).isEqualTo("new")
        assertThat(asReceiver.sender).isSameInstanceAs(other)
    }

    @Test
    fun `untouched request and other user yield null`() {
        assertThat(event.repainted(FriendRequest(id = "r", sender = FriendRequestUser(id = "u2")))).isNull()
        assertThat(event.repainted(FriendRequest(id = "r"))).isNull()
        assertThat(event.repainted(FriendRequestUser(id = "u1", username = "new", firstName = "Ann", avatar = "n.png"))).isNull()
    }

    @Test
    fun `blocked user is repainted`() {
        val r = event.repainted(BlockedUser(id = "u1", username = "old", displayName = "Old", avatar = "o.png"))!!
        assertThat(r.username).isEqualTo("new")
        assertThat(r.displayName).isNull()
        assertThat(r.avatar).isEqualTo("n.png")
        assertThat(event.repainted(BlockedUser(id = "u3"))).isNull()
    }
}
