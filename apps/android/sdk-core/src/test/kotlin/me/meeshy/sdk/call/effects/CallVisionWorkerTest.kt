package me.meeshy.sdk.call.effects

import android.graphics.Bitmap
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import java.nio.ByteBuffer
import me.meeshy.sdk.model.call.effects.CallBlurTier
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.webrtc.VideoFrame

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallVisionWorkerTest {

    private class HeldSegmenter : CallPersonSegmenter {
        val answers = mutableListOf<(CallPersonMask?) -> Unit>()
        override fun segment(image: Bitmap, onMask: (CallPersonMask?) -> Unit) {
            answers += onMask
        }
        override fun close() = Unit
    }

    private val rung = CallBlurTier.Fast.segmentation!!
    private val second = 1_000_000_000L

    private fun camera(): VideoFrame.TextureBuffer {
        val i420 = mockk<VideoFrame.I420Buffer>(relaxed = true) {
            every { dataY } answers { ByteBuffer.allocate(320 * 240) }
            every { strideY } returns 320
            every { dataU } answers { ByteBuffer.allocate(160 * 120) }
            every { strideU } returns 160
            every { dataV } answers { ByteBuffer.allocate(160 * 120) }
            every { strideV } returns 160
        }
        val probe = mockk<VideoFrame.TextureBuffer>(relaxed = true) { every { toI420() } returns i420 }
        return mockk(relaxed = true) {
            every { width } returns 640
            every { height } returns 480
            every { cropAndScale(any(), any(), any(), any(), any(), any()) } returns probe
        }
    }

    private fun mask(value: Int) = CallPersonMask(2, 2, ByteArray(4) { value.toByte() })

    @Test
    fun `one analysis at a time, the frame offered during an analysis is dropped`() {
        val segmenter = HeldSegmenter()
        val store = CallPersonMaskStore(segmenter)
        store.submitIfDue(camera(), 0, 0L, rung)
        store.submitIfDue(camera(), 0, 5 * second, rung)
        assertThat(segmenter.answers).hasSize(1)
        segmenter.answers[0](mask(200))
        store.submitIfDue(camera(), 0, 6 * second, rung)
        assertThat(segmenter.answers).hasSize(2)
    }

    @Test
    fun `the analysis cadence follows the rung and not the camera`() {
        val segmenter = HeldSegmenter()
        val store = CallPersonMaskStore(segmenter)
        store.submitIfDue(camera(), 0, 0L, rung)
        segmenter.answers[0](mask(200))
        store.submitIfDue(camera(), 0, second / 60, rung)
        assertThat(segmenter.answers).hasSize(1)
    }

    @Test
    fun `a new mask is eased with the previous one, 60 percent new`() {
        val segmenter = HeldSegmenter()
        val store = CallPersonMaskStore(segmenter)
        store.submitIfDue(camera(), 0, 0L, rung)
        segmenter.answers[0](mask(100))
        assertThat(store.takeFresh()!!.values[0].toInt() and 0xFF).isEqualTo(100)
        store.submitIfDue(camera(), 0, second, rung)
        segmenter.answers[1](mask(200))
        assertThat(store.takeFresh()!!.values[0].toInt() and 0xFF).isEqualTo(160)
        assertThat(store.takeFresh()).isNull()
    }

    @Test
    fun `an answer that arrives after a reset never brings a stale silhouette back`() {
        val segmenter = HeldSegmenter()
        val store = CallPersonMaskStore(segmenter)
        store.submitIfDue(camera(), 0, 0L, rung)
        store.reset()
        segmenter.answers[0](mask(255))
        assertThat(store.isReady).isFalse()
        assertThat(store.takeFresh()).isNull()
    }

    @Test
    fun `a failed analysis frees the worker for the next one`() {
        val segmenter = HeldSegmenter()
        val store = CallPersonMaskStore(segmenter)
        store.submitIfDue(camera(), 0, 0L, rung)
        segmenter.answers[0](null)
        store.submitIfDue(camera(), 0, second, rung)
        assertThat(segmenter.answers).hasSize(2)
        assertThat(store.isReady).isFalse()
    }
}
