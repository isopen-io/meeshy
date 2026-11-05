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
    fun `l ancre du premier tiers place le segment plus haut que le centre`() {
        val anchor = me.meeshy.sdk.model.fullscreen.AudioFullscreenLayout.lyricAnchor(header = 300f, footer = 100f, height = 900f)
        val third = AudioLyricsScroll.target(itemTop = 400f, itemHeight = 40f, viewport = 900f, anchor = anchor, maxScroll = 2_000)
        val centre = AudioLyricsScroll.target(itemTop = 400f, itemHeight = 40f, viewport = 900f, anchor = 0.5f, maxScroll = 2_000)
        assertThat(third).isGreaterThan(centre)
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
