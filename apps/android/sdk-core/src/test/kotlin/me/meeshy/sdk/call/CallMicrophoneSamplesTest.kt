package me.meeshy.sdk.call

import android.media.AudioFormat
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.async
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Test

/** #13718 — what WebRTC records reaches the captions only while they listen, and only as 16-bit PCM. */
class CallMicrophoneSamplesTest {

    @Test
    fun `recorded buffers reach the listener, and nothing is kept when nobody listens`() = runTest {
        val samples = CallMicrophoneSamples()
        samples.deliver(AudioFormat.ENCODING_PCM_16BIT, 48_000, 1, byteArrayOf(9, 9))

        samples.frames.test {
            samples.deliver(AudioFormat.ENCODING_PCM_16BIT, 48_000, 1, byteArrayOf(1, 2))
            val frame = awaitItem()
            assertThat(frame.pcm.toList()).containsExactly(1.toByte(), 2.toByte()).inOrder()
            assertThat(frame.sampleRate).isEqualTo(48_000)
            assertThat(frame.channelCount).isEqualTo(1)
            expectNoEvents()
        }
    }

    @Test
    fun `a format the recognizer cannot read is dropped`() = runTest {
        val samples = CallMicrophoneSamples()

        samples.frames.test {
            samples.deliver(AudioFormat.ENCODING_PCM_FLOAT, 48_000, 1, byteArrayOf(1, 2, 3, 4))
            samples.deliver(AudioFormat.ENCODING_PCM_16BIT, 0, 1, byteArrayOf(1, 2))
            expectNoEvents()
        }
    }

    @Test
    fun `the captions and the montage film both hear the microphone, and one leaving keeps the other`() = runTest(UnconfinedTestDispatcher()) {
        val samples = CallMicrophoneSamples()

        samples.frames.test {
            val film = async { samples.frames.first() }
            samples.deliver(AudioFormat.ENCODING_PCM_16BIT, 48_000, 1, byteArrayOf(1, 2))
            assertThat(film.await().pcm.toList()).containsExactly(1.toByte(), 2.toByte()).inOrder()
            assertThat(awaitItem().pcm.toList()).containsExactly(1.toByte(), 2.toByte()).inOrder()

            samples.deliver(AudioFormat.ENCODING_PCM_16BIT, 48_000, 1, byteArrayOf(3))
            assertThat(awaitItem().pcm.toList()).containsExactly(3.toByte())
        }
    }
}
