package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * La géométrie de design unique : une scène a toujours 1080 de large, et c'est
 * la HAUTEUR design qui suit le format (1920 en portrait, 607,5 en paysage).
 * Port de `CanvasGeometry` (iOS, `MeeshyUI/Story/Canvas`).
 */
@RunWith(JUnit4::class)
class CanvasGeometryTest {

    @Test
    fun `la largeur design est 1080`() {
        assertThat(CanvasGeometry.DESIGN_WIDTH).isEqualTo(1080.0)
    }

    @Test
    fun `le facteur d echelle est la largeur rendue sur 1080`() {
        assertThat(CanvasGeometry.scaleFactor(540.0)).isEqualTo(0.5)
        assertThat(CanvasGeometry.scaleFactor(1080.0)).isEqualTo(1.0)
        assertThat(CanvasGeometry.scaleFactor(2160.0)).isEqualTo(2.0)
    }

    @Test
    fun `une largeur rendue degeneree donne un facteur nul et non un NaN`() {
        assertThat(CanvasGeometry.scaleFactor(0.0)).isEqualTo(0.0)
        assertThat(CanvasGeometry.scaleFactor(-12.0)).isEqualTo(0.0)
        assertThat(CanvasGeometry.scaleFactor(Double.NaN)).isEqualTo(0.0)
    }

    @Test
    fun `la hauteur design est 1920 en portrait et 607,5 en paysage`() {
        assertThat(CanvasGeometry.designHeight(CanvasFormat.PORTRAIT)).isEqualTo(1920.0)
        assertThat(CanvasGeometry.designHeight(CanvasFormat.LANDSCAPE)).isEqualTo(607.5)
    }

    @Test
    fun `la taille design garde 1080 de large dans les deux formats`() {
        assertThat(CanvasGeometry.designSize(CanvasFormat.PORTRAIT)).isEqualTo(CanvasSize(1080.0, 1920.0))
        assertThat(CanvasGeometry.designSize(CanvasFormat.LANDSCAPE)).isEqualTo(CanvasSize(1080.0, 607.5))
    }

    @Test
    fun `deux largeurs rendues donnent des positions proportionnelles identiques`() {
        val small = CanvasGeometry.of(CanvasFormat.PORTRAIT, renderedWidth = 412.0)
        val large = CanvasGeometry.of(CanvasFormat.PORTRAIT, renderedWidth = 820.0)

        val centerOnSmall = small.render(540.0) / small.renderWidth
        val centerOnLarge = large.render(540.0) / large.renderWidth
        val bottomOnSmall = small.render(small.designHeight) / small.renderHeight
        val bottomOnLarge = large.render(large.designHeight) / large.renderHeight

        assertThat(centerOnSmall).isWithin(1e-9).of(centerOnLarge)
        assertThat(bottomOnSmall).isWithin(1e-9).of(bottomOnLarge)
        assertThat(large.render(64.0) / small.render(64.0)).isWithin(1e-9).of(820.0 / 412.0)
    }

    @Test
    fun `une geometrie construite depuis un format rend le cadre au bon ratio`() {
        val portrait = CanvasGeometry.of(CanvasFormat.PORTRAIT, renderedWidth = 540.0)
        val landscape = CanvasGeometry.of(CanvasFormat.LANDSCAPE, renderedWidth = 960.0)

        assertThat(portrait.renderHeight).isWithin(1e-9).of(960.0)
        assertThat(landscape.renderHeight).isWithin(1e-9).of(540.0)
    }

    @Test
    fun `la hauteur design d une instance suit le ratio des bornes de rendu`() {
        val portrait = CanvasGeometry(renderWidth = 540.0, renderHeight = 960.0)
        val landscape = CanvasGeometry(renderWidth = 1920.0, renderHeight = 1080.0)

        assertThat(portrait.designHeight).isWithin(1e-9).of(1920.0)
        assertThat(portrait.designSize.width).isEqualTo(1080.0)
        assertThat(landscape.designHeight).isWithin(1e-9).of(607.5)
        assertThat(landscape.designSize.width).isEqualTo(1080.0)
    }

    @Test
    fun `des bornes de rendu degenerees retombent sur le portrait`() {
        val geometry = CanvasGeometry(renderWidth = 0.0, renderHeight = 0.0)

        assertThat(geometry.designSize).isEqualTo(CanvasSize(1080.0, 1920.0))
        assertThat(geometry.scaleFactor).isEqualTo(0.0)
    }

