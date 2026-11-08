package me.meeshy.app.game.ceremony

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MintCeremonyFitTest {

    @Test
    fun `a screen exactly 9 by 16 scales the stage without margins`() {
        val fit = MintCeremonyFit(720f, 1280f)
        assertThat(fit.k).isWithin(1e-6f).of(2f)
        assertThat(fit.offX).isWithin(1e-6f).of(0f)
        assertThat(fit.offY).isWithin(1e-6f).of(0f)
    }

    @Test
    fun `a taller screen is limited by its width and centred vertically`() {
        val fit = MintCeremonyFit(360f, 800f)
        assertThat(fit.k).isWithin(1e-6f).of(1f)
        assertThat(fit.offX).isWithin(1e-6f).of(0f)
        assertThat(fit.offY).isWithin(1e-6f).of(80f)
    }

    @Test
    fun `a wider screen is limited by its height and centred horizontally`() {
        val fit = MintCeremonyFit(1000f, 640f)
        assertThat(fit.k).isWithin(1e-6f).of(1f)
        assertThat(fit.offX).isWithin(1e-6f).of(320f)
        assertThat(fit.offY).isWithin(1e-6f).of(0f)
    }

    @Test
    fun `the scale is the same on both axes so nothing is distorted`() {
        listOf(1080f to 2400f, 800f to 1280f, 1600f to 2560f, 2560f to 1600f).forEach { (w, h) ->
            val fit = MintCeremonyFit(w, h)
            assertThat(fit.offX * 2 + 360f * fit.k).isWithin(0.01f).of(w)
            assertThat(fit.offY * 2 + 640f * fit.k).isWithin(0.01f).of(h)
        }
    }

    @Test
    fun `an empty screen falls back to a unit scale`() {
        assertThat(MintCeremonyFit(0f, 0f).k).isEqualTo(1f)
    }
}
