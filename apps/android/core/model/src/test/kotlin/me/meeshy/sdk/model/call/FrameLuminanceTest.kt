package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of the pure Y-plane luma sampler: uniform planes average
 * to their value, sub-sampling honours the stride, row padding is skipped,
 * unsigned bytes decode correctly, and degenerate geometry yields `null` (skip
 * the frame) rather than a fake pitch-black reading.
 */
class FrameLuminanceTest {

    private fun plane(size: Int, value: Int): ByteArray =
        ByteArray(size) { value.toByte() }

    // --- happy path ------------------------------------------------------------

    @Test
    fun `a uniform plane averages to its constant value`() {
        val avg = FrameLuminance.averageOfYPlane(plane(64, 200), width = 8, height = 8, step = 1)
        assertThat(avg).isEqualTo(200.0f)
    }

    @Test
    fun `unsigned bytes decode so a full-white plane reads 255 not minus one`() {
        val avg = FrameLuminance.averageOfYPlane(plane(16, 0xFF), width = 4, height = 4, step = 1)
        assertThat(avg).isEqualTo(255.0f)
    }

    @Test
    fun `a pitch-black plane averages to zero`() {
        val avg = FrameLuminance.averageOfYPlane(plane(16, 0), width = 4, height = 4, step = 1)
        assertThat(avg).isEqualTo(0.0f)
    }

    // --- sub-sampling ----------------------------------------------------------

    @Test
    fun `the step skips pixels so only sampled pixels contribute`() {
        // 4x1 row: sampled columns 0 and 2 are bright, skipped columns 1 and 3 are dark.
        val row = byteArrayOf(100, 0, 100, 0)
        val avg = FrameLuminance.averageOfYPlane(row, width = 4, height = 1, step = 2)
        assertThat(avg).isEqualTo(100.0f)
    }

    @Test
    fun `the default sampling step is eight`() {
        assertThat(FrameLuminance.DEFAULT_SAMPLE_STEP).isEqualTo(8)
    }

    // --- row padding -----------------------------------------------------------

    @Test
    fun `row padding beyond the visible width is not sampled`() {
        // width 2, rowStride 4: bytes at columns 2,3 are padding and must be ignored.
        // Row 0: [50, 50, 250, 250]  Row 1: [50, 50, 250, 250] → only the 50s count.
        val padded = byteArrayOf(50, 50, 99, 99, 50, 50, 99, 99)
        val avg = FrameLuminance.averageOfYPlane(padded, width = 2, height = 2, rowStride = 4, step = 1)
        assertThat(avg).isEqualTo(50.0f)
    }

    // --- degenerate geometry → null -------------------------------------------

    @Test
    fun `non-positive width yields null`() {
        assertThat(FrameLuminance.averageOfYPlane(plane(16, 10), width = 0, height = 4)).isNull()
    }

    @Test
    fun `non-positive height yields null`() {
        assertThat(FrameLuminance.averageOfYPlane(plane(16, 10), width = 4, height = 0)).isNull()
    }

    @Test
    fun `non-positive step yields null`() {
        assertThat(FrameLuminance.averageOfYPlane(plane(16, 10), width = 4, height = 4, step = 0)).isNull()
    }

    @Test
    fun `a row stride smaller than the width yields null`() {
        assertThat(
            FrameLuminance.averageOfYPlane(plane(16, 10), width = 4, height = 4, rowStride = 2),
        ).isNull()
    }

    @Test
    fun `a plane too small for the declared geometry yields null`() {
        // Declares 8x8 tightly packed (needs 64 bytes) but only 10 are supplied.
        assertThat(
            FrameLuminance.averageOfYPlane(plane(10, 10), width = 8, height = 8, step = 1),
        ).isNull()
    }

    @Test
    fun `an empty plane yields null`() {
        assertThat(FrameLuminance.averageOfYPlane(ByteArray(0), width = 4, height = 4)).isNull()
    }
}
