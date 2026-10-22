package me.meeshy.sdk.waveform

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.waveform.WaveformLocation
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/** Ce que les lecteurs reçoivent : des niveaux linéaires à crête un, et d'où ils viennent. */
@OptIn(ExperimentalCoroutinesApi::class)
class WaveformRepositoryTest {

    @get:Rule
    val folder = TemporaryFolder()

    private class ScriptedMeasurer(private val result: FloatArray) : WaveformMeasuring {
        val requestedCounts = mutableListOf<Int>()

        override suspend fun measure(location: WaveformLocation, count: Int): FloatArray {
            requestedCounts += count
            return result
        }
    }

    private fun TestScope.repository(measurer: WaveformMeasuring) = WaveformRepository(
        WaveformCache(File(folder.root, "waveforms"), measurer, StandardTestDispatcher(testScheduler)),
        WaveformImageRenderer(),
    )

    private fun voice(): String = File(folder.newFolder(), "voice.m4a").apply { writeBytes(ByteArray(3_000) { it.toByte() }) }.path

    @Test
    fun `les niveaux enregistres du message sont reutilises sans decoder`() = runTest {
        val measurer = ScriptedMeasurer(floatArrayOf(0.9f))
        val levels = repository(measurer).levels(voice(), count = 96, recorded = listOf(0.1f, 0.4f, 0.2f))

        assertThat(levels.origin).isEqualTo(WaveformLevels.Origin.RECORDED)
        assertThat(levels.values).containsExactly(0.25f, 1f, 0.5f).inOrder()
        assertThat(measurer.requestedCounts).isEmpty()
    }

    @Test
    fun `sans niveaux enregistres, la mesure est ramenee a la crete un`() = runTest {
        val levels = repository(ScriptedMeasurer(floatArrayOf(0.1f, 0.4f, 0.2f))).levels(voice(), count = 3)

        assertThat(levels.origin).isEqualTo(WaveformLevels.Origin.DECODED)
        assertThat(levels.values).containsExactly(0.25f, 1f, 0.5f).inOrder()
    }

    @Test
    fun `un audio illisible laisse le lecteur a sa forme de repli`() = runTest {
        val levels = repository(ScriptedMeasurer(FloatArray(0))).levels(voice(), count = 96)

        assertThat(levels).isEqualTo(WaveformLevels.Unavailable)
        assertThat(levels.values).isEmpty()
    }

    @Test
    fun `une bulle de soixante-douze barres demande quatre-vingt-seize compartiments`() = runTest {
        val measurer = ScriptedMeasurer(floatArrayOf(0.2f))
        val subject = repository(measurer)
        val file = voice()

        subject.bubbleLevels(file, barCount = 72)
        subject.bubbleLevels(file, barCount = 48)
        subject.bubbleLevels(file, barCount = 120)

        assertThat(measurer.requestedCounts).containsExactly(96, 120).inOrder()
    }

    @Test
    fun `la mesure brute n'est pas normalisee`() = runTest {
        val measured = repository(ScriptedMeasurer(floatArrayOf(0.05f, 0.1f))).measured(voice(), count = 2)

        assertThat(measured).containsExactly(0.05f, 0.1f).inOrder()
    }

    @Test
    fun `la vignette d'un audio illisible est vide`() = runTest {
        assertThat(repository(ScriptedMeasurer(FloatArray(0))).thumbnailPng(voice())).isEmpty()
    }
}
