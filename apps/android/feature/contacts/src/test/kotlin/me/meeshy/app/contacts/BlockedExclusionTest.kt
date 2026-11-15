package me.meeshy.app.contacts

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.FriendRequestUser
import org.junit.Test

class BlockedExclusionTest {

    @Test
    fun `a blocked friend leaves the contact list`() {
        val friends = listOf(FriendRequestUser(id = "a"), FriendRequestUser(id = "b"))

        assertThat(BlockedExclusion.friends(friends, setOf("b")).map { it.id }).containsExactly("a")
    }

    @Test
    fun `a request whose either end is blocked is dropped`() {
        val requests = listOf(
            FriendRequest(id = "1", senderId = "me", receiverId = "b"),
            FriendRequest(id = "2", senderId = "b", receiverId = "me"),
            FriendRequest(id = "3", senderId = "me", receiverId = "c"),
        )

        assertThat(BlockedExclusion.requests(requests, setOf("b")).map { it.id }).containsExactly("3")
    }

    @Test
    fun `nothing is dropped without a blocklist`() {
        val requests = listOf(FriendRequest(id = "1", senderId = "me", receiverId = "b"))

        assertThat(BlockedExclusion.requests(requests, emptySet())).isEqualTo(requests)
    }
}
