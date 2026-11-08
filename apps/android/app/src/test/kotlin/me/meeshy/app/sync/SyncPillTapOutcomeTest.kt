package me.meeshy.app.sync

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.connection.ConnectionPill
import me.meeshy.sdk.model.connection.SyncPillEntry
import me.meeshy.sdk.model.sync.OutboxNavigationSource
import me.meeshy.sdk.model.sync.OutboxUiIcon
import me.meeshy.sdk.model.sync.OutboxUiItem
import me.meeshy.sdk.model.sync.OutboxUiKind
import me.meeshy.sdk.model.sync.OutboxUiStatus
import me.meeshy.sdk.model.syncpill.SyncPillPresenter
import me.meeshy.sdk.model.syncpill.SyncPillTapOutcome
import org.junit.Test

/** Port de `SyncPillRetryWiringTests.swift` : relancer > naviguer > avancer. */
class SyncPillTapOutcomeTest {
    private fun outcome(status: OutboxUiStatus, source: OutboxNavigationSource, pill: ConnectionPill = ConnectionPill.HIDDEN): SyncPillTapOutcome {
        val item = OutboxUiItem("o1", OutboxUiKind.POST_COMMENT, null, OutboxUiIcon.TEXT, 0, source, status, 0)
        return SyncPillPresenter.rows(pill, listOf(SyncPillEntry.forOperation(item))).last().tapOutcome
    }

    @Test
    fun `une ligne epuisee se relance meme avec une source`() {
        assertThat(outcome(OutboxUiStatus.EXHAUSTED, OutboxNavigationSource.Post("p1"))).isEqualTo(SyncPillTapOutcome.Retry("o1"))
    }

    @Test
    fun `une ligne en vol avec source navigue`() {
        assertThat(outcome(OutboxUiStatus.INFLIGHT, OutboxNavigationSource.Post("p1")))
            .isEqualTo(SyncPillTapOutcome.Navigate(OutboxNavigationSource.Post("p1")))
    }

    @Test
    fun `une publication sans emplacement n'a nulle part ou aller`() {
        assertThat(outcome(OutboxUiStatus.PENDING, OutboxNavigationSource.Unknown)).isEqualTo(SyncPillTapOutcome.Advance)
    }

    @Test
    fun `une ligne de statut pure avance la rotation`() {
        val row = SyncPillPresenter.rows(ConnectionPill.OFFLINE, emptyList()).single()
        assertThat(row.tapOutcome).isEqualTo(SyncPillTapOutcome.Advance)
    }
}
