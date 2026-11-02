package me.meeshy.sdk.model.composer.timeline

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Zoom et défilement de la frise (#13481, iso iOS #14213) : une scène de deux heures se règle à la seconde. */
class FriseViewportTest {

    @Test
    fun `par defaut la frise montre toute la slide`() {
        assertThat(FriseViewport.whole(7200f)).isEqualTo(FriseViewport(0f, 7200f))
        assertThat(FriseViewport.whole(7200f).fraction(3600f)).isWithin(0.0001f).of(0.5f)
    }

    @Test
    fun `pincer resserre autour de la tete, qui garde sa place`() {
        val view = FriseViewport.whole(7200f).zoomed(100f, 3600f, 7200f)

        assertThat(view.span).isWithin(0.001f).of(72f)
        assertThat(view.fraction(3600f)).isWithin(0.0001f).of(0.5f)
    }

    @Test
    fun `une scene de deux heures se regle a la seconde`() {
        val view = FriseViewport.whole(7200f).zoomed(10_000f, 100f, 7200f)

        assertThat(view.span).isEqualTo(FriseViewport.MINIMUM_SPAN)
        assertThat(280f / view.span).isGreaterThan(44f)
    }

    @Test
    fun `ecarter ne montre jamais plus que la slide`() {
        assertThat(FriseViewport(100f, 60f).zoomed(0.001f, 120f, 600f)).isEqualTo(FriseViewport.whole(600f))
    }

    @Test
    fun `defiler reste dans la slide`() {
        val view = FriseViewport(100f, 60f)

        assertThat(view.panned(0.5f, 600f).start).isWithin(0.001f).of(70f)
        assertThat(view.panned(10f, 600f).start).isEqualTo(0f)
        assertThat(view.panned(-100f, 600f).start).isWithin(0.001f).of(540f)
    }

    @Test
    fun `une slide raccourcie ramene la fenetre dedans`() {
        assertThat(FriseViewport(500f, 60f).clamped(120f)).isEqualTo(FriseViewport(60f, 60f))
        assertThat(FriseViewport(0f, 60f).clamped(6f)).isEqualTo(FriseViewport.whole(6f))
    }

    @Test
    fun `le temps du doigt se lit dans la fenetre visible`() {
        assertThat(FriseViewport(100f, 60f).timeAt(0.5f)).isWithin(0.001f).of(130f)
        assertThat(FriseViewport(100f, 60f).timeAt(2f)).isWithin(0.001f).of(160f)
    }

    @Test
    fun `la tete sortie de la fenetre tourne la page`() {
        val view = FriseViewport(100f, 60f)

        assertThat(view.showing(130f, 600f)).isEqualTo(view)
        assertThat(view.showing(200f, 600f)).isEqualTo(FriseViewport(140f, 60f))
        assertThat(view.showing(20f, 600f)).isEqualTo(FriseViewport(20f, 60f))
    }

    @Test
    fun `la regle zoomee ne gradue que ce qui est visible`() {
        val ticks = FriseRuler.ticks(FriseViewport(3600f, 60f), 300f)

        assertThat(ticks).isNotEmpty()
        assertThat(ticks.all { it.time in 3600f..3660f }).isTrue()
        assertThat(ticks.count { it.isMajor }).isAtMost(12)
        assertThat(ticks.first { it.isMajor }.label).isEqualTo("1:00:00")
    }

    @Test
    fun `la regle entiere reste celle de la duree`() {
        assertThat(FriseRuler.ticks(FriseViewport.whole(60f), 300f)).isEqualTo(FriseRuler.ticks(60f, 300f))
    }

    @Test
    fun `la lecture avance la tete sans depasser la fin`() {
        assertThat(FriseViewport.advanced(1f, 0.016f, 6f)).isWithin(0.0001f).of(1.016f)
        assertThat(FriseViewport.advanced(5.99f, 0.1f, 6f)).isEqualTo(6f)
        assertThat(FriseViewport.advanced(2f, -1f, 6f)).isEqualTo(2f)
    }
}
