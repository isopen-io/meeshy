package me.meeshy.sdk.model.syncpill

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.sync.OutboxNavigationSource
import me.meeshy.sdk.model.sync.OutboxUiIcon
import me.meeshy.sdk.model.sync.OutboxUiItem
import me.meeshy.sdk.model.sync.OutboxUiKind
import me.meeshy.sdk.model.sync.OutboxUiStatus
import org.junit.Test

class SyncPillStateDeriveTest {
    private fun item(status: OutboxUiStatus, createdAt: Long = 0, updatedAt: Long = createdAt) = OutboxUiItem(
        "i$createdAt$status", OutboxUiKind.MESSAGE, null, OutboxUiIcon.TEXT, 0, OutboxNavigationSource.Unknown,
        status, createdAt, updatedAt,
    )

    @Test
    fun `failed beats offline beats syncing beats hidden`() {
        val failed = item(OutboxUiStatus.EXHAUSTED, 10)
        val pending = item(OutboxUiStatus.PENDING, 10)
        assertThat(SyncPillState.derive(listOf(failed, pending), isOffline = true, now = 20)).isInstanceOf(SyncPillState.Failed::class.java)
        assertThat(SyncPillState.derive(listOf(pending), isOffline = true, now = 20)).isInstanceOf(SyncPillState.Offline::class.java)
        assertThat(SyncPillState.derive(listOf(pending), isOffline = false, now = 20)).isInstanceOf(SyncPillState.Syncing::class.java)
        assertThat(SyncPillState.derive(emptyList(), isOffline = false, now = 20)).isEqualTo(SyncPillState.Hidden)
    }

    @Test
    fun `offline with an empty queue is still offline, the host just has no entry to show`() {
        assertThat(SyncPillState.derive(emptyList(), isOffline = true, now = 0)).isEqualTo(SyncPillState.Offline(emptyList()))
    }

    @Test
    fun `an inflight row older than 4 seconds counts as offline on a good network`() {
        val inflight = item(OutboxUiStatus.INFLIGHT, createdAt = 0)
        assertThat(SyncPillState.derive(listOf(inflight), false, now = 4_000)).isInstanceOf(SyncPillState.Syncing::class.java)
        assertThat(SyncPillState.derive(listOf(inflight), false, now = 4_001)).isInstanceOf(SyncPillState.Offline::class.java)
    }

    @Test
    fun `a failure expires 60 seconds after updatedAt and the live work stays`() {
        val dead = item(OutboxUiStatus.EXHAUSTED, createdAt = 0, updatedAt = 1_000)
        val live = item(OutboxUiStatus.PENDING, createdAt = 61_500)
        val state = SyncPillState.derive(listOf(dead, live), false, now = 61_001)
        assertThat(state).isInstanceOf(SyncPillState.Syncing::class.java)
        assertThat(state.items).containsExactly(live)
    }

    @Test
    fun `the wake-up is armed on the nearest expiry only`() {
        val a = item(OutboxUiStatus.EXHAUSTED, 0, updatedAt = 5_000)
        val b = item(OutboxUiStatus.FAILED, 1, updatedAt = 2_000)
        val pending = item(OutboxUiStatus.PENDING, 2)
        assertThat(SyncPillState.nextExpiry(listOf(a, b, pending), now = 10_000)).isEqualTo(62_000)
        assertThat(SyncPillState.nextExpiry(listOf(pending), now = 10_000)).isNull()
        assertThat(SyncPillState.nextExpiry(listOf(b), now = 62_000)).isNull()
    }
}
