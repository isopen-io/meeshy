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
    fun `counts come from the queue, settings and stories apart`() {
        val counts = PendingBanners.counts(
            listOf(
                row(OutboxUiKind.OTHER, "updateSettings"),
                row(OutboxUiKind.OTHER, "updateSettings", OutboxUiStatus.INFLIGHT),
                row(OutboxUiKind.OTHER, "markAsRead"),
                row(OutboxUiKind.STORY),
                row(OutboxUiKind.MESSAGE),
            ),
        )
        assertThat(counts).isEqualTo(PendingBannerCounts(settings = 2, stories = 1))
    }

    @Test
    fun `a row that gave up is no longer pending`() {
        val counts = PendingBanners.counts(listOf(row(OutboxUiKind.STORY, status = OutboxUiStatus.EXHAUSTED)))
        assertThat(counts).isEqualTo(PendingBannerCounts(0, 0))
    }

    @Test
    fun `a story banner dismissed at a count returns only when the count changes`() {
        assertThat(PendingBanners.isStoryBannerVisible(count = 2, dismissedAtCount = null)).isTrue()
        assertThat(PendingBanners.isStoryBannerVisible(count = 2, dismissedAtCount = 2)).isFalse()
        assertThat(PendingBanners.isStoryBannerVisible(count = 3, dismissedAtCount = 2)).isTrue()
        assertThat(PendingBanners.isStoryBannerVisible(count = 0, dismissedAtCount = null)).isFalse()
    }

    @Test
    fun `a swipe up or sideways dismisses, a swipe down or a small move does not`() {
        assertThat(PendingBanners.shouldDismiss(dxDp = 0f, dyDp = -30f)).isTrue()
        assertThat(PendingBanners.shouldDismiss(dxDp = 30f, dyDp = 0f)).isTrue()
        assertThat(PendingBanners.shouldDismiss(dxDp = -30f, dyDp = 0f)).isTrue()
        assertThat(PendingBanners.shouldDismiss(dxDp = 0f, dyDp = 60f)).isFalse()
        assertThat(PendingBanners.shouldDismiss(dxDp = 10f, dyDp = -10f)).isFalse()
    }
}
