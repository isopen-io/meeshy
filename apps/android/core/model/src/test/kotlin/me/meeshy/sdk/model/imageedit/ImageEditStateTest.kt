package me.meeshy.sdk.model.imageedit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ImageEditStateTest {
    private val crop = NormalizedCrop(0.1f, 0.2f, 0.5f, 0.3f)

    @Test
    fun `l'identite n'a aucune retouche`() {
        assertThat(ImageEditState.IDENTITY.hasEdits).isFalse()
        assertThat(ImageEditState.IDENTITY.hasGeometryEdits).isFalse()
    }

    @Test
    fun `un filtre est une retouche sans geometrie`() {
        val s = ImageEditState(filter = ImageFilter.SEPIA)
        assertThat(s.hasEdits).isTrue()
        assertThat(s.hasGeometryEdits).isFalse()
    }

    @Test
    fun `rotation miroir et recadrage comptent comme geometrie`() {
        assertThat(ImageEditState(orientationTurns = 1).hasGeometryEdits).isTrue()
        assertThat(ImageEditState(flipHorizontal = true).hasGeometryEdits).isTrue()
        assertThat(ImageEditState(crop = crop).hasGeometryEdits).isTrue()
    }

    @Test
    fun `quatre quarts de tour horaires reviennent au recadrage initial`() {
        val s = (1..4).fold(ImageEditState(crop = crop)) { acc, _ -> acc.rotatedClockwise() }
        assertThat(s.orientationTurns).isEqualTo(0)
        assertThat(s.crop!!.x).isWithin(1e-5f).of(crop.x)
        assertThat(s.crop!!.y).isWithin(1e-5f).of(crop.y)
        assertThat(s.crop!!.width).isWithin(1e-5f).of(crop.width)
    }

    @Test
    fun `la rotation transporte le recadrage dans le nouveau cadre`() {
        val r = ImageEditState(crop = crop).rotatedClockwise().crop!!
        assertThat(r.x).isWithin(1e-5f).of(1f - 0.2f - 0.3f)
        assertThat(r.y).isWithin(1e-5f).of(0.1f)
        assertThat(r.width).isEqualTo(0.3f)
        assertThat(r.height).isEqualTo(0.5f)
    }

    @Test
    fun `antihoraire annule horaire`() {
        val s = ImageEditState(crop = crop).rotatedClockwise().rotatedCounterClockwise()
        assertThat(s.orientationTurns).isEqualTo(0)
        assertThat(s.crop!!.x).isWithin(1e-5f).of(crop.x)
        assertThat(s.crop!!.y).isWithin(1e-5f).of(crop.y)
    }

    @Test
    fun `antihoraire depuis zero donne trois quarts`() {
        assertThat(ImageEditState().rotatedCounterClockwise().orientationTurns).isEqualTo(3)
    }

    @Test
    fun `le miroir transporte le recadrage et se defait`() {
        val h = ImageEditState(crop = crop).flippedHorizontally()
        assertThat(h.flipHorizontal).isTrue()
        assertThat(h.crop!!.x).isWithin(1e-5f).of(1f - 0.1f - 0.5f)
        val v = ImageEditState(crop = crop).flippedVertically()
        assertThat(v.crop!!.y).isWithin(1e-5f).of(1f - 0.2f - 0.3f)
        assertThat(h.flippedHorizontally().flipHorizontal).isFalse()
    }

    @Test
    fun `normalizedTurns ramene dans zero a trois`() {
        assertThat(ImageEditState.normalizedTurns(-1)).isEqualTo(3)
        assertThat(ImageEditState.normalizedTurns(5)).isEqualTo(1)
    }
}
