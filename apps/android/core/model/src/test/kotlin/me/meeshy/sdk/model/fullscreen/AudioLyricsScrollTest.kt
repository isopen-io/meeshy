package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AudioLyricsScrollTest {

    @Test
    fun `l ancre au milieu place le segment au centre de la bande`() {
        assertThat(AudioLyricsScroll.target(itemTop = 100f, itemHeight = 20f, viewport = 200f, anchor = 0.5f, maxScroll = 500)).isEqualTo(10)
    }

    @Test
    fun `l ancre en haut place le segment en haut de la bande`() {
        assertThat(AudioLyricsScroll.target(itemTop = 100f, itemHeight = 20f, viewport = 200f, anchor = 0f, maxScroll = 500)).isEqualTo(100)
    }

    @Test
    fun `l ancre du premier tiers pose le segment au premier tiers de la bande libre`() {
        val anchor = AudioFullscreenLayout.lyricAnchor(header = 300f, footer = 100f, height = 900f)
        val target = AudioLyricsScroll.target(itemTop = 1_500f, itemHeight = 40f, viewport = 900f, anchor = anchor, maxScroll = 4_000)
        val centreOnScreen = 1_500f + 20f - target
        assertThat(centreOnScreen).isWithin(1f).of(anchor * 900f)
        assertThat(anchor * 900f).isWithin(1f).of(300f + 500f / 3f)
    }

    @Test
    fun `le defilement ne passe jamais sous zero`() {
        assertThat(AudioLyricsScroll.target(itemTop = 40f, itemHeight = 20f, viewport = 600f, anchor = 0.5f, maxScroll = 500)).isEqualTo(0)
    }

    @Test
    fun `le defilement ne depasse jamais la fin du contenu`() {
        assertThat(AudioLyricsScroll.target(itemTop = 900f, itemHeight = 20f, viewport = 200f, anchor = 0.5f, maxScroll = 500)).isEqualTo(500)
    }

    @Test
    fun `une bande mesuree a zero ne demande aucun defilement`() {
        assertThat(AudioLyricsScroll.target(itemTop = 900f, itemHeight = 20f, viewport = 0f, anchor = 0.5f, maxScroll = 500)).isEqualTo(500)
    }
}
