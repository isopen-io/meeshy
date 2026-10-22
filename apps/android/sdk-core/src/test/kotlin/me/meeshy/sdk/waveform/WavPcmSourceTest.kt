package me.meeshy.sdk.waveform

import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/**
 * Un `.wav` PCM se lit sans codec : blocs de 64 Ki trames, mono par moyenne des canaux, RMS par
 * compartiment. C'est la voie que ces tests exercent sur la JVM ; la voie `MediaCodec` est prouvée
 * sur appareil.
 */
class WavPcmSourceTest {

    @get:Rule
    val folder = TemporaryFolder()

    private fun measure(file: File, count: Int): FloatArray =
        checkNotNull(WavPcmSource.open(file)).use { WaveformStreamMeasurer.measure(it, count) {} }

    private fun wav(name: String, frames: Int, channels: Int = 1, floatPcm: Boolean = false, sample: (Int, Int) -> Float) =
        WaveformTestAudio.wav(File(folder.root, name), frames, channels, floatPcm = floatPcm, sample = sample)

    @Test
    fun `le PCM flottant est lu comme le PCM entier`() {
        val file = wav("float.wav", frames = 44_100, floatPcm = true) { frame, _ -> if (frame % 2 == 0) 0.25f else -0.25f }

        measure(file, 16).forEach { assertThat(it).isWithin(1e-4f).of(0.25f) }
    }

    @Test
    fun `un long fichier lu en plusieurs blocs garde ses compartiments`() {
        val file = wav("long.wav", frames = 44_100 * 4) { frame, _ -> if (frame < 44_100 * 2) 0.2f else 0.6f }

        assertThat(measure(file, 8)).usingTolerance(1e-3)
            .containsExactly(0.2f, 0.2f, 0.2f, 0.2f, 0.6f, 0.6f, 0.6f, 0.6f).inOrder()
    }

    @Test
    fun `les tailles de la bulle, du composer, de la transcription et du rogneur sont servies`() {
        val file = wav("voice.wav", frames = 44_100 * 3) { frame, _ -> 0.4f * kotlin.math.sin(frame * 0.01f) }

        listOf(96, 256, 512, 2_048).forEach { count -> assertThat(measure(file, count)).hasLength(count) }
    }

    @Test
    fun `plus de compartiments que de trames laisse les derniers a zero`() {
        val measured = measure(wav("short.wav", frames = 100) { _, _ -> 0.5f }, 256)

        assertThat(measured).hasLength(256)
        assertThat(measured.count { it > 0f }).isEqualTo(100)
    }

    @Test
    fun `le stereo est ramene en mono trame par trame`() {
        val file = wav("stereo.wav", frames = 8_000, channels = 2) { _, channel -> if (channel == 0) 0.8f else 0f }

        measure(file, 4).forEach { assertThat(it).isWithin(1e-3f).of(0.4f) }
    }

    @Test
    fun `un fichier tronque se mesure sur ce qu'il contient, sans trou en fin de releve`() {
        val whole = wav("whole.wav", frames = 20_000) { _, _ -> 0.5f }
        val cut = File(folder.root, "cut.wav").apply { writeBytes(whole.readBytes().copyOf(44 + 10_000)) }

        val measured = measure(cut, 4)

        assertThat(measured).hasLength(4)
        measured.forEach { assertThat(it).isWithin(1e-3f).of(0.5f) }
    }

    @Test
    fun `ce qui n'est pas un WAV PCM n'est pas ouvert`() {
        val notWav = File(folder.root, "voice.m4a").apply { writeBytes(ByteArray(2_000) { it.toByte() }) }

        assertThat(WavPcmSource.open(notWav)).isNull()
        assertThat(WavPcmSource.open(File(folder.root, "absent.wav"))).isNull()
    }
}
