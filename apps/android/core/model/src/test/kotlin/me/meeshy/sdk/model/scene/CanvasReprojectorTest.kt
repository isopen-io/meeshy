package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.StoryDrawingStrokePoint
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.StrokeSmoothing
import me.meeshy.sdk.model.StrokeTool
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for [CanvasReprojector] — the Android port of iOS
 * `CanvasReprojector`. Positions are normalized `[0, 1]`; reprojection is
 * center-anchored (`(0.5, 0.5)` is a fixed point) and scaled by the
 * source/target aspect ratio, clamping out-of-bounds results back into `[0, 1]`
 * and reporting each with a [ReprojectionWarning.Clamped]. Scale, aspect ratio
 * and rotation are invariant. The batch [CanvasReprojector.reprojectAll] counts
 * the clamps that drive the composer's "items repositioned" banner.
 */
@RunWith(JUnit4::class)
class CanvasReprojectorTest {

    private val portrait = CanvasSize(1080.0, 1920.0)
    private val square = CanvasSize(1080.0, 1080.0)
    private val landscape = CanvasSize(1920.0, 1080.0)

    private fun text(x: Double, y: Double) = StoryTextObject(id = "t", text = "x", x = x, y = y)

    @Test
    fun `a centered item stays centered when 9-16 reprojects to 1-1`() {
        val result = CanvasReprojector(portrait, square).reproject(text(0.5, 0.5))

        assertThat(result.value.x).isWithin(1e-9).of(0.5)
        assertThat(result.value.y).isWithin(1e-9).of(0.5)
        assertThat(result.warning).isNull()
    }

    @Test
    fun `the horizontal position is untouched when the widths match`() {
        // 1080-wide source and target ⇒ scaleX == 1 ⇒ x is a fixed point.
        val result = CanvasReprojector(portrait, square).reproject(text(0.2, 0.5))

        assertThat(result.value.x).isWithin(1e-9).of(0.2)
        assertThat(result.warning).isNull()
    }

    @Test
    fun `a bottom item is pushed out of bounds and clamped with a warning`() {
        val result = CanvasReprojector(portrait, square).reproject(text(0.5, 0.95))

        // scaleY = 1920/1080 ⇒ projectedY = 0.5 + 0.45*1.777… = 1.3 ⇒ clamped to 1.0.
        assertThat(result.value.y).isWithin(1e-9).of(1.0)
        assertThat(result.warning).isEqualTo(ReprojectionWarning.Clamped(originalX = 0.5, originalY = 0.95))
    }

    @Test
    fun `a top item clamps to zero, not one`() {
        val result = CanvasReprojector(portrait, square).reproject(text(0.5, 0.05))

        // projectedY = 0.5 + (-0.45)*1.777… = -0.3 ⇒ clamped to 0.0.
        assertThat(result.value.y).isWithin(1e-9).of(0.0)
        assertThat(result.warning).isEqualTo(ReprojectionWarning.Clamped(originalX = 0.5, originalY = 0.05))
    }

    @Test
    fun `the clamp warning reports the ORIGINAL coordinates, not the clamped ones`() {
        val result = CanvasReprojector(landscape, square).reproject(text(0.95, 0.5))

        val warning = result.warning
        assertThat(warning).isInstanceOf(ReprojectionWarning.Clamped::class.java)
        warning as ReprojectionWarning.Clamped
        assertThat(warning.originalX).isEqualTo(0.95)
        assertThat(warning.originalY).isEqualTo(0.5)
        // and the projected x is the clamped 1.0, distinct from the reported original.
        assertThat(result.value.x).isWithin(1e-9).of(1.0)
    }

    @Test
    fun `a taller target pulls an off-center item toward center without clamping`() {
        // square ⇒ portrait: scaleY = 1080/1920 = 0.5625 < 1 ⇒ item moves closer to center.
        val result = CanvasReprojector(square, portrait).reproject(text(0.5, 0.95))

        val expected = 0.5 + (0.95 - 0.5) * (1080.0 / 1920.0)
        assertThat(result.value.y).isWithin(1e-9).of(expected)
        assertThat(result.value.y).isLessThan(0.95) // pulled toward center
        assertThat(result.warning).isNull()
    }

    @Test
    fun `an in-bounds item is still moved when the aspect ratio changes`() {
        val result = CanvasReprojector(portrait, square).reproject(text(0.5, 0.7))

        val expected = 0.5 + (0.7 - 0.5) * (1920.0 / 1080.0)
        assertThat(result.value.y).isWithin(1e-9).of(expected)
        assertThat(result.value.y).isGreaterThan(0.7) // stretched away from center, still < 1
        assertThat(result.warning).isNull()
    }

