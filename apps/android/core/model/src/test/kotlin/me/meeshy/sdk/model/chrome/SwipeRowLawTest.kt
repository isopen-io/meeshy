package me.meeshy.sdk.model.chrome

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SwipeRowLawTest {
    private val w = SwipeRowLaw.ACTION_WIDTH_DP

    @Test
    fun `un cote ne porte jamais plus de trois actions`() {
        assertThat(SwipeRowLaw.capped(listOf(1, 2, 3, 4, 5))).containsExactly(1, 2, 3).inOrder()
        assertThat(SwipeRowLaw.capped(listOf(1))).containsExactly(1)
    }

    @Test
    fun `sous la zone d'action le decalage suit le doigt`() {
        assertThat(SwipeRowLaw.effectiveOffset(0f, 100f, 2 * w, 0f)).isEqualTo(100f)
        assertThat(SwipeRowLaw.effectiveOffset(0f, -50f, 0f, 2 * w)).isEqualTo(-50f)
    }

    @Test
    fun `au dela de la zone le decalage est amorti par le facteur elastique`() {
        val lw = 2 * w
        val expected = lw + 40f * SwipeRowLaw.RUBBER_FACTOR
        assertThat(SwipeRowLaw.effectiveOffset(0f, lw + 40f, lw, 0f)).isWithin(0.001f).of(expected)
        val tw = w
        assertThat(SwipeRowLaw.effectiveOffset(0f, -(tw + 10f), 0f, tw)).isWithin(0.001f).of(-(tw + 10f * SwipeRowLaw.RUBBER_FACTOR))
    }

    @Test
    fun `un cote sans action ne bouge que d'une fraction du geste`() {
        assertThat(SwipeRowLaw.effectiveOffset(0f, 100f, 0f, w)).isWithin(0.001f).of(100f * SwipeRowLaw.RUBBER_FACTOR)
        assertThat(SwipeRowLaw.effectiveOffset(0f, -100f, w, 0f)).isWithin(0.001f).of(-100f * SwipeRowLaw.RUBBER_FACTOR)
    }

    @Test
    fun `fermee la ligne s'ouvre au dela de 35 pour cent de la zone`() {
        val lw = 3 * w
        assertThat(SwipeRowLaw.resolveRelease(0f, lw * 0.36f, 0f, lw, 0f)).isEqualTo(lw)
        assertThat(SwipeRowLaw.resolveRelease(0f, lw * 0.34f, 0f, lw, 0f)).isEqualTo(0f)
    }

    @Test
    fun `un jet rapide ouvre meme sous le seuil`() {
        assertThat(SwipeRowLaw.resolveRelease(0f, 30f, 600f, 3 * w, 0f)).isEqualTo(3 * w)
        assertThat(SwipeRowLaw.resolveRelease(0f, -30f, -600f, 0f, 2 * w)).isEqualTo(-2 * w)
        assertThat(SwipeRowLaw.resolveRelease(0f, 10f, 600f, 3 * w, 0f)).isEqualTo(0f)
    }

    @Test
    fun `un cote sans action ne s'ouvre jamais`() {
        assertThat(SwipeRowLaw.resolveRelease(0f, 200f, 900f, 0f, w)).isEqualTo(0f)
        assertThat(SwipeRowLaw.resolveRelease(0f, -200f, -900f, w, 0f)).isEqualTo(0f)
    }

    @Test
    fun `ouverte la ligne reste ouverte sauf geste inverse franc`() {
        val lw = 2 * w
        assertThat(SwipeRowLaw.resolveRelease(lw, -5f, 0f, lw, 0f)).isEqualTo(lw)
        assertThat(SwipeRowLaw.resolveRelease(lw, -lw * 0.4f, 0f, lw, 0f)).isEqualTo(0f)
        assertThat(SwipeRowLaw.resolveRelease(lw, -15f, -600f, lw, 0f)).isEqualTo(0f)
        val tw = 2 * w
        assertThat(SwipeRowLaw.resolveRelease(-tw, tw * 0.4f, 0f, 0f, tw)).isEqualTo(0f)
        assertThat(SwipeRowLaw.resolveRelease(-tw, 5f, 0f, 0f, tw)).isEqualTo(-tw)
    }

    @Test
    fun `la cellule grandit de 0,4 a 1 et apparait vite`() {
        assertThat(SwipeRowLaw.cellScale(0f)).isWithin(0.0001f).of(0.4f)
        assertThat(SwipeRowLaw.cellScale(1f)).isWithin(0.0001f).of(1f)
        assertThat(SwipeRowLaw.cellOpacity(0.2f)).isWithin(0.0001f).of(0.5f)
        assertThat(SwipeRowLaw.cellOpacity(0.9f)).isEqualTo(1f)
    }

    @Test
    fun `la progression d'une cellule se mesure depuis son rang`() {
        assertThat(SwipeRowLaw.cellProgress(reveal = w * 1.5f, index = 0)).isEqualTo(1f)
        assertThat(SwipeRowLaw.cellProgress(reveal = w * 1.5f, index = 1)).isWithin(0.0001f).of(0.5f)
        assertThat(SwipeRowLaw.cellProgress(reveal = w * 1.5f, index = 2)).isEqualTo(0f)
    }

    @Test
    fun `un toucher hors du cadre ouvert ferme, dedans non, cadre inconnu ferme`() {
        val frame = SwipeRowFrame(0f, 100f, 400f, 180f)
        assertThat(SwipeRowLaw.closesOpenRow(200f, 140f, frame)).isFalse()
        assertThat(SwipeRowLaw.closesOpenRow(200f, 300f, frame)).isTrue()
        assertThat(SwipeRowLaw.closesOpenRow(200f, 140f, null)).isTrue()
    }
}
