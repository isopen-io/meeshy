package me.meeshy.sdk.waveform

import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.waveform.WaveformLocation
import me.meeshy.sdk.model.waveform.WaveformScale
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File
import kotlin.math.PI
import kotlin.math.sin

/**
 * **Un fichier, un relevé : n compartiments de RMS absolu, la crête à un une fois normalisée.**
 * Les WAV sont générés ici ; la voie `MediaExtractor` + `MediaCodec` (m4a, mp3, ogg) n'a pas de
 * décodeur sous Robolectric et se prouve sur appareil. Miroir de `WaveformCacheContentTests`.
 */
@RunWith(RobolectricTestRunner::class)
class WaveformExtractorTest {

    @get:Rule
    val folder = TemporaryFolder()

    private val extractor = WaveformExtractor(ApplicationProvider.getApplicationContext(), Dispatchers.Unconfined)

    private fun wav(name: String = "voice.wav", frames: Int = 44_100, channels: Int = 1, floatPcm: Boolean = false, sample: (Int, Int) -> Float): WaveformLocation.Local =
        WaveformLocation.Local(WaveformTestAudio.wav(File(folder.root, name), frames, channels, floatPcm = floatPcm, sample = sample).path)

    private fun sine(amplitude: Float) = { frame: Int, _: Int -> amplitude * sin(2 * PI * 440 * frame / 44_100).toFloat() }

    @Test
    fun `un fichier rend n compartiments`() = runTest {
        val measured = extractor.measure(wav(sample = sine(0.5f)), 64)

        assertThat(measured).hasLength(64)
    }

    @Test
    fun `le releve est le RMS absolu du signal`() = runTest {
        val measured = extractor.measure(wav(sample = sine(0.5f)), 32)

        measured.forEach { assertThat(it).isWithin(0.02f).of(0.5f / 1.4142135f) }
    }

    @Test
    fun `normalise au pic, la crete vaut un`() = runTest {
        val measured = extractor.measure(wav(sample = sine(0.3f)), 64).toList()

        val published = WaveformScale.peakNormalized(measured)

        assertThat(published.max()).isEqualTo(1f)
        assertThat(published.min()).isGreaterThan(0.9f)
    }

    @Test
    fun `une piste douce reste douce, la mesure n'est pas divisee par son pic`() = runTest {
        val measured = extractor.measure(wav(frames = 40_000) { frame, _ -> if (frame < 20_000) 0.1f else 0.4f }, 4)

        assertThat(measured).usingTolerance(1e-3).containsExactly(0.1f, 0.1f, 0.4f, 0.4f).inOrder()
    }

    @Test
    fun `le stereo est ramene en mono par la moyenne des canaux`() = runTest {
        val opposed = extractor.measure(wav("opposed.wav", channels = 2) { _, channel -> if (channel == 0) 0.8f else -0.8f }, 8)
        val oneSided = extractor.measure(wav("one-sided.wav", channels = 2) { _, channel -> if (channel == 0) 0.8f else 0f }, 8)

        opposed.forEach { assertThat(it).isWithin(1e-3f).of(0f) }
        oneSided.forEach { assertThat(it).isWithin(1e-3f).of(0.4f) }
    }

    @Test
    fun `un meme son sous deux noms rend le meme releve`() = runTest {
        val original = wav("voice.wav", sample = sine(0.5f))
        val copy = WaveformLocation.Local(File(original.path).copyTo(File(folder.root, "autre-nom.wav")).path)

        assertThat(extractor.measure(copy, 64)).isEqualTo(extractor.measure(original, 64))
    }

    @Test
    fun `un fichier absent, un dossier ou un nombre nul rendent un releve vide`() = runTest {
        assertThat(extractor.measure(WaveformLocation.Local(File(folder.root, "absent.wav").path), 64)).isEmpty()
        assertThat(extractor.measure(WaveformLocation.Local(folder.root.path), 64)).isEmpty()
        assertThat(extractor.measure(wav(sample = sine(0.5f)), 0)).isEmpty()
    }
}
