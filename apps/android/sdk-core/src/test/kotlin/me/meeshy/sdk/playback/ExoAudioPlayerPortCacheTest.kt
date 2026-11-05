package me.meeshy.sdk.playback

import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Le port du moteur partagé lit un vocal réseau par la couture [AudioPlaybackSources] (cache AUDIO du compte dans
 * l'app) et jamais par un cache à lui : il demande la source avec la protection du vocal, garde le bail tant que le
 * vocal est chargé, et le rend au déchargement.
 */
@UnstableApi
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ExoAudioPlayerPortCacheTest {

    private val context: Context = ApplicationProvider.getApplicationContext()

    private class RecordingSources(private val context: Context) : AudioPlaybackSources {
        val opened = mutableListOf<Pair<String, Boolean>>()
        var leasesHeld = 0

        override fun open(url: String, isProtected: Boolean): AudioPlaybackSource {
            opened += url to isProtected
            leasesHeld += 1
            var released = false
            val source = ProgressiveMediaSource.Factory(DefaultDataSource.Factory(context))
                .createMediaSource(MediaItem.fromUri("file:///nowhere/$url.m4a"))
            return AudioPlaybackSource(source) {
                if (!released) {
                    released = true
                    leasesHeld -= 1
                }
            }
        }
    }

    private fun port(sources: RecordingSources) = ExoAudioPlayerPort(context, sources)

    @Test
    fun `a remote voice is opened through the seam with its protection`() {
        val sources = RecordingSources(context)
        val port = port(sources)

        port.load(AudioSource.Remote("a", isProtected = false), generation = 1, speed = 1f)
        port.load(AudioSource.Remote("b", isProtected = true), generation = 2, speed = 1f)

        assertThat(sources.opened).containsExactly("a" to false, "b" to true).inOrder()
        port.release()
    }

    @Test
    fun `the lease is held while a voice is loaded and returned when it is unloaded`() {
        val sources = RecordingSources(context)
        val port = port(sources)

        port.load(AudioSource.Remote("a", isProtected = false), generation = 1, speed = 1f)
        assertThat(sources.leasesHeld).isEqualTo(1)

        port.stop()
        assertThat(sources.leasesHeld).isEqualTo(0)
        port.release()
    }

    @Test
    fun `loading another voice returns the lease of the previous one`() {
        val sources = RecordingSources(context)
        val port = port(sources)

        port.load(AudioSource.Remote("a", isProtected = false), generation = 1, speed = 1f)
        port.load(AudioSource.Remote("b", isProtected = false), generation = 2, speed = 1f)

        assertThat(sources.leasesHeld).isEqualTo(1)
        port.release()
        assertThat(sources.leasesHeld).isEqualTo(0)
    }

    @Test
    fun `a local file is read directly and takes no lease`() {
        val sources = RecordingSources(context)
        val port = port(sources)

        port.load(AudioSource.Local("file:///cache/voice.m4a"), generation = 1, speed = 1f)

        assertThat(sources.opened).isEmpty()
        port.release()
    }

    @Test
    fun `the default seam writes nothing under the cache directory, protected voice included`() {
        val port = ExoAudioPlayerPort(context)

        port.load(AudioSource.Remote("https://cdn.meeshy.me/a.m4a", isProtected = true), generation = 1, speed = 1f)
        port.release()

        assertThat(File(context.cacheDir, "audio-playback").exists()).isFalse()
    }
}
