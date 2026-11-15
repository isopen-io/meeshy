package me.meeshy.sdk.call

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.call.CallRecordingKind
import org.junit.Test
import java.io.File

@OptIn(ExperimentalCoroutinesApi::class)
class DeviceCallRecordingCapturerTest {

    private class Writer : CallAacFileWriter {
        val written = mutableListOf<Short>()
        override fun open(file: File, sampleRate: Int) = true
        override fun write(pcm: ShortArray) { written += pcm.toList() }
        override fun close() = written.isNotEmpty()
    }

    private fun pcm(vararg samples: Int): CallPcmFrame {
        val bytes = ByteArray(samples.size * 2)
        samples.forEachIndexed { i, v -> bytes[i * 2] = (v and 0xFF).toByte(); bytes[i * 2 + 1] = (v shr 8).toByte() }
        return CallPcmFrame(bytes, 48_000, 1)
    }

    @Test
    fun `nothing is captured until start, and a video without projection falls back to the voices`() = runTest {
        val mic = MutableSharedFlow<CallPcmFrame>(extraBufferCapacity = 8)
        val remote = MutableSharedFlow<CallPcmFrame>(extraBufferCapacity = 8)
        val writer = Writer()
        val capturer = DeviceCallRecordingCapturer(
            mic, remote, { null }, CoroutineScope(UnconfinedTestDispatcher(testScheduler)), { writer },
        )
        val target = File.createTempFile("appel", ".mp4")

        mic.emit(pcm(7, 7))
        assertThat(writer.written).isEmpty()

        assertThat(capturer.isAvailable).isTrue()
        assertThat(capturer.start(target, CallRecordingKind.VIDEO)).isTrue()
        mic.emit(pcm(1, 2))
        remote.emit(pcm(10, 20))

        assertThat(capturer.stop()).isEqualTo(target)
        assertThat(writer.written).containsExactly(11.toShort(), 22.toShort()).inOrder()
    }

    @Test
    fun `a second start while one capture runs is refused`() = runTest {
        val capturer = DeviceCallRecordingCapturer(
            MutableSharedFlow(), MutableSharedFlow(), { null }, CoroutineScope(UnconfinedTestDispatcher(testScheduler)), { Writer() },
        )
        assertThat(capturer.start(File.createTempFile("first", ".m4a"), CallRecordingKind.AUDIO)).isTrue()
        assertThat(capturer.start(File.createTempFile("second", ".m4a"), CallRecordingKind.AUDIO)).isFalse()
    }

    @Test
    fun `stopping with no capture running yields nothing`() = runTest {
        val capturer = DeviceCallRecordingCapturer(
            MutableSharedFlow(), MutableSharedFlow(), { null }, CoroutineScope(UnconfinedTestDispatcher(testScheduler)), { Writer() },
        )
        assertThat(capturer.stop()).isNull()
    }
}
