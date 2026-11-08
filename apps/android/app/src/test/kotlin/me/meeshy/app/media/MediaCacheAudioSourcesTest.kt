package me.meeshy.app.media

import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.source.MediaSource
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import java.io.File
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Un vocal public lit par le cache AUDIO du compte avec un bail ; un vocal protégé ne touche ni cache ni bail. */
@UnstableApi
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MediaCacheAudioSourcesTest {

    private class Rig(whole: (String) -> File? = { null }) {
        val cachedUrls = mutableListOf<String>()
        val directUris = mutableListOf<String>()
        var directAsked = 0
        val leased = mutableListOf<String>()
        var leasesReturned = 0
        val cachedSource = mockk<MediaSource>(relaxed = true)
        val directSource = mockk<MediaSource>(relaxed = true)
        val sources = MediaCacheAudioSources(
            cached = { url ->
                cachedUrls += url
                mockk<MediaSource.Factory> { every { createMediaSource(any()) } returns cachedSource }
            },
            direct = {
                directAsked += 1
                mockk<MediaSource.Factory> {
                    every { createMediaSource(any()) } answers {
                        directUris += firstArg<MediaItem>().localConfiguration?.uri.toString()
                        directSource
                    }
                }
            },
            lease = { url ->
                leased += url
                val release: () -> Unit = { leasesReturned += 1 }
                release
            },
            whole = whole,
        )
    }

    @Test
    fun `a public voice reads through the account cache and holds a lease until released`() {
        val rig = Rig()

        val opened = rig.sources.open("https://gate.meeshy.me/a.m4a", isProtected = false)

        assertThat(opened.source).isSameInstanceAs(rig.cachedSource)
        assertThat(rig.cachedUrls).containsExactly("https://gate.meeshy.me/a.m4a")
        assertThat(rig.leased).containsExactly("https://gate.meeshy.me/a.m4a")
        assertThat(rig.directAsked).isEqualTo(0)
        opened.release()
        assertThat(rig.leasesReturned).isEqualTo(1)
    }

    @Test
    fun `a protected voice never touches the cache nor takes a lease`() {
        val rig = Rig()

        val opened = rig.sources.open("https://gate.meeshy.me/p.m4a", isProtected = true)

        assertThat(opened.source).isSameInstanceAs(rig.directSource)
        assertThat(rig.cachedUrls).isEmpty()
        assertThat(rig.leased).isEmpty()
        opened.release()
        assertThat(rig.leasesReturned).isEqualTo(0)
    }

    @Test
    fun `a voice adopted whole at the ack of its send plays from that file, offline, with no cache nor lease`() {
        val adopted = File.createTempFile("adopted", ".m4a").apply { writeBytes(ByteArray(32) { 3 }) }
        val rig = Rig(whole = { url -> adopted.takeIf { url == "https://gate.meeshy.me/v.m4a" } })

        val opened = rig.sources.open("https://gate.meeshy.me/v.m4a", isProtected = false)

        assertThat(opened.source).isSameInstanceAs(rig.directSource)
        assertThat(rig.directUris).containsExactly(Uri.fromFile(adopted).toString())
        assertThat(rig.cachedUrls).isEmpty()
        assertThat(rig.leased).isEmpty()
        adopted.delete()
    }

    @Test
    fun `a protected voice never reads an adopted file`() {
        val adopted = File.createTempFile("adopted", ".m4a").apply { writeBytes(ByteArray(32) { 3 }) }
        val rig = Rig(whole = { adopted })

        rig.sources.open("https://gate.meeshy.me/p.m4a", isProtected = true)

        assertThat(rig.directUris).containsExactly("https://gate.meeshy.me/p.m4a")
        adopted.delete()
    }
}
