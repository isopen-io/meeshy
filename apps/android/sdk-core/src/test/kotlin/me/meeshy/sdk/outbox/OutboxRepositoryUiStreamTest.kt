package me.meeshy.sdk.outbox

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.sync.OutboxUiStatus
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class OutboxRepositoryUiStreamTest {

    @Test
    fun `observeUiItems re-emits on each row change, oldest first`() = withOwnedOutbox { outbox, db ->
        outbox.observeUiItems().test {
            assertThat(awaitItem()).isEmpty()
            db.outboxDao().upsert(outboxRow("a", OutboxKind.UPDATE_PROFILE, OutboxLanes.PROFILE, updatedAt = 1))
            assertThat(awaitItem().map { it.id }).containsExactly("a")
            db.outboxDao().upsert(outboxRow("b", OutboxKind.CREATE_POST, OutboxLanes.POST, updatedAt = 2))
            assertThat(awaitItem().map { it.id }).containsExactly("a", "b").inOrder()
            db.outboxDao().updateState("a", OutboxState.EXHAUSTED.name, 5, now = 9)
            val items = awaitItem()
            assertThat(items.first { it.id == "a" }.status).isEqualTo(OutboxUiStatus.EXHAUSTED)
            assertThat(items.first { it.id == "a" }.updatedAt).isEqualTo(9)
        }
    }
}