    @Test
    fun `le facteur et les longueurs d une instance suivent la largeur rendue`() {
        val geometry = CanvasGeometry(renderWidth = 540.0, renderHeight = 960.0)

        assertThat(geometry.scaleFactor).isEqualTo(0.5)
        assertThat(geometry.render(100.0)).isEqualTo(50.0)
        assertThat(geometry.render(64.0)).isEqualTo(32.0)
        assertThat(geometry.designLength(normalized = 0.5)).isEqualTo(540.0)
        assertThat(geometry.designLength(normalized = 1.0)).isEqualTo(1080.0)
    }

    @Test
    fun `la coordonnee y normalisee d un cadre paysage atterrit sur son bord bas`() {
        val geometry = CanvasGeometry(renderWidth = 800.0, renderHeight = 450.0)

        val designY = geometry.designHeightLength(normalized = 1.0)

        assertThat(designY).isWithin(1e-9).of(607.5)
        assertThat(geometry.render(designY)).isWithin(1e-9).of(450.0)
        assertThat(geometry.designHeightLength(normalized = 0.5)).isWithin(1e-9).of(303.75)
    }

    @Test
    fun `le cadre portrait ajuste dans une zone plus haute est borne par la largeur`() {
        val fit = CanvasGeometry.aspectFitSize(CanvasSize(402.0, 874.0), CanvasFormat.PORTRAIT)

        assertThat(fit.width).isEqualTo(402.0)
        assertThat(fit.height).isWithin(1e-9).of(402.0 * 16.0 / 9.0)
        assertThat(fit.height).isLessThan(874.0)
    }

    @Test
    fun `le cadre portrait ajuste dans une zone plus large est borne par la hauteur`() {
        val fit = CanvasGeometry.aspectFitSize(CanvasSize(2000.0, 800.0), CanvasFormat.PORTRAIT)

        assertThat(fit.height).isEqualTo(800.0)
        assertThat(fit.width).isWithin(1e-9).of(800.0 * 9.0 / 16.0)
    }

    @Test
    fun `le cadre paysage est letterboxe dans une zone portrait`() {
        val fit = CanvasGeometry.aspectFitSize(CanvasSize(402.0, 874.0), CanvasFormat.LANDSCAPE)

        assertThat(fit.width).isEqualTo(402.0)
        assertThat(fit.height).isWithin(1e-9).of(402.0 * 9.0 / 16.0)
        assertThat(fit.width / fit.height).isWithin(1e-9).of(16.0 / 9.0)
    }

    @Test
    fun `le cadre ajuste est portrait par defaut`() {
        val area = CanvasSize(402.0, 874.0)

        assertThat(CanvasGeometry.aspectFitSize(area))
            .isEqualTo(CanvasGeometry.aspectFitSize(area, CanvasFormat.PORTRAIT))
    }

    @Test
    fun `une zone vide ou degeneree est rendue telle quelle`() {
        assertThat(CanvasGeometry.aspectFitSize(CanvasSize(0.0, 0.0))).isEqualTo(CanvasSize(0.0, 0.0))
        assertThat(CanvasGeometry.aspectFitSize(CanvasSize(300.0, -1.0))).isEqualTo(CanvasSize(300.0, -1.0))
    }

    @Test
    fun `le composer et le lecteur ajustent a la meme taille depuis la meme zone`() {
        val area = CanvasSize(402.0, 874.0)

        val composer = CanvasGeometry.aspectFitSize(area, CanvasFormat.PORTRAIT)
        val reader = CanvasGeometry.aspectFitSize(area, CanvasFormat.PORTRAIT)

        assertThat(composer).isEqualTo(reader)
        assertThat(CanvasGeometry.of(CanvasFormat.PORTRAIT, composer.width).designHeight)
            .isWithin(1e-9).of(1920.0)
    }

    @Test
    fun `la taille d un sticker suit baseSize fois echelle projete sur la largeur`() {
        assertThat(CanvasGeometry.stickerFontSize(baseSize = 140.0, scale = 1.0, canvasWidth = 1080.0))
            .isEqualTo(140.0)
        assertThat(CanvasGeometry.stickerFontSize(baseSize = 140.0, scale = 2.0, canvasWidth = 540.0))
            .isEqualTo(140.0)
    }

    @Test
    fun `la taille d un sticker a un plancher de 8 et un canevas vide donne zero`() {
        assertThat(CanvasGeometry.stickerFontSize(baseSize = 10.0, scale = 0.3, canvasWidth = 100.0))
            .isEqualTo(8.0)
        assertThat(CanvasGeometry.stickerFontSize(baseSize = 140.0, scale = 1.0, canvasWidth = 0.0))
            .isEqualTo(0.0)
    }
}
