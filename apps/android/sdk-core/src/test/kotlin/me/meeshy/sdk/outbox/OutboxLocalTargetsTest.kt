package me.meeshy.sdk.outbox

import com.google.common.truth.Truth.assertThat
import me.meeshy.core.database.entity.OutboxEntity
import org.junit.Test

class OutboxLocalTargetsTest {

    private fun row(kind: String, targetId: String) = OutboxEntity(
        cmid = "m1",
        lane = "lane",
        kind = kind,
        targetId = targetId,
        payload = "{}",
        dependsOn = null,
        attempts = 0,
        state = OutboxState.PENDING.name,
        createdAt = 1L,
        updatedAt = 1L,
    )

    private val serverId = "507f1f77bcf86cd799439011"

    @Test
    fun `a like on a story still queued for publication is held`() {
        assertThat(OutboxLocalTargets.isHeld(row("LIKE_POST", "pending_550e8400-e29b-41d4-a716-446655440000")))
            .isTrue()
    }

    @Test
    fun `an edit or a pin of a bubble that has no server id yet is held`() {
        assertThat(OutboxLocalTargets.isHeld(row("EDIT_MESSAGE", "cid_550e8400-e29b-41d4-a716-446655440000")))
            .isTrue()
        assertThat(OutboxLocalTargets.isHeld(row("PIN_MESSAGE", "cid_550e8400-e29b-41d4-a716-446655440000")))
            .isTrue()
    }

    @Test
    fun `a mutation addressed to a cmid is held`() {
        assertThat(OutboxLocalTargets.isHeld(row("DELETE_MESSAGE", "cmid_550e8400-e29b-41d4-a716-446655440000")))
            .isTrue()
    }

    @Test
    fun `a mutation addressed to a server object id is never held`() {
        OutboxKind.entries.forEach { kind ->
            assertThat(OutboxLocalTargets.isHeld(row(kind.name, serverId))).isFalse()
        }
    }

    @Test
    fun `a kind whose route never reads the target is never held`() {
        assertThat(OutboxLocalTargets.isHeld(row("PUBLISH_STORY", "pending_550e8400-e29b-41d4-a716-446655440000")))
            .isFalse()
        assertThat(OutboxLocalTargets.isHeld(row("UPLOAD_MEDIA", "cmid_550e8400-e29b-41d4-a716-446655440000")))
            .isFalse()
        assertThat(OutboxLocalTargets.isHeld(row("SEND_MESSAGE", "cid_550e8400-e29b-41d4-a716-446655440000")))
            .isFalse()
    }

    @Test
    fun `a kind this build does not know is not held`() {
        assertThat(OutboxLocalTargets.isHeld(row("SOMETHING_FROM_A_NEWER_BUILD", "pending_x"))).isFalse()
    }

    @Test
    fun `a readable conversation identifier is not held`() {
        assertThat(OutboxLocalTargets.isHeld(row("READ_RECEIPT", "meeshy"))).isFalse()
    }

    @Test
    fun `the kinds that put their target in a route are the ones that can be held`() {
        val addressed = listOf(
            OutboxKind.EDIT_MESSAGE,
            OutboxKind.DELETE_MESSAGE,
            OutboxKind.ADD_REACTION,
            OutboxKind.REMOVE_REACTION,
            OutboxKind.READ_RECEIPT,
            OutboxKind.MARK_UNREAD,
            OutboxKind.UPDATE_CONVERSATION_PREFS,
            OutboxKind.PIN_MESSAGE,
            OutboxKind.UNPIN_MESSAGE,
            OutboxKind.LIKE_POST,
            OutboxKind.UNLIKE_POST,
            OutboxKind.BOOKMARK_POST,
            OutboxKind.UNBOOKMARK_POST,
            OutboxKind.BLOCK_USER,
            OutboxKind.UNBLOCK_USER,
            OutboxKind.SEND_FRIEND_REQUEST,
        )
        val notAddressed = listOf(
            OutboxKind.SEND_MESSAGE,
            OutboxKind.PUBLISH_STORY,
            OutboxKind.UPLOAD_MEDIA,
            OutboxKind.UPDATE_PROFILE,
            OutboxKind.UPDATE_SETTINGS,
            OutboxKind.UPDATE_PRIVACY_SETTINGS,
        )

        assertThat(addressed.filterNot { OutboxLocalTargets.isRouteAddressed(it) }).isEmpty()
        assertThat(notAddressed.filter { OutboxLocalTargets.isRouteAddressed(it) }).isEmpty()
    }
}
