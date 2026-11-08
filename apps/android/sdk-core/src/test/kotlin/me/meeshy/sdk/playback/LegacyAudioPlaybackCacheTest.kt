package me.meeshy.sdk.playback

import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** L'ancien cache disque du moteur partagé (`audio-playback`) est purgé une fois, et la purge se rejoue sans erreur. */
@UnstableApi
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class LegacyAudioPlaybackCacheTest {

    private val context = ApplicationProvider.getApplicationContext<android.content.Context>()
    private val database = StandaloneDatabaseProvider(context)

    private fun legacyFolder() = File(context.cacheDir, "audio-playback").apply {
        mkdirs()
        File(this, "0.v3.exo").writeBytes(ByteArray(2_048) { it.toByte() })
        File(this, "stray.bin").writeBytes(ByteArray(16))
    }

    @Test
    fun `the old folder and its files are gone after the purge`() {
        val folder = legacyFolder()

        LegacyAudioPlaybackCache.purge(context.cacheDir, database)

        assertThat(folder.exists()).isFalse()
    }

    @Test
    fun `purging again, or when the folder never existed, is harmless`() {
        legacyFolder()

        LegacyAudioPlaybackCache.purge(context.cacheDir, database)
        LegacyAudioPlaybackCache.purge(context.cacheDir, database)

        assertThat(File(context.cacheDir, "audio-playback").exists()).isFalse()
    }

    @Test
    fun `the purge leaves the other cache folders alone`() {
        legacyFolder()
        val neighbour = File(context.cacheDir, "com.meeshy.waveforms.v2").apply { mkdirs() }
        File(neighbour, "k_96.waveform").writeBytes(ByteArray(4))

        LegacyAudioPlaybackCache.purge(context.cacheDir, database)

        assertThat(File(neighbour, "k_96.waveform").exists()).isTrue()
    }
}
