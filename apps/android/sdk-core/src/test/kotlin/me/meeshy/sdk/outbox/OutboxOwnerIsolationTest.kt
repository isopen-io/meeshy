package me.meeshy.sdk.outbox

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class OutboxOwnerIsolationTest {

    private val sent = mutableListOf<String>()

    private fun drainer(outbox: OutboxRepository, current: String?) = OutboxDrainer(
        outbox,
        mapOf(OutboxKind.CREATE_POST to MutationSender { row -> sent += row.cmid; SendResult.Success }),
        currentOwner = { current },
    )

    private fun post(cmid: String, owner: String?) =
        outboxRow(cmid, OutboxKind.CREATE_POST, OutboxLanes.POST, ownerId = owner)

    @Test
    fun `every enqueued row carries the account that enqueued it`() = withOwnedOutbox(signedIn = { "A" }) { outbox, _ ->
        outbox.enqueue(OutboxMutation(OutboxKind.CREATE_POST, OutboxLanes.POST, "p1", "{}", cmid = "p1"))

        assertThat(outbox.row("p1")?.ownerId).isEqualTo("A")
    }

    @Test
    fun `a pending publication of A is never replayed under B`() = withOwnedOutbox { outbox, db ->
        db.outboxDao().upsert(post("pubA", "A"))

        drainer(outbox, current = "B").drainLane(OutboxLanes.POST)

        assertThat(sent).isEmpty()
        assertThat(outbox.stateOf("pubA")).isEqualTo(OutboxState.PENDING)
        assertThat(outbox.row("pubA")?.ownerId).isEqualTo("A")
    }

    @Test
    fun `retryAll revives the failures of the signed-in account only`() = withOwnedOutbox(signedIn = { "B" }) { outbox, db ->
        db.outboxDao().upsert(post("failA", "A").copy(state = OutboxState.EXHAUSTED.name))
        db.outboxDao().upsert(post("failB", "B").copy(state = OutboxState.EXHAUSTED.name))

        val revived = outbox.retryAll()

        assertThat(revived).containsExactly("failB")
        assertThat(outbox.stateOf("failA")).isEqualTo(OutboxState.EXHAUSTED)
        assertThat(outbox.row("failA")?.ownerId).isEqualTo("A")
    }

    @Test
    fun `a user retry never re-attributes a row that has an author`() = withOwnedOutbox(signedIn = { "B" }) { outbox, db ->
        db.outboxDao().upsert(post("failA", "A").copy(state = OutboxState.EXHAUSTED.name))

        outbox.retry("failA")

        assertThat(outbox.row("failA")?.ownerId).isEqualTo("A")
    }
}
