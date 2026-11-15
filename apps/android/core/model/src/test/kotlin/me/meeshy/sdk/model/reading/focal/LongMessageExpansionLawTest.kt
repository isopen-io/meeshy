package me.meeshy.sdk.model.reading.focal

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.reading.focal.LongMessageExpansionLaw.Anchor
import me.meeshy.sdk.model.reading.focal.LongMessageExpansionLaw.Pin
import me.meeshy.sdk.model.reading.focal.LongMessageExpansionLaw.Span
import org.junit.Test

class LongMessageExpansionLawTest {

    private val law = LongMessageExpansionLaw

    @Test
    fun `#16465 un toucher ajoute le message aux dépliés, plusieurs le restent, rien ne se replie`() {
        assertThat(law.expanded(emptySet(), "a")).containsExactly("a")
        assertThat(law.expanded(setOf("a"), "b")).containsExactly("a", "b")
        assertThat(law.expanded(setOf("a", "b"), "a")).containsExactly("a", "b")
    }

    @Test
    fun `#16465 le haut du déplié est l'ancre, la suite se déroule dessous`() {
        assertThat(law.ANCHOR).isEqualTo(Anchor.Top)
    }

    @Test
    fun `la fenêtre de maintien dure 0,65 s`() {
        assertThat(law.HOLD_WINDOW_SECONDS).isWithin(1e-9).of(0.65)
    }

    @Test
    fun `l'arête qui monte fait défiler du même écart`() {
        assertThat(law.anchoredOffset(100f, 50f, 20f, 0f, 1000f)).isEqualTo(130f)
        assertThat(law.anchoredOffset(100f, 50f, 50f, 0f, 1000f)).isEqualTo(100f)
    }

    @Test
    fun `le décalage reste borné par la plage défilable`() {
        assertThat(law.anchoredOffset(10f, 50f, 100f, 0f, 1000f)).isEqualTo(0f)
        assertThat(law.anchoredOffset(990f, 100f, 0f, 0f, 1000f)).isEqualTo(1000f)
        assertThat(law.anchoredOffset(5f, 0f, 0f, 0f, -20f)).isEqualTo(0f)
    }

    @Test
    fun `la hauteur s'anime en 0,3 s sur la courbe du web`() {
        val timing = law.heightTiming(reduceMotion = false)!!
        assertThat(timing.durationSeconds).isEqualTo(0.3)
        assertThat(timing.controlPoints).containsExactly(0.2, 0.0, 0.0, 1.0).inOrder()
    }

    @Test
    fun `aucune animation en réduire les animations`() {
        assertThat(law.heightTiming(reduceMotion = true)).isNull()
    }

    @Test
    fun `dans une liste inversée le haut visuel est la fin de l'étendue`() {
        assertThat(law.pin(Anchor.Top, listIsInverted = true)).isEqualTo(Pin.End)
        assertThat(law.pin(Anchor.Bottom, listIsInverted = true)).isEqualTo(Pin.Origin)
        assertThat(law.pin(Anchor.Top, listIsInverted = false)).isEqualTo(Pin.Origin)
        assertThat(law.pin(Anchor.Bottom, listIsInverted = false)).isEqualTo(Pin.End)
    }

    @Test
    fun `le dépliage se déroule depuis le haut tenu`() {
        val motion = law.heightMotion(Span(100f, 60f), Span(100f, 200f), Pin.Origin)!!
        assertThat(motion.translationFrom).isEqualTo(0f)
        assertThat(motion.revealFrom).isEqualTo(Span(0f, 60f))
    }

    @Test
    fun `au bas du fil le dépliage grandit vers le haut en révélant par le bas`() {
        val motion = law.heightMotion(Span(300f, 60f), Span(160f, 200f), Pin.End)!!
        assertThat(motion.translationFrom).isEqualTo(0f)
        assertThat(motion.revealFrom).isEqualTo(Span(140f, 60f))
    }

    @Test
    fun `le repli est le miroir sans rien rogner`() {
        val motion = law.heightMotion(Span(100f, 200f), Span(100f, 60f), Pin.End)!!
        assertThat(motion.translationFrom).isEqualTo(140f)
        assertThat(motion.revealFrom).isNull()
    }

    @Test
    fun `une cellule immobile ne joue rien`() {
        assertThat(law.heightMotion(Span(100f, 60f), Span(100f, 60f), Pin.Origin)).isNull()
    }

    @Test
    fun `les voisines se décalent d'écarts opposés au dépliage puis au repli`() {
        val folded = Span(100f, 60f)
        val unfolded = Span(100f, 200f)
        assertThat(law.regionShift(true, folded, unfolded)).isEqualTo(140f)
        assertThat(law.regionShift(true, unfolded, folded)).isEqualTo(-140f)
        assertThat(law.regionShift(false, Span(100f, 60f), Span(80f, 200f))).isEqualTo(-20f)
    }
}
