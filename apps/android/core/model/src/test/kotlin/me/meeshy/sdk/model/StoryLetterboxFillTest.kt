package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryLetterboxFillTest {
    @Test
    fun `un media 16 9 dans un canvas 9 16 laisse deux bandes horizontales`() {
        val bandes = StoryLetterboxFill.bands(1600.0, 900.0, 900.0, 1600.0)
        assertThat(bandes).isInstanceOf(StoryLetterboxFill.Bands.Horizontal::class.java)
        assertThat((bandes as StoryLetterboxFill.Bands.Horizontal).height).isWithin(1e-6).of((1600.0 - 900.0 * 9 / 16) / 2)
    }

    @Test
    fun `un media etroit dans un canvas large laisse des bandes verticales`() {
        val bandes = StoryLetterboxFill.bands(900.0, 1600.0, 1600.0, 900.0)
        assertThat(bandes).isInstanceOf(StoryLetterboxFill.Bands.Vertical::class.java)
    }

    @Test
    fun `meme ratio, bande sous un point ou mesure invalide ne laissent rien`() {
        assertThat(StoryLetterboxFill.bands(9.0, 16.0, 900.0, 1600.0)).isEqualTo(StoryLetterboxFill.Bands.None)
        assertThat(StoryLetterboxFill.bands(900.0, 1600.5, 900.0, 1600.0)).isEqualTo(StoryLetterboxFill.Bands.None)
        assertThat(StoryLetterboxFill.bands(0.0, 10.0, 900.0, 1600.0)).isEqualTo(StoryLetterboxFill.Bands.None)
    }

    @Test
    fun `seul un media en ajuster avec une source est comble`() {
        assertThat(StoryLetterboxFill.isServed("fit", true)).isTrue()
        assertThat(StoryLetterboxFill.isServed("fill", true)).isFalse()
        assertThat(StoryLetterboxFill.isServed(null, true)).isFalse()
        assertThat(StoryLetterboxFill.isServed("fit", false)).isFalse()
    }

    @Test
    fun `la source prefere le bitmap puis la premiere empreinte non vide`() {
        assertThat(StoryLetterboxFill.source(true, listOf("h"))).isEqualTo(StoryLetterboxFill.Source.StampedBitmap)
        assertThat(StoryLetterboxFill.source(false, listOf("", "h2", "h3"))).isEqualTo(StoryLetterboxFill.Source.ThumbHash("h2"))
        assertThat(StoryLetterboxFill.source(false, emptyList())).isEqualTo(StoryLetterboxFill.Source.NoSource)
        assertThat(StoryLetterboxFill.source(null as String?)).isEqualTo(StoryLetterboxFill.Source.NoSource)
    }
}