    @Test
    fun `media aspect ratio is invariant under reprojection`() {
        val media = StoryMediaObject(id = "m", postMediaId = "pm", aspectRatio = 1.5, x = 0.5, y = 0.5)

        val result = CanvasReprojector(portrait, square).reproject(media)

        assertThat(result.value.aspectRatio).isEqualTo(1.5)
    }

    @Test
    fun `sticker rotation is invariant under reprojection`() {
        val sticker = StorySticker(id = "s", emoji = "⭐", x = 0.5, y = 0.5, rotation = 45.0)

        val result = CanvasReprojector(portrait, square).reproject(sticker)

        assertThat(result.value.rotation).isEqualTo(45.0)
    }

    @Test
    fun `audio reprojection is identity with no warning`() {
        val audio = StoryAudioPlayerObject(id = "a", x = 0.1, y = 0.9)

        val result = CanvasReprojector(portrait, square).reproject(audio)

        assertThat(result.value).isSameInstanceAs(audio)
        assertThat(result.warning).isNull()
    }

    @Test
    fun `a degenerate target size is an identity reprojection, never NaN`() {
        val result = CanvasReprojector(portrait, CanvasSize(0.0, 1080.0)).reproject(text(0.2, 0.95))

        assertThat(result.value.x).isEqualTo(0.2)
        assertThat(result.value.y).isEqualTo(0.95)
        assertThat(result.warning).isNull()
    }

    @Test
    fun `reprojectAll counts every clamped item across families for the banner`() {
        val objects = CanvasObjects(
            textObjects = listOf(text(0.5, 0.5), text(0.5, 0.95)), // 2nd clamps
            mediaObjects = listOf(StoryMediaObject(id = "m", x = 0.5, y = 0.02)), // clamps (top)
            stickers = listOf(StorySticker(id = "s", x = 0.5, y = 0.5)), // stays
            audioPlayerObjects = listOf(StoryAudioPlayerObject(id = "a", x = 0.1, y = 0.9)),
        )

        val result = CanvasReprojector(portrait, square).reprojectAll(objects)

        assertThat(result.repositionedCount).isEqualTo(2)
        assertThat(result.hasClampedItems).isTrue()
        // the reprojected set preserves cardinality per family
        assertThat(result.objects.textObjects).hasSize(2)
        assertThat(result.objects.mediaObjects).hasSize(1)
        assertThat(result.objects.stickers).hasSize(1)
        assertThat(result.objects.audioPlayerObjects).hasSize(1)
    }

    @Test
    fun `reprojectAll with only centered items reports no repositioning`() {
        val objects = CanvasObjects(
            textObjects = listOf(text(0.5, 0.5)),
            stickers = listOf(StorySticker(id = "s", x = 0.5, y = 0.5)),
        )

        val result = CanvasReprojector(portrait, square).reprojectAll(objects)

        assertThat(result.repositionedCount).isEqualTo(0)
        assertThat(result.hasClampedItems).isFalse()
        assertThat(result.warnings).isEmpty()
    }

    @Test
    fun `reprojectAll on an empty set is an empty, banner-less result`() {
        val result = CanvasReprojector(portrait, square).reprojectAll(CanvasObjects())

        assertThat(result.repositionedCount).isEqualTo(0)
        assertThat(result.hasClampedItems).isFalse()
        assertThat(result.objects.textObjects).isEmpty()
    }

    // region portrait <-> paysage (loi de format, #11614)

    private val toLandscape = CanvasReprojector.between(CanvasFormat.PORTRAIT, CanvasFormat.LANDSCAPE)
    private val toPortrait = CanvasReprojector.between(CanvasFormat.LANDSCAPE, CanvasFormat.PORTRAIT)

    @Test
    fun `la conversion de format lit les tailles design des deux cadres`() {
        val viaFormats = CanvasReprojector.between(CanvasFormat.PORTRAIT, CanvasFormat.LANDSCAPE)
        val viaSizes = CanvasReprojector(CanvasSize(1080.0, 1920.0), CanvasSize(1080.0, 607.5))

        val a = viaFormats.reproject(text(0.3, 0.6))
        val b = viaSizes.reproject(text(0.3, 0.6))

        assertThat(a.value).isEqualTo(b.value)
        assertThat(a.warning).isEqualTo(b.warning)
    }

    @Test
    fun `le centre est preserve du portrait vers le paysage et inversement`() {
        val forward = toLandscape.reproject(text(0.5, 0.5))
        val backward = toPortrait.reproject(text(0.5, 0.5))

        assertThat(forward.value.x).isWithin(1e-9).of(0.5)
        assertThat(forward.value.y).isWithin(1e-9).of(0.5)
        assertThat(forward.warning).isNull()
        assertThat(backward.value.x).isWithin(1e-9).of(0.5)
        assertThat(backward.value.y).isWithin(1e-9).of(0.5)
        assertThat(backward.warning).isNull()
    }

