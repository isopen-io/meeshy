package me.meeshy.sdk.model.call.group

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GroupSignalRoutingTest {

    @Test
    fun `a direct call never goes through the mesh`() {
        val destination = GroupSignalRouting.destination("bob", "me", primaryUserId = "alice", isGroupCall = false)
        assertThat(destination).isEqualTo(GroupSignalDestination.Primary)
    }

    @Test
    fun `a signal without sender stays with the primary`() {
        assertThat(GroupSignalRouting.destination(null, "me", "alice", isGroupCall = true)).isEqualTo(GroupSignalDestination.Primary)
        assertThat(GroupSignalRouting.destination("", "me", "alice", isGroupCall = true)).isEqualTo(GroupSignalDestination.Primary)
    }

    @Test
    fun `my own echo is ignored`() {
        assertThat(GroupSignalRouting.destination("me", "me", "alice", isGroupCall = true)).isEqualTo(GroupSignalDestination.Ignore)
    }

    @Test
    fun `until a primary is designated everything stays with the primary`() {
        assertThat(GroupSignalRouting.destination("bob", "me", null, isGroupCall = true)).isEqualTo(GroupSignalDestination.Primary)
    }

    @Test
    fun `the primary keeps its signals and a third member goes to the mesh`() {
        assertThat(GroupSignalRouting.destination("alice", "me", "alice", isGroupCall = true)).isEqualTo(GroupSignalDestination.Primary)
        assertThat(GroupSignalRouting.destination("bob", "me", "alice", isGroupCall = true)).isEqualTo(GroupSignalDestination.Mesh("bob"))
    }

    @Test
    fun `a vacated seat sends every member to the mesh, the former primary included`() {
        val destination = GroupSignalRouting.destination("alice", "me", "alice", isGroupCall = true, primaryVacated = true)
        assertThat(destination).isEqualTo(GroupSignalDestination.Mesh("alice"))
    }

    @Test
    fun `the member already in the call offers to the newcomer, never to the primary`() {
        assertThat(GroupSignalRouting.shouldOfferToArrival("bob", "me", "alice", isInCall = true)).isTrue()
        assertThat(GroupSignalRouting.shouldOfferToArrival("alice", "me", "alice", isInCall = true)).isFalse()
        assertThat(GroupSignalRouting.shouldOfferToArrival("me", "me", "alice", isInCall = true)).isFalse()
        assertThat(GroupSignalRouting.shouldOfferToArrival("bob", "me", "alice", isInCall = false)).isFalse()
        assertThat(GroupSignalRouting.shouldOfferToArrival("bob", "me", null, isInCall = true)).isFalse()
        assertThat(GroupSignalRouting.shouldOfferToArrival("alice", "me", "alice", isInCall = true, primaryVacated = true)).isTrue()
    }

    @Test
    fun `the smaller id is the polite peer, symmetrically`() {
        assertThat(GroupSignalRouting.isPolitePeer("a1", "b2")).isTrue()
        assertThat(GroupSignalRouting.isPolitePeer("b2", "a1")).isFalse()
        assertThat(GroupSignalRouting.isPolitePeer("", "b2")).isFalse()
        assertThat(GroupSignalRouting.isPolitePeer("a1", "a1")).isFalse()
    }

    @Test
    fun `a third party joining or offering proves a group call, nothing else does`() {
        assertThat(GroupCallEvidence.fromArrival("bob", "me", "alice")).isTrue()
        assertThat(GroupCallEvidence.fromArrival("alice", "me", "alice")).isFalse()
        assertThat(GroupCallEvidence.fromArrival("bob", "me", null)).isFalse()
        assertThat(GroupCallEvidence.fromArrival("me", "me", "alice")).isFalse()
        assertThat(GroupCallEvidence.fromSignal("offer", "bob", "me", "alice")).isTrue()
        assertThat(GroupCallEvidence.fromSignal("ice-candidate", "bob", "me", "alice")).isFalse()
        assertThat(GroupCallEvidence.fromSignal("offer", null, "me", "alice")).isFalse()
    }

    @Test
    fun `a conversation known not to be direct announces a group call before any member shows up`() {
        assertThat(GroupCallEvidence.fromConversationType("group")).isTrue()
        assertThat(GroupCallEvidence.fromConversationType("public")).isTrue()
        assertThat(GroupCallEvidence.fromConversationType("direct")).isFalse()
        assertThat(GroupCallEvidence.fromConversationType("DM")).isFalse()
        assertThat(GroupCallEvidence.fromConversationType(null)).isFalse()
        assertThat(GroupCallEvidence.fromConversationType(" ")).isFalse()
    }

    @Test
    fun `a mesh link retries at once, then 2, 4, 8, 16 s, five times at most`() {
        assertThat((1..6).map(GroupPeerLinkRestart::backoffMs)).containsExactly(0L, 2_000L, 4_000L, 8_000L, 16_000L, 16_000L).inOrder()
        assertThat(GroupPeerLinkRestart.isExhausted(5)).isFalse()
        assertThat(GroupPeerLinkRestart.isExhausted(6)).isTrue()
    }
}
