package me.meeshy.ui.story.canvas.drawing

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.StoryDrawingStrokePoint
import me.meeshy.sdk.model.StrokeSmoothing
import me.meeshy.sdk.model.StrokeTool
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StrokeRibbonRendererRobolectricTest {

    private fun stroke(
        id: String = "s",
        tool: StrokeTool = StrokeTool.PEN,
        smoothing: StrokeSmoothing = StrokeSmoothing.RAW,
        points: List<StoryDrawingStrokePoint> = listOf(
            StoryDrawingStrokePoint(100.0, 100.0), StoryDrawingStrokePoint(300.0, 200.0), StoryDrawingStrokePoint(500.0, 100.0),
        ),
    ) = StoryDrawingStroke(id = id, points = points, colorHex = "FF3B30", width = 12.0, tool = tool, smoothing = smoothing)

    private fun alpha(argb: Int) = argb ushr 24

    @Test
    fun `un trait stylo donne un ruban rempli non vide et opaque`() {
        val ops = StrokeRibbonRenderer.plan(listOf(stroke()))
        assertThat(ops).hasSize(1)
        val ribbon = ops.single() as StrokeOp.Ribbon
        assertThat(alpha(ribbon.argb)).isEqualTo(255)
    }

    @Test
    fun `le marqueur est peint a 45 pour cent d'opacite`() {
        val ribbon = StrokeRibbonRenderer.plan(listOf(stroke(tool = StrokeTool.MARKER))).single()
        assertThat(alpha(ribbon.argb)).isEqualTo((255 * 0.45f).toInt())
    }

    @Test
    fun `un trait gomme ou vide n'est jamais rendu`() {
        val ops = StrokeRibbonRenderer.plan(listOf(stroke(tool = StrokeTool.ERASER), stroke(points = emptyList())))
        assertThat(ops).isEmpty()
    }

    @Test
    fun `le trait selectionne porte un halo indigo de 14 px design en plus de sa largeur`() {
        val ops = StrokeRibbonRenderer.plan(listOf(stroke(id = "a"), stroke(id = "b")), selectedId = "b")
        val halos = ops.filterIsInstance<StrokeOp.Halo>()
        assertThat(halos).hasSize(1)
        assertThat(halos.single().widthDesign).isEqualTo(26f)
        assertThat(alpha(halos.single().argb)).isEqualTo((255 * 0.55f).toInt())
        assertThat(ops.indexOf(halos.single())).isLessThan(ops.lastIndex)
    }

    @Test
    fun `un trait d'un seul point est un bouchon rond visible`() {
        val ops = StrokeRibbonRenderer.plan(listOf(stroke(points = listOf(StoryDrawingStrokePoint(50.0, 50.0)))))
        assertThat(ops.single()).isInstanceOf(StrokeOp.Ribbon::class.java)
    }

    @Test
    fun `le cache reutilise la geometrie d'un trait recolore`() {
        val cache = StrokeGeometryCache()
        val a = stroke()
        StrokeRibbonRenderer.plan(listOf(a, a.copy(id = "autre", colorHex = "00FF00")), cache = cache)
        assertThat(cache.size).isEqualTo(1)
        StrokeRibbonRenderer.plan(listOf(a.copy(smoothing = StrokeSmoothing.CURVE)), cache = cache)
        assertThat(cache.size).isEqualTo(2)
    }

    @Test
    fun `le cache est borne`() {
        val cache = StrokeGeometryCache(capacity = 2)
        (1..5).forEach { cache.shapeOf(stroke(points = listOf(StoryDrawingStrokePoint(it.toDouble(), 0.0)))) }
        assertThat(cache.size).isEqualTo(2)
    }
}
