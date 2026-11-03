package me.meeshy.sdk.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallAudioMixerTest {

    private fun frame(vararg samples: Int, rate: Int = 1_000, channels: Int = 1): CallPcmFrame {
        val bytes = ByteArray(samples.size * 2)
        samples.forEachIndexed { index, value ->
            bytes[index * 2] = (value and 0xFF).toByte()
            bytes[index * 2 + 1] = (value shr 8).toByte()
        }
        return CallPcmFrame(bytes, rate, channels)
    }

    private fun mixer(hold: Int = 100) = CallAudioMixer(sampleRate = 1_000, holdSamples = hold)

    @Test
    fun `two voices are summed sample by sample`() {
        val mixer = mixer()
        mixer.push(CallAudioSource.Local, frame(100, 200, -300))
        mixer.push(CallAudioSource.Remote, frame(1, 2, 3))

        assertThat(mixer.drain().toList()).containsExactly(101.toShort(), 202.toShort(), (-297).toShort()).inOrder()
    }

    @Test
    fun `a sum beyond the 16-bit range saturates instead of wrapping`() {
        val mixer = mixer()
        mixer.push(CallAudioSource.Local, frame(30_000, -30_000))
        mixer.push(CallAudioSource.Remote, frame(30_000, -30_000))

        assertThat(mixer.drain().toList()).containsExactly(Short.MAX_VALUE, Short.MIN_VALUE).inOrder()
    }

    @Test
    fun `a silent remote does not stop the local voice once it is past the hold`() {
        val mixer = mixer(hold = 2)
        mixer.push(CallAudioSource.Local, frame(5, 6, 7, 8))

        assertThat(mixer.drain().toList()).containsExactly(5.toShort(), 6.toShort()).inOrder()
        assertThat(mixer.flush().toList()).containsExactly(7.toShort(), 8.toShort()).inOrder()
    }

    @Test
    fun `a source ahead by less than the hold waits for the other`() {
        val mixer = mixer(hold = 10)
        mixer.push(CallAudioSource.Local, frame(1, 2, 3))

        assertThat(mixer.drain()).isEmpty()
        mixer.push(CallAudioSource.Remote, frame(10))
        assertThat(mixer.drain().toList()).containsExactly(11.toShort())
    }

    @Test
    fun `stereo is averaged to mono`() {
        val mixer = mixer()
        mixer.push(CallAudioSource.Local, frame(100, 300, rate = 1_000, channels = 2))

        assertThat(mixer.flush().toList()).containsExactly(200.toShort())
    }

    @Test
    fun `a faster source is resampled to the target rate`() {
        val mixer = mixer()
        mixer.push(CallAudioSource.Remote, frame(0, 0, 100, 100, rate = 2_000))

        assertThat(mixer.flush().size).isEqualTo(2)
    }
}
