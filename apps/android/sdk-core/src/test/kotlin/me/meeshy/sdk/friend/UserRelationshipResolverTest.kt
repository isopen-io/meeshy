package me.meeshy.sdk.friend

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.friend.UserRelationshipState
import org.junit.Test

class UserRelationshipResolverTest {

    private fun resolver(
        currentUserId: String? = "me",
        blocked: Set<String> = emptySet(),
        cache: FriendshipCache = FriendshipCache(),
    ) = UserRelationshipResolver(
        friendshipCache = cache,
        blockStatus = { blocked.contains(it) },
        currentUserId = { currentUserId },
    )

    @Test
    fun `current user id resolves to Current`() {
        assertThat(resolver().resolve("me")).isEqualTo(UserRelationshipState.Current)
    }

    @Test
    fun `blocked user resolves to Blocked even when also a friend`() {
        val cache = FriendshipCache().apply { didAcceptRequest("other") }
        val sut = resolver(blocked = setOf("other"), cache = cache)

        assertThat(sut.resolve("other")).isEqualTo(UserRelationshipState.Blocked)
    }

    @Test
    fun `accepted friend resolves to Connected`() {
        val cache = FriendshipCache().apply { didAcceptRequest("friend-1") }
        assertThat(resolver(cache = cache).resolve("friend-1"))
            .isEqualTo(UserRelationshipState.Connected)
    }

    @Test
    fun `sent request resolves to PendingSent with the request id`() {
        val cache = FriendshipCache().apply { didSendRequest("other", "req-42") }
        assertThat(resolver(cache = cache).resolve("other"))
            .isEqualTo(UserRelationshipState.PendingSent("req-42"))
    }

    @Test
    fun `received request resolves to PendingReceived with the request id`() {
        val cache = FriendshipCache().apply { didReceiveRequest("other", "req-99") }
        assertThat(resolver(cache = cache).resolve("other"))
            .isEqualTo(UserRelationshipState.PendingReceived("req-99"))
    }

    @Test
    fun `unknown user resolves to None`() {
        assertThat(resolver().resolve("stranger")).isEqualTo(UserRelationshipState.None)
    }

    @Test
    fun `blank user id resolves to None without consulting the block provider`() {
        var consulted = false
        val sut = UserRelationshipResolver(
            friendshipCache = FriendshipCache(),
            blockStatus = { consulted = true; true },
            currentUserId = { "me" },
        )

        assertThat(sut.resolve("")).isEqualTo(UserRelationshipState.None)
        assertThat(consulted).isFalse()
    }

    @Test
    fun `null current user id never spuriously matches Current`() {
        val sut = resolver(currentUserId = null)
        assertThat(sut.resolve("me")).isEqualTo(UserRelationshipState.None)
    }
}
