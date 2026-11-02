package me.meeshy.ui.component.fullscreen

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.fullscreen.ChromeRect
import me.meeshy.sdk.model.fullscreen.MediaChromeBackdrop
import me.meeshy.sdk.model.fullscreen.MediaChromeFraming
import me.meeshy.sdk.model.fullscreen.MediaChromePlacement
import me.meeshy.sdk.model.fullscreen.MediaChromeProbe
import me.meeshy.sdk.model.fullscreen.MediaChromeScheme
import me.meeshy.sdk.model.media.ThumbHashImage
import org.junit.Test

class MediaLuminanceSamplerTest {

    private fun white() = ThumbHashImage(2, 2, ByteArray(16) { -1 })

    private class Counter { var decodes = 0; var bitmaps = 0 }

    private fun TestScope.sampler(counter: Counter, max: Int = 512, bitmap: ThumbHashImage? = null) =
        MediaLuminanceSampler(
            dispatcher = StandardTestDispatcher(testScheduler),
            bitmapInMemory = { counter.bitmaps++; bitmap },
            decodeThumbHash = { counter.decodes++; white() },
            maxEntries = max,
        )

    private fun backdrop(key: String, hash: String? = "h", url: String? = null) = MediaChromeBackdrop.of(key, hash, url)

    @Test
    fun `un media n est mesure qu une fois`() = runTest {
        val c = Counter()
        val s = sampler(c)
        val first = s.sample(backdrop("a"))
        val second = s.sample(backdrop("a"))
        assertThat(first!!.luminance).isWithin(1e-9).of(1.0)
        assertThat(second).isEqualTo(first)
        assertThat(c.decodes).isEqualTo(1)
        assertThat(s.memoized(backdrop("a"))).isEqualTo(first)
    }

    @Test
    fun `l empreinte gagne et le bitmap n est lu que sans empreinte`() = runTest {
        val c = Counter()
        val s = sampler(c, bitmap = white())
        s.sample(backdrop("a", hash = "h", url = "u"))
        assertThat(c.bitmaps).isEqualTo(0)
        s.sample(backdrop("b", hash = null, url = "u"))
        assertThat(c.bitmaps).isEqualTo(1)
    }

    @Test
    fun `sans bitmap en memoire rien n est mesure ni telecharge`() = runTest {
        val s = sampler(Counter())
        assertThat(s.sample(backdrop("a", hash = null, url = "u"))).isNull()
        assertThat(s.sample(null as MediaChromeBackdrop?)).isNull()
    }

    @Test
    fun `la memoire est bornee et evince le moins recent`() = runTest {
        val c = Counter()
        val s = sampler(c, max = 2)
        listOf("a", "b", "c").forEach { s.sample(backdrop(it)) }
        assertThat(s.size).isEqualTo(2)
        assertThat(s.memoized(backdrop("a"))).isNull()
        assertThat(s.memoized(backdrop("c"))).isNotNull()
    }

    @Test
    fun `une cle perimee ne repond pas pour un autre media`() = runTest {
        val s = sampler(Counter())
        s.sample(backdrop("a"))
        val sample = s.memoized(backdrop("a"))
        assertThat(MediaChromeScheme.scheme(backdrop("b"), sample).name).isEqualTo("Dark")
        assertThat(s.memoized(backdrop("b"))).isNull()
    }

    @Test
    fun `une sonde est mesuree une fois par cellule`() = runTest {
        val c = Counter()
        val s = sampler(c)
        fun probe(x: Double) = MediaChromeProbe(
            backdrop("a")!!,
            MediaChromePlacement.of(ChromeRect(x, 0.0, x + 0.2, 0.2), 1.0, MediaChromeFraming.Fit, null),
        )
        s.sample(probe(0.0)); s.sample(probe(0.0)); s.sample(probe(0.5))
        assertThat(c.decodes).isEqualTo(2)
        assertThat(s.memoized(probe(0.5))!!.luminance).isWithin(1e-9).of(1.0)
    }
}
