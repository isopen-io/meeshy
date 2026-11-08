package me.meeshy.sdk.call

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Test
import java.io.File

@OptIn(ExperimentalCoroutinesApi::class)
class CallAudioRecorderTest {

    private class FakeWriter(var opens: Boolean = true, var closes: Boolean = true) : CallAacFileWriter {
        var openedAt: Pair<File, Int>? = null
        val written = mutableListOf<Short>()
        var closed = 0
        override fun open(file: File, sampleRate: Int): Boolean {
            openedAt = file to sampleRate
            return opens
        }
        override fun write(pcm: ShortArray) { written += pcm.toList() }
        override fun close(): Boolean { closed++; return closes && written.isNotEmpty() }
    }

    private fun pcm(vararg samples: Int, rate: Int = 48_000, channels: Int = 1): CallPcmFrame {
        val bytes = ByteArray(samples.size * 2)
        samples.forEachIndexed { i, v -> bytes[i * 2] = (v and 0xFF).toByte(); bytes[i * 2 + 1] = (v shr 8).toByte() }
        return CallPcmFrame(bytes, rate, channels)
    }

    private class Rig(val writer: FakeWriter = FakeWriter()) {
        val mic = MutableSharedFlow<CallPcmFrame>(extraBufferCapacity = 16)
        val remote = MutableSharedFlow<CallPcmFrame>(extraBufferCapacity = 16)
        val target: File = File.createTempFile("rec", ".m4a")
    }

    private fun recorderOf(rig: Rig, scope: CoroutineScope) =
        CallAudioRecorder(rig.mic, rig.remote, { rig.writer }, scope)

    @Test
    fun `both voices end up in the file at the microphone rate`() = runTest {
        val rig = Rig()
        val recorder = recorderOf(rig, CoroutineScope(UnconfinedTestDispatcher(testScheduler)))

        assertThat(recorder.start(rig.target)).isTrue()
        rig.mic.emit(pcm(100, 200))
        rig.remote.emit(pcm(1, 2))
        val file = recorder.stop()

        assertThat(file).isEqualTo(rig.target)
        assertThat(rig.writer.openedAt).isEqualTo(rig.target to 48_000)
        assertThat(rig.writer.written).containsExactly(101.toShort(), 202.toShort()).inOrder()
        assertThat(rig.writer.closed).isEqualTo(1)
    }

    @Test
    fun `an unreadable tap format opens nothing and yields no file`() = runTest {
        val rig = Rig()
        val recorder = recorderOf(rig, CoroutineScope(UnconfinedTestDispatcher(testScheduler)))

        recorder.start(rig.target)
        rig.mic.emit(pcm(1, 2, rate = 0))

        assertThat(recorder.stop()).isNull()
        assertThat(rig.writer.openedAt).isNull()
        assertThat(rig.target.exists()).isFalse()
    }

    @Test
    fun `a stop with no sample yields no file`() = runTest {
        val rig = Rig()
        val recorder = recorderOf(rig, CoroutineScope(UnconfinedTestDispatcher(testScheduler)))

        recorder.start(rig.target)

        assertThat(recorder.stop()).isNull()
    }

    @Test
    fun `an encoder that cannot open leaves no file behind`() = runTest {
        val rig = Rig(FakeWriter(opens = false))
        val recorder = recorderOf(rig, CoroutineScope(UnconfinedTestDispatcher(testScheduler)))

        recorder.start(rig.target)
        rig.mic.emit(pcm(1, 2))

        assertThat(recorder.stop()).isNull()
        assertThat(rig.target.exists()).isFalse()
    }

    @Test
    fun `nothing is captured after the stop`() = runTest {
        val rig = Rig()
        val recorder = recorderOf(rig, CoroutineScope(UnconfinedTestDispatcher(testScheduler)))
        recorder.start(rig.target)
        rig.mic.emit(pcm(1, 2))
        recorder.stop()
        val before = rig.writer.written.size

        rig.mic.emit(pcm(9, 9))

        assertThat(rig.writer.written).hasSize(before)
    }
}
