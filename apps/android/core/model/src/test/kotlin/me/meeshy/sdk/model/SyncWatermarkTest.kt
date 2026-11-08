package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SyncWatermarkTest {

    private fun received(at: Long) = WatermarkCandidate(at, isOwn = false, isServerConfirmed = false)
    private fun ownConfirmed(at: Long) = WatermarkCandidate(at, isOwn = true, isServerConfirmed = true)
    private fun ownPending(at: Long) = WatermarkCandidate(at, isOwn = true, isServerConfirmed = false)

    @Test
    fun `the newest server timestamp wins regardless of order`() {
        assertThat(SyncWatermark.newest(listOf(received(5), ownConfirmed(9), received(7)))).isEqualTo(9)
    }

    @Test
    fun `an optimistic or failed own message is never the watermark`() {
        assertThat(SyncWatermark.newest(listOf(received(5), ownPending(99)))).isEqualTo(5)
    }

    @Test
    fun `only pending own messages gives no watermark`() {
        assertThat(SyncWatermark.newest(listOf(ownPending(1)))).isNull()
        assertThat(SyncWatermark.newest(emptyList())).isNull()
    }
}