    @Test
    fun `x ne bouge pas car les deux cadres ont la meme largeur design`() {
        val result = toLandscape.reproject(text(0.1, 0.5))

        assertThat(result.value.x).isWithin(1e-9).of(0.1)
        assertThat(result.warning).isNull()
    }

    @Test
    fun `un objet haut dans le portrait est ramene dans le paysage avec un avertissement`() {
        val result = toLandscape.reproject(text(0.5, 0.2))

        // y = 0,5 + (0,2 - 0,5) x 1920 / 607,5 = -0,448 => ramene a 0.
        assertThat(result.value.y).isEqualTo(0.0)
        assertThat(result.warning).isEqualTo(ReprojectionWarning.Clamped(originalX = 0.5, originalY = 0.2))
    }

    @Test
    fun `un objet proche du centre garde sa distance en pixels design vers le paysage`() {
        val result = toLandscape.reproject(text(0.5, 0.55))

        val expectedDesignOffset = (0.55 - 0.5) * 1920.0
        assertThat((result.value.y - 0.5) * 607.5).isWithin(1e-9).of(expectedDesignOffset)
        assertThat(result.warning).isNull()
    }

    @Test
    fun `du paysage vers le portrait les objets se rapprochent du centre sans debordement`() {
        val result = toPortrait.reproject(text(0.95, 0.95))

        assertThat(result.value.y).isWithin(1e-9).of(0.5 + 0.45 * (607.5 / 1920.0))
        assertThat(result.value.x).isWithin(1e-9).of(0.95)
        assertThat(result.warning).isNull()
    }

    @Test
    fun `un aller retour portrait paysage portrait rend la position d origine quand rien ne deborde`() {
        val original = text(0.3, 0.55)

        val back = toPortrait.reproject(toLandscape.reproject(original).value).value

        assertThat(back.x).isWithin(1e-9).of(0.3)
        assertThat(back.y).isWithin(1e-9).of(0.55)
    }

    @Test
    fun `un aller retour paysage portrait paysage rend toujours la position d origine`() {
        val original = text(0.8, 0.9)

        val forward = toPortrait.reproject(original)
        val back = toLandscape.reproject(forward.value).value

        assertThat(forward.warning).isNull()
        assertThat(back.x).isWithin(1e-9).of(0.8)
        assertThat(back.y).isWithin(1e-9).of(0.9)
    }

    @Test
    fun `l echelle et la rotation d un texte sont invariantes d un format a l autre`() {
        val source = StoryTextObject(id = "t", text = "x", x = 0.5, y = 0.5, scale = 2.0, rotation = 30.0)

        val result = toLandscape.reproject(source).value

        assertThat(result.scale).isEqualTo(2.0)
        assertThat(result.rotation).isEqualTo(30.0)
    }

    @Test
    fun `la meme conversion de format est une identite sans avertissement`() {
        val same = CanvasReprojector.between(CanvasFormat.LANDSCAPE, CanvasFormat.LANDSCAPE)

        val result = same.reproject(text(0.12, 0.97))

        assertThat(result.value.x).isWithin(1e-9).of(0.12)
        assertThat(result.value.y).isWithin(1e-9).of(0.97)
        assertThat(result.warning).isNull()
    }

    @Test
    fun `le compteur de la banniere compte un avertissement par objet ramene du portrait vers le paysage`() {
        val objects = CanvasObjects(
            textObjects = listOf(text(0.5, 0.5), text(0.5, 0.1)),
            mediaObjects = listOf(StoryMediaObject(id = "m", x = 0.5, y = 0.9)),
            stickers = listOf(StorySticker(id = "s", x = 0.5, y = 0.52)),
        )

        val result = toLandscape.reprojectAll(objects)

        assertThat(result.repositionedCount).isEqualTo(2)
        assertThat(result.warnings).hasSize(2)
        assertThat(result.hasClampedItems).isTrue()
    }

    // endregion

    // region position generique (couture des lieux)

    @Test
    fun `une position nue est reprojetee comme un objet`() {
        val result = toLandscape.reprojectPosition(x = 0.5, y = 0.95)

        assertThat(result.value).isEqualTo(NormalizedPosition(x = 0.5, y = 1.0))
        assertThat(result.warning).isEqualTo(ReprojectionWarning.Clamped(originalX = 0.5, originalY = 0.95))
    }

