package me.meeshy.sdk.waveform

import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.waveform.WaveformLocation
import me.meeshy.sdk.playback.PlaybackModule
import me.meeshy.sdk.playback.SharedPreferencesPlaybackPositionStore
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

/**
 * Fin de session (ADR-027) : les formes d'onde (mémoire ET disque) et la mémoire des positions de lecture
 * quittent l'appareil avec le compte, par le point d'extension `PerAccountCache`.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class WaveformCacheAccountWipeTest {

    @get:Rule
    val folder = TemporaryFolder()

    private class CountingMeasurer : WaveformMeasuring {
        var calls = 0
        override suspend fun measure(location: WaveformLocation, count: Int): FloatArray {
            calls++
            return FloatArray(count) { 0.5f }
        }
    }

    private fun TestScope.cache(measurer: WaveformMeasuring, directory: File) =
        WaveformCache(directory, measurer, StandardTestDispatcher(testScheduler))

    private fun voice(): WaveformLocation.Local {
        val file = File(folder.newFolder("audio"), "voice.m4a").apply { writeBytes(ByteArray(2_000) { (it * 7).toByte() }) }
        return WaveformLocation.Local(file.path)
    }

    @Test
    fun `the account wipe empties the waveform memory and disk, so the next sighting measures again`() = runTest {
        val directory = File(folder.root, "waveforms")
        val measurer = CountingMeasurer()
        val cache = cache(measurer, directory)
        val location = voice()
        cache.samples(location, 96)
        cache.samples(location, 96)
        assertThat(measurer.calls).isEqualTo(1)
        assertThat(directory.listFiles().orEmpty().map { it.name }).isNotEmpty()

        WaveformModule.waveformsOnLogout(cache).clear()

        assertThat(directory.listFiles().orEmpty()).isEmpty()
        cache.samples(location, 96)
        assertThat(measurer.calls).isEqualTo(2)
    }

    @Test
    fun `the account wipe empties the playback positions`() = runTest {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val positions = SharedPreferencesPlaybackPositionStore(context)
        positions.save("a1", positionMs = 12_000, savedAtEpochMs = 1L)

        PlaybackModule.positionsOnLogout(positions).clear()

        assertThat(positions.position("a1")).isNull()
    }
}
