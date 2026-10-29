package me.meeshy.sdk.call.effects

import android.graphics.Bitmap
import android.os.Handler
import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import me.meeshy.sdk.model.call.VideoFilterConfig
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.applyingPreset
import org.junit.Test
import org.webrtc.VideoFrame
import org.webrtc.VideoSink

class CallVideoEffectsProcessorTest {

    private class RecordingSink : VideoSink {
        val frames = mutableListOf<VideoFrame>()
        override fun onFrame(frame: VideoFrame) {
            frames += frame
        }
    }

    private class NeverSegments : CallPersonSegmenter {
        var segmented = 0
        override fun segment(image: Bitmap, onMask: (CallPersonMask?) -> Unit) {
            segmented++
        }
        override fun close() = Unit
    }

    private fun rig(): Triple<CallVideoEffectsProcessor, RecordingSink, NeverSegments> {
        val segmenter = NeverSegments()
        val processor = CallVideoEffectsProcessor(mockk<Handler>(relaxed = true), segmenter) { false }
        val sink = RecordingSink()
        processor.setSink(sink)
        return Triple(processor, sink, segmenter)
    }

    private fun frame(buffer: VideoFrame.Buffer = mockk<VideoFrame.I420Buffer>(relaxed = true)) = VideoFrame(buffer, 90, 1L)

    @Test
    fun `without a chosen effect the camera frame goes out as is`() {
        val (processor, sink, segmenter) = rig()
        val camera = frame(mockk<VideoFrame.TextureBuffer>(relaxed = true))
        processor.onFrameCaptured(camera)
        assertThat(sink.frames).containsExactly(camera)
        assertThat(segmenter.segmented).isEqualTo(0)
    }

    @Test
    fun `a frame the GPU cannot read is forwarded untouched even with an effect chosen`() {
        val (processor, sink, _) = rig()
        processor.setConfig(VideoFilterConfig(backgroundBlurEnabled = true).applyingPreset(VideoFilterPreset.Warm))
        val camera = frame()
        processor.onFrameCaptured(camera)
        assertThat(sink.frames).containsExactly(camera)
    }

    @Test
    fun `a released processor sends nothing more`() {
        val (processor, sink, _) = rig()
        processor.release()
        processor.onFrameCaptured(frame())
        assertThat(sink.frames).isEmpty()
    }
}
