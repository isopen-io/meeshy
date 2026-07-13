package me.meeshy.sdk.outbox

import com.google.common.truth.Truth.assertThat
import me.meeshy.core.database.entity.OutboxEntity
import org.junit.Test

private fun row(cmid: String, kind: OutboxKind, target: String) = OutboxEntity(
    cmid = cmid,
    lane = "lane",
    kind = kind.name,
    targetId = target,
    payload = "{}",
    dependsOn = null,
    attempts = 0,
    state = "PENDING",
    createdAt = 0L,
    updatedAt = 0L,
)

class OutboxCoalescerTest {

    @Test
    fun `delete of an unsent message annihilates the send`() {
        val send = row("s1", OutboxKind.SEND_MESSAGE, "cid_1")
        val delete = row("d1", OutboxKind.DELETE_MESSAGE, "cid_1")

        val decision = OutboxCoalescer.decide(delete, listOf(send))

        assertThat(decision).isEqualTo(CoalesceDecision.Annihilate(listOf("s1")))
    }

    @Test
    fun `repeated edit replaces the pending edit`() {
        val first = row("e1", OutboxKind.EDIT_MESSAGE, "m1")
        val second = row("e2", OutboxKind.EDIT_MESSAGE, "m1")

        val decision = OutboxCoalescer.decide(second, listOf(first))

        assertThat(decision).isEqualTo(CoalesceDecision.Replace(listOf("e1"), second))
    }

    @Test
    fun `delete supersedes a pending edit of a sent message`() {
        val edit = row("e1", OutboxKind.EDIT_MESSAGE, "m1")
        val delete = row("d1", OutboxKind.DELETE_MESSAGE, "m1")

        val decision = OutboxCoalescer.decide(delete, listOf(edit))

        assertThat(decision).isEqualTo(CoalesceDecision.Replace(listOf("e1"), delete))
    }

    @Test
    fun `reaction toggle cancels itself`() {
        val add = row("a1", OutboxKind.ADD_REACTION, "m1:thumbsup")
        val remove = row("r1", OutboxKind.REMOVE_REACTION, "m1:thumbsup")

        assertThat(OutboxCoalescer.decide(remove, listOf(add)))
            .isEqualTo(CoalesceDecision.Annihilate(listOf("a1")))
        assertThat(OutboxCoalescer.decide(add, listOf(remove)))
            .isEqualTo(CoalesceDecision.Annihilate(listOf("r1")))
    }

    @Test
    fun `repeated read receipt keeps the latest`() {
        val first = row("rr1", OutboxKind.READ_RECEIPT, "c1")
        val second = row("rr2", OutboxKind.READ_RECEIPT, "c1")

        val decision = OutboxCoalescer.decide(second, listOf(first))

        assertThat(decision).isEqualTo(CoalesceDecision.Replace(listOf("rr1"), second))
    }

    @Test
    fun `a different target is not coalesced`() {
        val editM1 = row("e1", OutboxKind.EDIT_MESSAGE, "m1")
        val editM2 = row("e2", OutboxKind.EDIT_MESSAGE, "m2")

        val decision = OutboxCoalescer.decide(editM2, listOf(editM1))

        assertThat(decision).isEqualTo(CoalesceDecision.Enqueue(editM2))
    }

    @Test
    fun `an unrelated mutation is enqueued`() {
        val send = row("s1", OutboxKind.SEND_MESSAGE, "cid_1")

        val decision = OutboxCoalescer.decide(send, emptyList())

        assertThat(decision).isEqualTo(CoalesceDecision.Enqueue(send))
    }

    @Test
    fun `block then unblock of the same user annihilates the block`() {
        val block = row("b1", OutboxKind.BLOCK_USER, "u1")
        val unblock = row("ub1", OutboxKind.UNBLOCK_USER, "u1")

        assertThat(OutboxCoalescer.decide(unblock, listOf(block)))
            .isEqualTo(CoalesceDecision.Annihilate(listOf("b1")))
    }

    @Test
    fun `unblock then block of the same user annihilates the unblock`() {
        val unblock = row("ub1", OutboxKind.UNBLOCK_USER, "u1")
        val block = row("b1", OutboxKind.BLOCK_USER, "u1")

        assertThat(OutboxCoalescer.decide(block, listOf(unblock)))
            .isEqualTo(CoalesceDecision.Annihilate(listOf("ub1")))
    }

    @Test
    fun `a repeated block of the same user keeps the latest`() {
        val first = row("b1", OutboxKind.BLOCK_USER, "u1")
        val second = row("b2", OutboxKind.BLOCK_USER, "u1")

        assertThat(OutboxCoalescer.decide(second, listOf(first)))
            .isEqualTo(CoalesceDecision.Replace(listOf("b1"), second))
    }

    @Test
    fun `a repeated unblock of the same user keeps the latest`() {
        val first = row("ub1", OutboxKind.UNBLOCK_USER, "u1")
        val second = row("ub2", OutboxKind.UNBLOCK_USER, "u1")

        assertThat(OutboxCoalescer.decide(second, listOf(first)))
            .isEqualTo(CoalesceDecision.Replace(listOf("ub1"), second))
    }

    @Test
    fun `a first block of a user is enqueued`() {
        val block = row("b1", OutboxKind.BLOCK_USER, "u1")

        assertThat(OutboxCoalescer.decide(block, emptyList()))
            .isEqualTo(CoalesceDecision.Enqueue(block))
    }

    @Test
    fun `blocking a different user is not coalesced`() {
        val blockU1 = row("b1", OutboxKind.BLOCK_USER, "u1")
        val unblockU2 = row("ub2", OutboxKind.UNBLOCK_USER, "u2")

        assertThat(OutboxCoalescer.decide(unblockU2, listOf(blockU1)))
            .isEqualTo(CoalesceDecision.Enqueue(unblockU2))
    }

