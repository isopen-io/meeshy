package me.meeshy.sdk.model.composer.capture

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CaptureSegmentsTest {
    private fun seg(id: String, d: Double) = CaptureSegment(id = id, path = "/cache/$id.mp4", durationSec = d)

    @Test
    fun `total sums closed segments and ignores negative durations`() {
        assertThat(CaptureSegments.totalDuration(listOf(seg("a", 2.0), seg("b", 3.5), seg("c", -1.0)))).isEqualTo(5.5)
    }

    @Test
    fun `elapsed adds the live take only while recording`() {
        val s = listOf(seg("a", 2.0))
        assertThat(CaptureSegments.elapsed(s, live = 1.5, recording = true)).isEqualTo(3.5)
        assertThat(CaptureSegments.elapsed(s, live = 1.5, recording = false)).isEqualTo(2.0)
        assertThat(CaptureSegments.elapsed(s, live = -4.0, recording = true)).isEqualTo(2.0)
    }

    @Test
    fun `dropping the last returns the file to delete and recomposes nothing`() {
        val dropped = CaptureSegments.droppingLast(listOf(seg("a", 1.0), seg("b", 2.0)))
        assertThat(dropped.kept.map { it.id }).containsExactly("a")
        assertThat(dropped.orphanPath).isEqualTo("/cache/b.mp4")
    }

    @Test
    fun `dropping from an empty list is a no-op`() {
        val dropped = CaptureSegments.droppingLast(emptyList())
        assertThat(dropped.kept).isEmpty()
        assertThat(dropped.orphanPath).isNull()
    }

    @Test
    fun `shares sum to one and fall back to equal parts on a zero total`() {
        assertThat(CaptureSegments.shares(listOf(seg("a", 1.0), seg("b", 3.0)))).containsExactly(0.25, 0.75).inOrder()
        assertThat(CaptureSegments.shares(listOf(seg("a", 0.0), seg("b", 0.0)))).containsExactly(0.5, 0.5).inOrder()
        assertThat(CaptureSegments.shares(emptyList())).isEmpty()
    }

    @Test
    fun `validation needs a segment and a merge needs two`() {
        assertThat(CaptureSegments.canValidate(emptyList())).isFalse()
        assertThat(CaptureSegments.canValidate(listOf(seg("a", 1.0)))).isTrue()
        assertThat(CaptureSegments.needsMerge(listOf(seg("a", 1.0)))).isFalse()
        assertThat(CaptureSegments.needsMerge(listOf(seg("a", 1.0), seg("b", 1.0)))).isTrue()
    }

    @Test
    fun `pending segments ask before closing`() {
        assertThat(CaptureSegments.asksBeforeClosing(emptyList())).isFalse()
        assertThat(CaptureSegments.asksBeforeClosing(listOf(seg("a", 1.0)))).isTrue()
    }
}
