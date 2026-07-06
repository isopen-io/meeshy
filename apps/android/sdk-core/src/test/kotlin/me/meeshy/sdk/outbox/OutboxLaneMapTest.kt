package me.meeshy.sdk.outbox

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Guards the SSOT that maps every [OutboxKind] to the lane it drains on. The
 * worker derives its shared-lane drain sweep from [OutboxLaneMap.sharedDrainLanes],
 * so a kind that has a registered sender can never again be silently stranded
 * off the drain list — the exact BLOCK/FRIEND omission bug (see NOTES 2026-07-04).
 */
class OutboxLaneMapTest {

    @Test
    fun `message mutations drain on the per-conversation lane`() {
        assertThat(OutboxLaneMap.assignmentFor(OutboxKind.SEND_MESSAGE))
            .isEqualTo(OutboxLaneAssignment.PerConversation)
        assertThat(OutboxLaneMap.assignmentFor(OutboxKind.EDIT_MESSAGE))
            .isEqualTo(OutboxLaneAssignment.PerConversation)
        assertThat(OutboxLaneMap.assignmentFor(OutboxKind.DELETE_MESSAGE))
            .isEqualTo(OutboxLaneAssignment.PerConversation)
    }

    @Test
    fun `add and remove reaction share the reaction lane`() {
        assertThat(OutboxLaneMap.assignmentFor(OutboxKind.ADD_REACTION))
            .isEqualTo(OutboxLaneAssignment.Shared(OutboxLanes.REACTION))
        assertThat(OutboxLaneMap.assignmentFor(OutboxKind.REMOVE_REACTION))
            .isEqualTo(OutboxLaneAssignment.Shared(OutboxLanes.REACTION))
    }

    @Test
    fun `block and unblock share the block lane`() {
        assertThat(OutboxLaneMap.assignmentFor(OutboxKind.BLOCK_USER))
            .isEqualTo(OutboxLaneAssignment.Shared(OutboxLanes.BLOCK))
        assertThat(OutboxLaneMap.assignmentFor(OutboxKind.UNBLOCK_USER))
            .isEqualTo(OutboxLaneAssignment.Shared(OutboxLanes.BLOCK))
    }

    @Test
    fun `each remaining kind maps to its own dedicated shared lane`() {
        assertThat(OutboxLaneMap.assignmentFor(OutboxKind.READ_RECEIPT))
            .isEqualTo(OutboxLaneAssignment.Shared(OutboxLanes.READ_RECEIPT))
        assertThat(OutboxLaneMap.assignmentFor(OutboxKind.UPDATE_CONVERSATION_PREFS))
            .isEqualTo(OutboxLaneAssignment.Shared(OutboxLanes.CONVERSATION_PREFS))
        assertThat(OutboxLaneMap.assignmentFor(OutboxKind.UPDATE_PROFILE))
            .isEqualTo(OutboxLaneAssignment.Shared(OutboxLanes.PROFILE))
        assertThat(OutboxLaneMap.assignmentFor(OutboxKind.UPDATE_SETTINGS))
            .isEqualTo(OutboxLaneAssignment.Shared(OutboxLanes.SETTINGS))
        assertThat(OutboxLaneMap.assignmentFor(OutboxKind.PUBLISH_STORY))
            .isEqualTo(OutboxLaneAssignment.Shared(OutboxLanes.STORY))
        assertThat(OutboxLaneMap.assignmentFor(OutboxKind.UPLOAD_MEDIA))
            .isEqualTo(OutboxLaneAssignment.Shared(OutboxLanes.MEDIA))
        assertThat(OutboxLaneMap.assignmentFor(OutboxKind.SEND_FRIEND_REQUEST))
            .isEqualTo(OutboxLaneAssignment.Shared(OutboxLanes.FRIEND))
    }

    @Test
    fun `every kind maps to a non-blank assignment`() {
        OutboxKind.entries.forEach { kind ->
            when (val assignment = OutboxLaneMap.assignmentFor(kind)) {
                OutboxLaneAssignment.PerConversation -> Unit
                is OutboxLaneAssignment.Shared ->
                    assertThat(assignment.lane).isNotEmpty()
            }
        }
    }

    @Test
    fun `shared drain lanes cover every shared kind`() {
        val sharedKindLanes = OutboxKind.entries
            .map { OutboxLaneMap.assignmentFor(it) }
            .filterIsInstance<OutboxLaneAssignment.Shared>()
            .map { it.lane }
        sharedKindLanes.forEach { lane ->
            assertThat(OutboxLaneMap.sharedDrainLanes).contains(lane)
        }
    }

    @Test
    fun `shared drain lanes include the previously-stranded block and friend lanes`() {
        assertThat(OutboxLaneMap.sharedDrainLanes).contains(OutboxLanes.BLOCK)
        assertThat(OutboxLaneMap.sharedDrainLanes).contains(OutboxLanes.FRIEND)
    }

    @Test
    fun `shared drain lanes are deduplicated`() {
        val lanes = OutboxLaneMap.sharedDrainLanes
        assertThat(lanes).containsNoDuplicates()
        // BLOCK_USER + UNBLOCK_USER both map to BLOCK, yet it appears once.
        assertThat(lanes.count { it == OutboxLanes.BLOCK }).isEqualTo(1)
        assertThat(lanes.count { it == OutboxLanes.REACTION }).isEqualTo(1)
    }

    @Test
    fun `shared drain lanes never carry a per-conversation message lane`() {
        assertThat(OutboxLaneMap.sharedDrainLanes)
            .doesNotContain(OutboxLanes.forMessage("any-conversation"))
        OutboxLaneMap.sharedDrainLanes.forEach { lane ->
            assertThat(lane).doesNotContain("message:")
            assertThat(lane).isNotEmpty()
        }
    }
}
