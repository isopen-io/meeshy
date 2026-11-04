package me.meeshy.sdk.outbox

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.yield
import me.meeshy.sdk.media.MediaLoss
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class OutboxSendLifecycleTest {

    private fun send(cmid: String, state: OutboxState = OutboxState.PENDING, dependsOn: String? = null, lastError: String? = null) =
        outboxRow(cmid, OutboxKind.SEND_MESSAGE, OutboxLanes.forMessage("c1"), state = state, dependsOn = dependsOn, lastError = lastError)

    private fun upload(cmid: String, state: OutboxState = OutboxState.PENDING) =
        outboxRow(cmid, OutboxKind.UPLOAD_MEDIA, OutboxLanes.MEDIA, state = state)

    @Test
    fun `retryAll revives every failure with a fresh budget`() = withOwnedOutbox { outbox, db ->
        db.outboxDao().upsert(send("m1", OutboxState.EXHAUSTED).copy(attempts = 5))
        db.outboxDao().upsert(outboxRow("r1", state = OutboxState.EXHAUSTED).copy(attempts = 5))
        db.outboxDao().upsert(send("live", OutboxState.PENDING))

        val revived = outbox.retryAll()

        assertThat(revived).containsExactly("m1", "r1")
        assertThat(outbox.stateOf("m1")).isEqualTo(OutboxState.PENDING)
        assertThat(outbox.row("m1")?.attempts).isEqualTo(0)
    }

    @Test
    fun `retryAll leaves a definitively lost media alone since a replay would fail identically`() = withOwnedOutbox { outbox, db ->
        db.outboxDao().upsert(send("lost", OutboxState.EXHAUSTED, lastError = MediaLoss.REASON))

        assertThat(outbox.retryAll()).isEmpty()
        assertThat(outbox.stateOf("lost")).isEqualTo(OutboxState.EXHAUSTED)
    }

    @Test
    fun `retryByClientMessageId revives the failed bubble and its exhausted upload`() = withOwnedOutbox { outbox, db ->
        db.outboxDao().upsert(upload("u1", OutboxState.EXHAUSTED))
        db.outboxDao().upsert(send("m1", OutboxState.EXHAUSTED, dependsOn = OutboxDependencyKey.encode(setOf("u1"))))

        assertThat(outbox.retryByClientMessageId("m1")).isTrue()
        assertThat(outbox.stateOf("m1")).isEqualTo(OutboxState.PENDING)
        assertThat(outbox.stateOf("u1")).isEqualTo(OutboxState.PENDING)
        assertThat(outbox.retryByClientMessageId("ghost")).isFalse()
    }

    @Test
    fun `cancelPendingSend removes a pending send and ends its observers without an outcome`() = withOwnedOutbox { outbox, db ->
        db.outboxDao().upsert(send("m1"))
        coroutineScope {
            val observed = async(start = CoroutineStart.UNDISPATCHED) { outbox.outcomeFor("m1").toList() }
            yield()

            assertThat(outbox.cancelPendingSend("m1")).isTrue()

            assertThat(outbox.row("m1")).isNull()
            assertThat(observed.await()).isEmpty()
        }
    }

    @Test
    fun `cancelPendingSend also drops the pending upload nobody else waits for`() = withOwnedOutbox { outbox, db ->
        db.outboxDao().upsert(upload("u1"))
        db.outboxDao().upsert(upload("u2"))
        db.outboxDao().upsert(send("m1", dependsOn = OutboxDependencyKey.encode(setOf("u1"))))
        db.outboxDao().upsert(send("m2", dependsOn = OutboxDependencyKey.encode(setOf("u2"))))
        db.outboxDao().upsert(send("m3", dependsOn = OutboxDependencyKey.encode(setOf("u2"))))

        outbox.cancelPendingSend("m1")
        outbox.cancelPendingSend("m2")

        assertThat(outbox.row("u1")).isNull()
        assertThat(outbox.row("u2")).isNotNull()
    }

    @Test
    fun `cancelPendingSend never touches an inflight or a failed row`() = withOwnedOutbox { outbox, db ->
        db.outboxDao().upsert(send("flying", OutboxState.INFLIGHT))
        db.outboxDao().upsert(send("failed", OutboxState.EXHAUSTED))

        assertThat(outbox.cancelPendingSend("flying")).isFalse()
        assertThat(outbox.cancelPendingSend("failed")).isFalse()
        assertThat(outbox.row("flying")).isNotNull()
        assertThat(outbox.row("failed")).isNotNull()
    }

    @Test
    fun `clearSendMessageRow reaches a failed row that cancelPendingSend cannot, but spares an inflight one`() = withOwnedOutbox { outbox, db ->
        db.outboxDao().upsert(send("failed", OutboxState.EXHAUSTED))
        db.outboxDao().upsert(send("flying", OutboxState.INFLIGHT))

        outbox.clearSendMessageRow("failed")
        outbox.clearSendMessageRow("flying")
        outbox.clearSendMessageRow("never-existed")

        assertThat(outbox.row("failed")).isNull()
        assertThat(outbox.row("flying")).isNotNull()
    }

    @Test
    fun `clearSendMessageRow leaves the rows that are not a send`() = withOwnedOutbox { outbox, db ->
        db.outboxDao().upsert(outboxRow("react", state = OutboxState.EXHAUSTED))

        outbox.clearSendMessageRow("react")

        assertThat(outbox.row("react")).isNotNull()
    }

    @Test
    fun `hasUnsentRow stops an identical reaction being queued twice`() = withOwnedOutbox { outbox, _ ->
        outbox.enqueue(OutboxMutation(OutboxKind.ADD_REACTION, OutboxLanes.REACTION, "m1:👍", "{}", cmid = "r1"))

        assertThat(outbox.hasUnsentRow(OutboxKind.ADD_REACTION, "m1:👍")).isTrue()
        assertThat(outbox.hasUnsentRow(OutboxKind.ADD_REACTION, "m2:👍")).isFalse()
        assertThat(outbox.hasUnsentRow(OutboxKind.REMOVE_REACTION, "m1:👍")).isFalse()

        outbox.markExhausted("r1", "boom")
        assertThat(outbox.hasUnsentRow(OutboxKind.ADD_REACTION, "m1:👍")).isFalse()
    }
}
