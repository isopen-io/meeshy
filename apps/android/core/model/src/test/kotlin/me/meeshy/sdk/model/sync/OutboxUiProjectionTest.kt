package me.meeshy.sdk.model.sync

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class OutboxUiProjectionTest {
    private fun item(id: String, status: OutboxUiStatus, createdAt: Long, updatedAt: Long = createdAt) = OutboxUiItem(
        id, OutboxUiKind.MESSAGE, null, OutboxUiIcon.TEXT, 0, OutboxNavigationSource.Unknown, status, createdAt, updatedAt,
    )

    @Test
    fun `a preview over 60 characters is cut and ends with an ellipsis`() {
        val cut = OutboxUiProjection.truncatePreview("a".repeat(61))
        assertThat(cut).isEqualTo("a".repeat(60) + "…")
        assertThat(OutboxUiProjection.truncatePreview("a".repeat(60))).isEqualTo("a".repeat(60))
    }

    @Test
    fun `truncation never splits an emoji`() {
        val cut = OutboxUiProjection.truncatePreview("😀".repeat(70))
        assertThat(cut).isEqualTo("😀".repeat(60) + "…")
    }

    @Test
    fun `the terminal window is measured on updatedAt not createdAt`() {
        val oldSendFailingNow = item("a", OutboxUiStatus.EXHAUSTED, createdAt = 0, updatedAt = 1_000_000)
        val staleFailure = item("b", OutboxUiStatus.EXHAUSTED, createdAt = 0, updatedAt = 100)
        val now = 1_030_000L
        assertThat(OutboxUiProjection.isDisplayable(oldSendFailingNow, now)).isTrue()
        assertThat(OutboxUiProjection.isDisplayable(staleFailure, now)).isFalse()
        assertThat(OutboxUiProjection.isDisplayable(item("c", OutboxUiStatus.PENDING, 0), now)).isTrue()
    }

    @Test
    fun `head keeps 50 rows oldest first`() {
        val items = (1..80).map { item("i$it", OutboxUiStatus.PENDING, createdAt = (81 - it).toLong()) }
        val head = OutboxUiProjection.head(items, now = 100)
        assertThat(head).hasSize(50)
        assertThat(head.first().id).isEqualTo("i80")
    }
}
