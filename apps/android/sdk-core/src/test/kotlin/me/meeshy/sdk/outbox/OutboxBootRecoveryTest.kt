package me.meeshy.sdk.outbox

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.media.MediaLoss
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class OutboxBootRecoveryTest {

    private val journal = mutableListOf<BootRecoveryReport>()

    private fun recovery(outbox: OutboxRepository, present: Set<String> = emptySet()) =
        OutboxBootRecovery(outbox, { cmid -> cmid in present }, { journal += it })

    @Test
    fun `a cold start resets an orphan inflight row to pending`() = withOwnedOutbox { outbox, db ->
        db.outboxDao().upsert(outboxRow("m1", state = OutboxState.INFLIGHT))

        val report = recovery(outbox).run(cold = true)

        assertThat(report.inflightReset).isEqualTo(1)
        assertThat(outbox.stateOf("m1")).isEqualTo(OutboxState.PENDING)
    }

    @Test
    fun `a cold start spares the row a live send of this process still holds`() = withOwnedOutbox { outbox, db ->
        db.outboxDao().upsert(outboxRow("live", state = OutboxState.PENDING))
        outbox.sendingLive("live") {
            val report = recovery(outbox).run(cold = true)

            assertThat(report.inflightReset).isEqualTo(0)
            assertThat(outbox.stateOf("live")).isEqualTo(OutboxState.INFLIGHT)
        }
    }

    @Test
    fun `back in the foreground only a stale inflight row is reclaimed`() = withOwnedOutbox { outbox, db ->
        val now = System.currentTimeMillis()
        db.outboxDao().upsert(outboxRow("fresh", state = OutboxState.INFLIGHT, updatedAt = now))
        db.outboxDao().upsert(outboxRow("stale", state = OutboxState.INFLIGHT, updatedAt = now - OutboxRepository.STALE_INFLIGHT_MS - 1))

        val report = recovery(outbox).run(cold = false)

        assertThat(report.inflightReset).isEqualTo(1)
        assertThat(outbox.stateOf("fresh")).isEqualTo(OutboxState.INFLIGHT)
        assertThat(outbox.stateOf("stale")).isEqualTo(OutboxState.PENDING)
    }

    @Test
    fun `a pending upload whose file is gone fails with the media-loss reason and one whose file is there stays`() = withOwnedOutbox { outbox, db ->
        db.outboxDao().upsert(outboxRow("gone", OutboxKind.UPLOAD_MEDIA, OutboxLanes.MEDIA))
        db.outboxDao().upsert(outboxRow("here", OutboxKind.UPLOAD_MEDIA, OutboxLanes.MEDIA))

        val report = recovery(outbox, present = setOf("here")).run(cold = true)

        assertThat(report.mediaOrphanFailed).isEqualTo(1)
        assertThat(outbox.stateOf("gone")).isEqualTo(OutboxState.EXHAUSTED)
        assertThat(outbox.row("gone")?.lastError).isEqualTo(MediaLoss.REASON)
        assertThat(outbox.stateOf("here")).isEqualTo(OutboxState.PENDING)
    }

    @Test
    fun `the report is journaled at every pass and the discardable terminal rows are purged`() = withOwnedOutbox { outbox, db ->
        db.outboxDao().upsert(outboxRow("old", OutboxKind.ADD_REACTION, state = OutboxState.EXHAUSTED, updatedAt = 1L))
        db.outboxDao().upsert(outboxRow("m1", state = OutboxState.INFLIGHT))

        val report = recovery(outbox).run(cold = true)

        assertThat(journal).containsExactly(report)
        assertThat(report).isEqualTo(BootRecoveryReport(inflightReset = 1, mediaOrphanFailed = 0, terminalPurged = 1))
        assertThat(recovery(outbox).run(cold = false).isEmpty).isTrue()
        assertThat(journal).hasSize(2)
    }
}
