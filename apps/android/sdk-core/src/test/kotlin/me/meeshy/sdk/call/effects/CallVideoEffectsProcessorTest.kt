package me.meeshy.sdk.call.effects

import android.graphics.Bitmap
import android.os.Handler
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import java.nio.ByteBuffer
import me.meeshy.sdk.model.call.CallFaceEffect
import me.meeshy.sdk.model.call.selectingFaceEffect
import me.meeshy.sdk.model.composer.look.CallFaceLandmarks
import me.meeshy.sdk.model.composer.look.FaceBox
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

    private class HeldDetector : CallFaceDetecting {
        val probes = mutableListOf<Triple<Int, Int, Int>>()
        var answer: ((CallFaceLandmarks?) -> Unit)? = null
        var closed = false
        override fun detect(nv21: ByteArray, width: Int, height: Int, rotation: Int, onFace: (CallFaceLandmarks?) -> Unit) {
            probes += Triple(width, height, rotation)
            answer = onFace
        }
        override fun close() {
            closed = true
        }
    }

    private val faces = HeldDetector()

    private fun rig(): Triple<CallVideoEffectsProcessor, RecordingSink, NeverSegments> {
        val segmenter = NeverSegments()
        val processor = CallVideoEffectsProcessor(mockk<Handler>(relaxed = true), segmenter, { false }, faces = faces)
        val sink = RecordingSink()
        processor.setSink(sink)
        return Triple(processor, sink, segmenter)
    }

    /** A 640 × 480 camera texture whose 320-wide probe reads back as I420. */
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
    fun `a released processor sends nothing more and lets the face detector go`() {
        val (processor, sink, _) = rig()
        processor.release()
        processor.onFrameCaptured(frame())
        assertThat(sink.frames).isEmpty()
        assertThat(faces.closed).isTrue()
    }

    @Test
    fun `natural complexion looks for the face off the frame, and sends the camera as is until one is known`() {
        val (processor, sink, _) = rig()
        val frames = List(4) { frame(camera()) }
        frames.forEach(processor::onFrameCaptured)
        assertThat(sink.frames).containsExactlyElementsIn(frames).inOrder()
        assertThat(faces.probes).containsExactly(Triple(320, 240, 90))
    }

    @Test
    fun `one detection at a time, the next one only once the detector has answered`() {
        val (processor, _, _) = rig()
        repeat(6) { processor.onFrameCaptured(frame(camera())) }
        assertThat(faces.probes).hasSize(1)
        faces.answer!!(null)
        repeat(2) { processor.onFrameCaptured(frame(camera())) }
        assertThat(faces.probes).hasSize(2)
    }

    @Test
    fun `an effect that needs no face never asks the detector`() {
        val (processor, _, _) = rig()
        processor.setConfig(VideoFilterConfig(naturalComplexionEnabled = false).applyingPreset(VideoFilterPreset.Warm).selectingFaceEffect(CallFaceEffect.Volcano))
        repeat(6) { processor.onFrameCaptured(frame(camera())) }
        assertThat(faces.probes).isEmpty()
    }

    @Test
    fun `a stylized effect draws without waiting for a face, and falls back to the camera when the GPU fails`() {
        val (processor, sink, _) = rig()
        processor.setConfig(VideoFilterConfig().selectingFaceEffect(CallFaceEffect.Demon))
        val camera = frame(camera())
        processor.onFrameCaptured(camera)
        assertThat(sink.frames).containsExactly(camera)
        faces.answer?.invoke(CallFaceLandmarks(FaceBox(0.3f, 0.2f, 0.4f, 0.5f)))
        processor.onFrameCaptured(frame(camera()))
        assertThat(sink.frames).hasSize(2)
    }
}
