package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.StoryDrawingStrokePoint
import me.meeshy.sdk.model.StrokeSmoothing
import me.meeshy.sdk.model.StrokeTool
import org.junit.Test

private fun wp(x: Double, y: Double, w: Double) = StrokeWidthPoint(StrokePoint(x, y), w)

class VariableWidthStrokeGeometryTest {
    @Test fun `le ruban pose gauche et droite a plus ou moins la normale fois la demi-largeur`() {
        val g = VariableWidthStrokeGeometry.tessellate(listOf(wp(0.0, 0.0, 10.0), wp(10.0, 0.0, 10.0)))
        assertThat(g.vertices).hasSize(4)
        assertThat(g.vertices[0].x).isWithin(1e-6).of(0.0)
        assertThat(g.vertices[0].y).isWithin(1e-6).of(5.0)
        assertThat(g.vertices[1].y).isWithin(1e-6).of(-5.0)
    }

    @Test fun `deux bouchons ronds de rayon largeur sur deux aux extremites`() {
        val g = VariableWidthStrokeGeometry.tessellate(listOf(wp(0.0, 0.0, 10.0), wp(10.0, 0.0, 20.0)))
        assertThat(g.caps).containsExactly(StrokeCap(StrokePoint(0.0, 0.0), 5.0), StrokeCap(StrokePoint(10.0, 0.0), 10.0)).inOrder()
    }

    @Test fun `le rayon de bouchon a un plancher de 0,5`() {
        val g = VariableWidthStrokeGeometry.tessellate(listOf(wp(0.0, 0.0, 0.2), wp(5.0, 0.0, 0.4)))
        assertThat(g.caps.map { it.radius }).containsExactly(0.5, 0.5)
    }

    @Test fun `un trait d'un seul point donne un seul disque`() {
        val g = VariableWidthStrokeGeometry.tessellate(listOf(wp(3.0, 4.0, 12.0)))
        assertThat(g.caps).containsExactly(StrokeCap(StrokePoint(3.0, 4.0), 6.0))
        assertThat(g.vertices).hasSize(2)
    }

    @Test fun `aucun point donne une geometrie vide`() {
        val g = VariableWidthStrokeGeometry.tessellate(emptyList())
        assertThat(g.vertices).isEmpty()
        assertThat(g.caps).isEmpty()
    }

    @Test fun `le trait curve legacy rend une largeur constante sur 8 echantillons par segment`() {
        val s = StoryDrawingStroke(
            id = "s", colorHex = "000000", width = 6.0, smoothing = StrokeSmoothing.CURVE,
            points = listOf(StoryDrawingStrokePoint(0.0, 0.0), StoryDrawingStrokePoint(10.0, 10.0), StoryDrawingStrokePoint(20.0, 0.0)),
        )
        val pts = VariableWidthStrokeGeometry.renderWidthPoints(s)
        assertThat(pts).hasSize(17)
        assertThat(pts.map { it.width }.distinct()).containsExactly(6.0)
    }

    @Test fun `le mode line simplifie avec la tolerance 8`() {
        val s = StoryDrawingStroke(
            id = "s", colorHex = "000000", width = 6.0, smoothing = StrokeSmoothing.LINE,
            points = listOf(StoryDrawingStrokePoint(0.0, 0.0), StoryDrawingStrokePoint(50.0, 5.0), StoryDrawingStrokePoint(100.0, 0.0)),
        )
        assertThat(VariableWidthStrokeGeometry.renderPoints(s)).hasSize(2)
    }
}