    @Test
    fun `a first friend request to a receiver is enqueued`() {
        val request = row("f1", OutboxKind.SEND_FRIEND_REQUEST, "u1")

        assertThat(OutboxCoalescer.decide(request, emptyList()))
            .isEqualTo(CoalesceDecision.Enqueue(request))
    }

    @Test
    fun `pin then unpin of the same message annihilates the pin`() {
        val pin = row("p1", OutboxKind.PIN_MESSAGE, "m1")
        val unpin = row("up1", OutboxKind.UNPIN_MESSAGE, "m1")

        assertThat(OutboxCoalescer.decide(unpin, listOf(pin)))
            .isEqualTo(CoalesceDecision.Annihilate(listOf("p1")))
    }

    @Test
    fun `unpin then pin of the same message annihilates the unpin`() {
        val unpin = row("up1", OutboxKind.UNPIN_MESSAGE, "m1")
        val pin = row("p1", OutboxKind.PIN_MESSAGE, "m1")

        assertThat(OutboxCoalescer.decide(pin, listOf(unpin)))
            .isEqualTo(CoalesceDecision.Annihilate(listOf("up1")))
    }

    @Test
    fun `a repeated pin of the same message keeps the latest`() {
        val first = row("p1", OutboxKind.PIN_MESSAGE, "m1")
        val second = row("p2", OutboxKind.PIN_MESSAGE, "m1")

        assertThat(OutboxCoalescer.decide(second, listOf(first)))
            .isEqualTo(CoalesceDecision.Replace(listOf("p1"), second))
    }

    @Test
    fun `a first pin of a message is enqueued`() {
        val pin = row("p1", OutboxKind.PIN_MESSAGE, "m1")

        assertThat(OutboxCoalescer.decide(pin, emptyList()))
            .isEqualTo(CoalesceDecision.Enqueue(pin))
    }

    @Test
    fun `pinning a different message is not coalesced`() {
        val pinM1 = row("p1", OutboxKind.PIN_MESSAGE, "m1")
        val unpinM2 = row("up2", OutboxKind.UNPIN_MESSAGE, "m2")

        assertThat(OutboxCoalescer.decide(unpinM2, listOf(pinM1)))
            .isEqualTo(CoalesceDecision.Enqueue(unpinM2))
    }

    @Test
    fun `a repeated friend request to the same receiver supersedes the pending one`() {
        val first = row("f1", OutboxKind.SEND_FRIEND_REQUEST, "u1")
        val second = row("f2", OutboxKind.SEND_FRIEND_REQUEST, "u1")

        // Sending twice is idempotent — only one request can exist, latest wins.
        assertThat(OutboxCoalescer.decide(second, listOf(first)))
            .isEqualTo(CoalesceDecision.Replace(listOf("f1"), second))
    }

    @Test
    fun `a friend request to a different receiver is not coalesced`() {
        val toU1 = row("f1", OutboxKind.SEND_FRIEND_REQUEST, "u1")
        val toU2 = row("f2", OutboxKind.SEND_FRIEND_REQUEST, "u2")

        assertThat(OutboxCoalescer.decide(toU2, listOf(toU1)))
            .isEqualTo(CoalesceDecision.Enqueue(toU2))
    }

    @Test
    fun `a first profile edit is enqueued`() {
        val edit = row("p1", OutboxKind.UPDATE_PROFILE, "me")

        assertThat(OutboxCoalescer.decide(edit, emptyList()))
            .isEqualTo(CoalesceDecision.Enqueue(edit))
    }

    @Test
    fun `a repeated profile edit keeps only the latest snapshot`() {
        val first = row("p1", OutboxKind.UPDATE_PROFILE, "me")
        val second = row("p2", OutboxKind.UPDATE_PROFILE, "me")

        // Each edit carries the full PATCH body — the newest subsumes the pending one.
        assertThat(OutboxCoalescer.decide(second, listOf(first)))
            .isEqualTo(CoalesceDecision.Replace(listOf("p1"), second))
    }

    @Test
    fun `a profile edit for a different user id is not coalesced`() {
        val mine = row("p1", OutboxKind.UPDATE_PROFILE, "me")
        val theirs = row("p2", OutboxKind.UPDATE_PROFILE, "someone-else")

        assertThat(OutboxCoalescer.decide(theirs, listOf(mine)))
            .isEqualTo(CoalesceDecision.Enqueue(theirs))
    }

    @Test
    fun `a first settings update is enqueued`() {
        val update = row("s1", OutboxKind.UPDATE_SETTINGS, "me")

        assertThat(OutboxCoalescer.decide(update, emptyList()))
            .isEqualTo(CoalesceDecision.Enqueue(update))
    }

    @Test
    fun `a repeated settings update keeps only the latest snapshot`() {
        val first = row("s1", OutboxKind.UPDATE_SETTINGS, "me")
        val second = row("s2", OutboxKind.UPDATE_SETTINGS, "me")

        // Each settings write carries the full preference snapshot — the newest
        // subsumes the pending one so an offline burst of toggles collapses to one PATCH.
        assertThat(OutboxCoalescer.decide(second, listOf(first)))
            .isEqualTo(CoalesceDecision.Replace(listOf("s1"), second))
    }

    @Test
    fun `a settings update for a different user id is not coalesced`() {
        val mine = row("s1", OutboxKind.UPDATE_SETTINGS, "me")
        val theirs = row("s2", OutboxKind.UPDATE_SETTINGS, "someone-else")

        assertThat(OutboxCoalescer.decide(theirs, listOf(mine)))
            .isEqualTo(CoalesceDecision.Enqueue(theirs))
    }
}
