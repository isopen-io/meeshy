package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class SceneStickerFrameTest {

    private fun geometry(width: Double) = CanvasGeometry.of(CanvasFormat.PORTRAIT, renderedWidth = width)

    @Test
    fun `le cote est la taille de base fois l echelle fois le facteur de geometrie`() {
        assertThat(SceneStickerFrame.side(140.0, 2.0, geometry(540.0))).isWithin(1e-9).of(140.0)
        assertThat(SceneStickerFrame.side(140.0, 1.0, geometry(1080.0))).isWithin(1e-9).of(140.0)
    }

    @Test
    fun `deux largeurs rendues donnent des cotes proportionnels`() {
        val small = SceneStickerFrame.side(140.0, 1.5, geometry(412.0))
        val large = SceneStickerFrame.side(140.0, 1.5, geometry(824.0))
        assertThat(large / small).isWithin(1e-9).of(2.0)
    }

    @Test
    fun `une echelle non finie ou une base degeneree ne donne jamais NaN`() {
        assertThat(SceneStickerFrame.side(Double.NaN, 1.0, geometry(412.0))).isEqualTo(0.0)
        assertThat(SceneStickerFrame.side(140.0, Double.NaN, geometry(412.0)).isNaN()).isFalse()
    }

    @Test
    fun `le cote raster est entier et au moins un quand il y a quelque chose a peindre`() {
        assertThat(SceneStickerFrame.rasterSide(0.2)).isEqualTo(1)
        assertThat(SceneStickerFrame.rasterSide(57.6)).isEqualTo(58)
        assertThat(SceneStickerFrame.rasterSide(0.0)).isEqualTo(0)
        assertThat(SceneStickerFrame.rasterSide(Double.NaN)).isEqualTo(0)
    }
}
