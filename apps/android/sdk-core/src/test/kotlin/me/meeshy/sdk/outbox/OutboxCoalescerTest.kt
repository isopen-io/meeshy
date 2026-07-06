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
}