    @Test
    fun `une position nue au centre ne bouge pas`() {
        val result = toLandscape.reprojectPosition(x = 0.5, y = 0.5)

        assertThat(result.value).isEqualTo(NormalizedPosition(x = 0.5, y = 0.5))
        assertThat(result.warning).isNull()
    }

    // endregion

    // region traits (dessin a main levee)

    private fun stroke(vararg points: Pair<Double, Double>, width: Double = 12.0) = StoryDrawingStroke(
        id = "st",
        points = points.map { (x, y) -> StoryDrawingStrokePoint(x = x, y = y, pressure = 0.7) },
        colorHex = "FF0000",
        width = width,
    )

    @Test
    fun `le centre d un trait est preserve du portrait vers le paysage`() {
        val result = toLandscape.reproject(stroke(540.0 to 960.0))

        val point = result.value.points.single()
        assertThat(point.x).isWithin(1e-9).of(540.0)
        assertThat(point.y).isWithin(1e-9).of(303.75)
        assertThat(result.warning).isNull()
    }

    @Test
    fun `un trait garde sa forme avec une echelle uniforme et son epaisseur suit`() {
        val result = toLandscape.reproject(stroke(0.0 to 0.0, 1080.0 to 1920.0, width = 20.0))

        // echelle uniforme = min(1080 / 1080, 607,5 / 1920) = 0,31640625 autour du centre.
        val s = 607.5 / 1920.0
        val (first, last) = result.value.points
        assertThat(first.x).isWithin(1e-9).of(540.0 - 540.0 * s)
        assertThat(first.y).isWithin(1e-9).of(0.0)
        assertThat(last.x).isWithin(1e-9).of(540.0 + 540.0 * s)
        assertThat(last.y).isWithin(1e-9).of(607.5)
        assertThat(result.value.width).isWithin(1e-9).of(20.0 * s)
        assertThat(result.warning).isNull()
    }

    @Test
    fun `un trait hors du cadre source est ramene dans le cadre cible avec un seul avertissement`() {
        val result = toLandscape.reproject(stroke(540.0 to 960.0, 540.0 to 5000.0, 540.0 to 9000.0))

        assertThat(result.value.points.map { it.y }.all { it in 0.0..607.5 }).isTrue()
        assertThat(result.warning).isInstanceOf(ReprojectionWarning.Clamped::class.java)
    }

    @Test
    fun `un trait garde son identite sa couleur son outil et la pression de ses points`() {
        val source = stroke(100.0 to 100.0, 200.0 to 300.0).copy(
            id = "keep",
            tool = StrokeTool.MARKER,
            smoothing = StrokeSmoothing.CURVE,
            createdAt = 1700000000.0,
            captureVersion = 2,
        )

        val result = toLandscape.reproject(source).value

        assertThat(result.id).isEqualTo("keep")
        assertThat(result.colorHex).isEqualTo("FF0000")
        assertThat(result.tool).isEqualTo(StrokeTool.MARKER)
        assertThat(result.smoothing).isEqualTo(StrokeSmoothing.CURVE)
        assertThat(result.createdAt).isEqualTo(1700000000.0)
        assertThat(result.captureVersion).isEqualTo(2)
        assertThat(result.points.map { it.pressure }).containsExactly(0.7, 0.7).inOrder()
    }

    @Test
    fun `du paysage vers le portrait un trait ne grossit pas et reste centre`() {
        val result = toPortrait.reproject(stroke(540.0 to 303.75, width = 12.0))

        val point = result.value.points.single()
        assertThat(point.x).isWithin(1e-9).of(540.0)
        assertThat(point.y).isWithin(1e-9).of(960.0)
        assertThat(result.value.width).isWithin(1e-9).of(12.0)
        assertThat(result.warning).isNull()
    }

    @Test
    fun `une cible degeneree laisse le trait intact`() {
        val degenerate = CanvasReprojector(CanvasSize(1080.0, 1920.0), CanvasSize(0.0, 607.5))
        val source = stroke(10.0 to 20.0)

        val result = degenerate.reproject(source)

        assertThat(result.value).isEqualTo(source)
        assertThat(result.warning).isNull()
    }

    @Test
    fun `reprojectAll reprojette aussi les traits et les compte dans la banniere`() {
        val objects = CanvasObjects(
            textObjects = listOf(text(0.5, 0.5)),
            drawingStrokes = listOf(
                stroke(540.0 to 960.0),
                stroke(540.0 to 960.0, 540.0 to 9000.0),
            ),
        )

        val result = toLandscape.reprojectAll(objects)

        assertThat(result.objects.drawingStrokes).hasSize(2)
        assertThat(result.objects.drawingStrokes.first().points.single().y).isWithin(1e-9).of(303.75)
        assertThat(result.repositionedCount).isEqualTo(1)
    }

    // endregion
}
