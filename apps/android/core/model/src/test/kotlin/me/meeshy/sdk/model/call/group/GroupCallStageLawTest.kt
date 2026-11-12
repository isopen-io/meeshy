package me.meeshy.sdk.model.call.group

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GroupCallStageLawTest {

    private val primaryOnly = GroupCallRoster("me").admitting(GroupCallArrival("alice"), isPrimary = true)
    private val trio = primaryOnly.admitting(GroupCallArrival("bob", displayName = "Bob", isVideoEnabled = true))

    @Test
    fun `the grid follows iOS from one to six tiles`() {
        assertThat(GroupCallGridLayout.layout(1, isLandscape = false)).isEqualTo(GroupCallGridLayout(1, 1))
        assertThat(GroupCallGridLayout.layout(2, isLandscape = false)).isEqualTo(GroupCallGridLayout(1, 2))
        assertThat(GroupCallGridLayout.layout(2, isLandscape = true)).isEqualTo(GroupCallGridLayout(2, 1))
        assertThat(GroupCallGridLayout.layout(3, isLandscape = false)).isEqualTo(GroupCallGridLayout(2, 2))
        assertThat(GroupCallGridLayout.layout(6, isLandscape = false)).isEqualTo(GroupCallGridLayout(2, 3))
        assertThat(GroupCallGridLayout.layout(6, isLandscape = true)).isEqualTo(GroupCallGridLayout(3, 2))
        assertThat(GroupCallGridLayout.layout(0, isLandscape = true).capacity).isEqualTo(1)
    }

    @Test
    fun `the duo screen stays while only the primary is there`() {
        assertThat(GroupCallStageLaw.isShown(isMeshActive = true, roster = primaryOnly)).isFalse()
        assertThat(GroupCallStageLaw.isShown(isMeshActive = true, roster = trio)).isTrue()
        assertThat(GroupCallStageLaw.isShown(isMeshActive = false, roster = trio)).isFalse()
    }

    @Test
    fun `a member held by the mesh alone is shown on the grid`() {
        val vacated = GroupCallRoster("me").admitting(GroupCallArrival("bob"))
        assertThat(GroupCallStageLaw.isShown(isMeshActive = true, roster = vacated)).isTrue()
    }

    @Test
    fun `the members come in arrival order, then my tile last (P11_3)`() {
        val tiles = GroupCallStageLaw.tiles(trio, "You", isLocalMicMuted = true, isLocalVideoEnabled = false, isPrimaryVideoActive = true)
        assertThat(tiles.map { it.id }).containsExactly("alice", "bob", GroupCallStageLaw.LOCAL_TILE_ID).inOrder()
        assertThat(tiles[2].isMicMuted).isTrue()
        assertThat(tiles[2].colorKey).isEqualTo("me")
        assertThat(tiles[0].showsVideo).isTrue()
        assertThat(tiles[1].showsVideo).isTrue()
        assertThat(tiles[1].displayName).isEqualTo("Bob")
    }

    @Test
    fun `my tile stays last whoever speaks, the order never moves (P11_3)`() {
        fun ids(speaking: Set<String>) = GroupCallStageLaw.tiles(
            trio, "You", speakingUserIds = speaking,
            isLocalMicMuted = false, isLocalVideoEnabled = false, isPrimaryVideoActive = false,
        ).map { it.id }
        assertThat(ids(emptySet())).isEqualTo(ids(setOf("bob")))
        assertThat(ids(setOf("me"))).isEqualTo(ids(setOf("alice", "bob")))
        assertThat(ids(emptySet()).last()).isEqualTo(GroupCallStageLaw.LOCAL_TILE_ID)
    }

    @Test
    fun `invite candidates exclude me, the call and the ringing ones`() {
        val excluded = CallInviteCandidates.excludedIds("me", "alice", trio, setOf("carol"))
        val friends = listOf("alice", "bob", "carol", "dan", "me")
        assertThat(CallInviteCandidates.filter(friends, excluded) { it }).containsExactly("dan")
    }

    @Test
    fun `remaining seats count me, the members and the ringing invitations`() {
        assertThat(CallInviteCandidates.remainingSeats(trio, hasPrimaryOutsideRoster = false, ringingCount = 1)).isEqualTo(2)
        assertThat(CallInviteCandidates.remainingSeats(GroupCallRoster("me"), hasPrimaryOutsideRoster = true, ringingCount = 0)).isEqualTo(4)
        assertThat(CallInviteCandidates.remainingSeats(trio, hasPrimaryOutsideRoster = false, ringingCount = 9)).isEqualTo(0)
    }

    @Test
    fun `whoever speaks is marked, my tile included (P11_5)`() {
        val tiles = GroupCallStageLaw.tiles(
            trio, "You", speakingUserIds = setOf("bob", "me"),
            isLocalMicMuted = false, isLocalVideoEnabled = false, isPrimaryVideoActive = false,
        )
        assertThat(tiles.map { it.id to it.isSpeaking })
            .containsExactly("alice" to false, "bob" to true, GroupCallStageLaw.LOCAL_TILE_ID to true).inOrder()
    }

    @Test
    fun `remote cameras on count the primary by its video and the members by their camera or their screen (G1_13)`() {
        assertThat(GroupCallStageLaw.remoteCamerasOn(trio, isPrimaryVideoActive = false)).isEqualTo(1)
        assertThat(GroupCallStageLaw.remoteCamerasOn(trio, isPrimaryVideoActive = true)).isEqualTo(2)
        val audioOnly = primaryOnly.admitting(GroupCallArrival("bob", isVideoEnabled = false))
        assertThat(GroupCallStageLaw.remoteCamerasOn(audioOnly, isPrimaryVideoActive = false)).isEqualTo(0)
    }
}
