package me.meeshy.sdk.model.syncpill

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.sync.OutboxNavigationSource
import me.meeshy.sdk.model.sync.OutboxUiIcon
import me.meeshy.sdk.model.sync.OutboxUiItem
import me.meeshy.sdk.model.sync.OutboxUiKind
import me.meeshy.sdk.model.sync.OutboxUiStatus
import org.junit.Test

class PendingBannersTest {
    private fun row(kind: OutboxUiKind, other: String? = null, status: OutboxUiStatus = OutboxUiStatus.PENDING) =
        OutboxUiItem("i", kind, null, OutboxUiIcon.NONE, 0, OutboxNavigationSource.Unknown, status, 0, otherKey = other)

    @Test
    fun `only pending settings are counted`() {
        val count = PendingBanners.pendingSettings(
            listOf(
                row(OutboxUiKind.OTHER, "updateSettings"),
                row(OutboxUiKind.OTHER, "updateSettings", OutboxUiStatus.INFLIGHT),
                row(OutboxUiKind.OTHER, "markAsRead"),
                row(OutboxUiKind.MESSAGE),
            ),
        )
        assertThat(count).isEqualTo(2)
    }

    @Test
    fun `a pending story never feeds the top banner`() {
        assertThat(PendingBanners.pendingSettings(listOf(row(OutboxUiKind.STORY), row(OutboxUiKind.STORY)))).isEqualTo(0)
    }

    @Test
    fun `a row that gave up is no longer pending`() {
        val count = PendingBanners.pendingSettings(listOf(row(OutboxUiKind.OTHER, "updateSettings", OutboxUiStatus.EXHAUSTED)))
        assertThat(count).isEqualTo(0)
    }
}
