package me.meeshy.sdk.outbox

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class OutboxTerminalRetentionTest {

    private val window = OutboxTerminalRetention.DISCARDABLE_WINDOW_MS

    @Test
    fun `a disposable kind has a window and a kind that carries the user's text has none`() {
        assertThat(OutboxTerminalRetention.windowFor(OutboxKind.ADD_REACTION)).isEqualTo(window)
        assertThat(OutboxTerminalRetention.windowFor(OutboxKind.BLOCK_USER)).isEqualTo(window)
        assertThat(OutboxTerminalRetention.windowFor(OutboxKind.SEND_MESSAGE)).isNull()
        assertThat(OutboxTerminalRetention.windowFor(OutboxKind.CREATE_POST)).isNull()
    }

    @Test
    fun `the window is a policy of the catalog, every kind answers consistently`() {
        OutboxKind.entries.forEach { kind ->
            assertThat(OutboxTerminalRetention.windowFor(kind) != null)
                .isEqualTo(OutboxKindCatalog.metaFor(kind).terminalDisposable)
        }
    }

    @Test
    fun `a disposable exhausted row leaves once its window has passed and not before`() = withOwnedOutbox { outbox, db ->
        val gaveUp = 100_000L
        db.outboxDao().upsert(outboxRow("r1", state = OutboxState.EXHAUSTED, updatedAt = gaveUp))

        assertThat(outbox.purgeDiscardableTerminalRows(nowMs = gaveUp + window - 1)).isEqualTo(0)
        assertThat(outbox.purgeDiscardableTerminalRows(nowMs = gaveUp + window + 1)).isEqualTo(1)
        assertThat(outbox.row("r1")).isNull()
    }

    @Test
    fun `a failed message is never collected however old`() = withOwnedOutbox { outbox, db ->
        db.outboxDao().upsert(
            outboxRow("msg", OutboxKind.SEND_MESSAGE, OutboxLanes.forMessage("c1"), state = OutboxState.EXHAUSTED, updatedAt = 1L),
        )

        assertThat(outbox.purgeDiscardableTerminalRows(nowMs = 1L + 365L * 24 * 3_600_000)).isEqualTo(0)
        assertThat(outbox.row("msg")).isNotNull()
    }

    @Test
    fun `a live row is never collected`() = withOwnedOutbox { outbox, db ->
        db.outboxDao().upsert(outboxRow("p", state = OutboxState.PENDING, updatedAt = 1L))

        assertThat(outbox.purgeDiscardableTerminalRows(nowMs = Long.MAX_VALUE / 2)).isEqualTo(0)
    }
}
