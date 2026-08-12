package me.meeshy.sdk.model.friend

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class UserRelationshipRulesTest {

    private fun resolve(
        target: String = "other",
        current: String? = "me",
        blocked: Boolean = false,
        friendship: FriendshipStatus = FriendshipStatus.None,
    ) = UserRelationshipRules.resolve(
        targetUserId = target,
        currentUserId = current,
        isBlocked = blocked,
        friendship = friendship,
    )

    @Test
    fun `blank target resolves to None regardless of everything else`() {
        assertThat(resolve(target = "", current = "", blocked = true, friendship = FriendshipStatus.Friend))
            .isEqualTo(UserRelationshipState.None)
        assertThat(resolve(target = "   ", friendship = FriendshipStatus.Friend))
            .isEqualTo(UserRelationshipState.None)
    }

    @Test
    fun `current user id resolves to Current even if also friend`() {
        assertThat(resolve(target = "me", current = "me", friendship = FriendshipStatus.Friend))
            .isEqualTo(UserRelationshipState.Current)
    }

    @Test
    fun `null current user id never matches Current`() {
        assertThat(resolve(target = "me", current = null, friendship = FriendshipStatus.None))
            .isEqualTo(UserRelationshipState.None)
    }

    @Test
    fun `block wins over friendship`() {
        assertThat(resolve(target = "other", blocked = true, friendship = FriendshipStatus.Friend))
            .isEqualTo(UserRelationshipState.Blocked)
    }

    @Test
    fun `current wins over block`() {
        assertThat(resolve(target = "me", current = "me", blocked = true))
            .isEqualTo(UserRelationshipState.Current)
    }

    @Test
    fun `accepted friend resolves to Connected`() {
        assertThat(resolve(friendship = FriendshipStatus.Friend))
            .isEqualTo(UserRelationshipState.Connected)
    }

    @Test
    fun `pending sent carries the request id through`() {
        assertThat(resolve(friendship = FriendshipStatus.PendingSent("req-42")))
            .isEqualTo(UserRelationshipState.PendingSent("req-42"))
    }

    @Test
    fun `pending received carries the request id through`() {
        assertThat(resolve(friendship = FriendshipStatus.PendingReceived("req-99")))
            .isEqualTo(UserRelationshipState.PendingReceived("req-99"))
    }

    @Test
    fun `no relationship resolves to None`() {
        assertThat(resolve(friendship = FriendshipStatus.None))
            .isEqualTo(UserRelationshipState.None)
    }

    @Test
    fun `isPending is true only for the two pending states`() {
        assertThat(UserRelationshipState.PendingSent("a").isPending).isTrue()
        assertThat(UserRelationshipState.PendingReceived("b").isPending).isTrue()
        assertThat(UserRelationshipState.Connected.isPending).isFalse()
        assertThat(UserRelationshipState.Blocked.isPending).isFalse()
        assertThat(UserRelationshipState.Current.isPending).isFalse()
        assertThat(UserRelationshipState.None.isPending).isFalse()
    }
}
