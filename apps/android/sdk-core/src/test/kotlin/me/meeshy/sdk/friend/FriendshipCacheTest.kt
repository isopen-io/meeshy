package me.meeshy.sdk.friend

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.friend.FriendshipStatus
import org.junit.Test

class FriendshipCacheTest {

    private fun req(id: String, sender: String = "", receiver: String = "", status: String = "pending") =
        FriendRequest(id = id, senderId = sender, receiverId = receiver, status = status)

    @Test
    fun `fresh cache reports None and is not hydrated`() {
        val cache = FriendshipCache()
        assertThat(cache.status("anyone")).isEqualTo(FriendshipStatus.None)
        assertThat(cache.isHydrated).isFalse()
        assertThat(cache.friendCount).isEqualTo(0)
        assertThat(cache.pendingReceivedCount).isEqualTo(0)
    }

    @Test
    fun `didAcceptRequest makes the sender a friend and drops the received pending`() {
        val cache = FriendshipCache()
        cache.didReceiveRequest(senderId = "u1", requestId = "r1")
        assertThat(cache.status("u1")).isEqualTo(FriendshipStatus.PendingReceived("r1"))

        cache.didAcceptRequest(senderId = "u1")

        assertThat(cache.status("u1")).isEqualTo(FriendshipStatus.Friend)
        assertThat(cache.isFriend("u1")).isTrue()
        assertThat(cache.pendingReceivedCount).isEqualTo(0)
        assertThat(cache.friendCount).isEqualTo(1)
    }

    @Test
    fun `didSendRequest then didCancelRequest returns to None`() {
        val cache = FriendshipCache()
        cache.didSendRequest(receiverId = "u2", requestId = "r2")
        assertThat(cache.status("u2")).isEqualTo(FriendshipStatus.PendingSent("r2"))

        cache.didCancelRequest(receiverId = "u2")

        assertThat(cache.status("u2")).isEqualTo(FriendshipStatus.None)
    }

    @Test
    fun `didRejectRequest drops the received pending without befriending`() {
        val cache = FriendshipCache()
        cache.didReceiveRequest(senderId = "u3", requestId = "r3")

        cache.didRejectRequest(senderId = "u3")

        assertThat(cache.status("u3")).isEqualTo(FriendshipStatus.None)
        assertThat(cache.isFriend("u3")).isFalse()
    }

    @Test
    fun `didRemoveFriend severs an accepted friendship`() {
        val cache = FriendshipCache()
        cache.didAcceptRequest(senderId = "u4")
        assertThat(cache.isFriend("u4")).isTrue()

        cache.didRemoveFriend("u4")

        assertThat(cache.status("u4")).isEqualTo(FriendshipStatus.None)
    }

    @Test
    fun `hydrate maps accepted to friends and pending directionally, dropping other statuses`() {
        val cache = FriendshipCache()

        cache.hydrate(
            sent = listOf(
                req("s1", receiver = "friendA", status = "accepted"),
                req("s2", receiver = "sentB", status = "pending"),
                req("s3", receiver = "ignored", status = "rejected"),
            ),
            received = listOf(
                req("r1", sender = "friendC", status = "accepted"),
                req("r2", sender = "recvD", status = "pending"),
                req("r3", sender = "ignored2", status = "cancelled"),
            ),
        )

        assertThat(cache.status("friendA")).isEqualTo(FriendshipStatus.Friend)
        assertThat(cache.status("friendC")).isEqualTo(FriendshipStatus.Friend)
        assertThat(cache.status("sentB")).isEqualTo(FriendshipStatus.PendingSent("s2"))
        assertThat(cache.status("recvD")).isEqualTo(FriendshipStatus.PendingReceived("r2"))
        assertThat(cache.status("ignored")).isEqualTo(FriendshipStatus.None)
        assertThat(cache.status("ignored2")).isEqualTo(FriendshipStatus.None)
        assertThat(cache.isHydrated).isTrue()
        assertThat(cache.friendCount).isEqualTo(2)
        assertThat(cache.pendingReceivedCount).isEqualTo(1)
    }

    @Test
    fun `hydrate fully replaces prior state so stale entries cannot survive`() {
        val cache = FriendshipCache()
        cache.didSendRequest(receiverId = "stale", requestId = "old")

        cache.hydrate(sent = emptyList(), received = emptyList())

        assertThat(cache.status("stale")).isEqualTo(FriendshipStatus.None)
    }

    @Test
    fun `hydrate skips rows with a blank counterparty id`() {
        val cache = FriendshipCache()

        cache.hydrate(
            sent = listOf(req("s1", receiver = "", status = "pending")),
            received = listOf(req("r1", sender = "", status = "accepted")),
        )

        assertThat(cache.friendCount).isEqualTo(0)
        assertThat(cache.pendingReceivedCount).isEqualTo(0)
    }

    @Test
    fun `rollbackAccept restores the received pending and un-friends`() {
        val cache = FriendshipCache()
        cache.didAcceptRequest(senderId = "u5")

        cache.rollbackAccept(senderId = "u5", requestId = "r5")

        assertThat(cache.status("u5")).isEqualTo(FriendshipStatus.PendingReceived("r5"))
        assertThat(cache.isFriend("u5")).isFalse()
    }

    @Test
    fun `rollbackReject restores the received pending`() {
        val cache = FriendshipCache()
        cache.didReceiveRequest(senderId = "u6", requestId = "r6")
        cache.didRejectRequest(senderId = "u6")

        cache.rollbackReject(senderId = "u6", requestId = "r6")

        assertThat(cache.status("u6")).isEqualTo(FriendshipStatus.PendingReceived("r6"))
    }

    @Test
    fun `rollbackSendRequest removes the sent pending`() {
        val cache = FriendshipCache()
        cache.didSendRequest(receiverId = "u7", requestId = "r7")

        cache.rollbackSendRequest(receiverId = "u7")

        assertThat(cache.status("u7")).isEqualTo(FriendshipStatus.None)
    }

    @Test
    fun `clear wipes everything and resets hydration`() {
        val cache = FriendshipCache()
        cache.hydrate(
            sent = listOf(req("s1", receiver = "f", status = "accepted")),
            received = emptyList(),
        )

        cache.clear()

        assertThat(cache.status("f")).isEqualTo(FriendshipStatus.None)
        assertThat(cache.isHydrated).isFalse()
        assertThat(cache.friendCount).isEqualTo(0)
    }

    @Test
    fun `every mutation bumps the version`() {
        val cache = FriendshipCache()
        val start = cache.version.value

        cache.didSendRequest("a", "r")
        cache.didCancelRequest("a")
        cache.didReceiveRequest("b", "r2")
        cache.didAcceptRequest("b")
        cache.didRejectRequest("c")
        cache.didRemoveFriend("b")
        cache.rollbackSendRequest("a")
        cache.hydrate(emptyList(), emptyList())
        cache.clear()

        assertThat(cache.version.value).isEqualTo(start + 9)
    }
}
