package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.StoryDrawingStrokePoint
import me.meeshy.sdk.model.StrokeSmoothing
import me.meeshy.sdk.model.StrokeTool
import org.junit.Test

private fun stroke(width: Double, vararg xy: Double, id: String = "s") = StoryDrawingStroke(
    id = id, colorHex = "000000", width = width,
    points = xy.toList().chunked(2).map { StoryDrawingStrokePoint(it[0], it[1]) },
)

class StrokeEraserHitTestTest {
    @Test fun `le seuil est largeur sur 2 plus 28 inclus`() {
        val s = stroke(10.0, 0.0, 0.0)
        assertThat(StrokeEraserHitTest.isHit(s, listOf(StrokePoint(33.0, 0.0)))).isTrue()
        assertThat(StrokeEraserHitTest.isHit(s, listOf(StrokePoint(33.01, 0.0)))).isFalse()
    }

    @Test fun `un point de gomme parmi plusieurs suffit`() {
        val s = stroke(10.0, 0.0, 0.0, 100.0, 0.0)
        assertThat(StrokeEraserHitTest.isHit(s, listOf(StrokePoint(500.0, 500.0), StrokePoint(100.0, 30.0)))).isTrue()
    }

    @Test fun `les survivants sont les traits non touches et rien n'est cree`() {
        val a = stroke(10.0, 0.0, 0.0, id = "a")
        val b = stroke(10.0, 500.0, 500.0, id = "b")
        assertThat(StrokeEraserHitTest.survivors(listOf(a, b), listOf(StrokePoint(5.0, 5.0)))).containsExactly(b)
        assertThat(StrokeEraserHitTest.survivors(listOf(a, b), emptyList())).containsExactly(a, b).inOrder()
    }

    @Test fun `le test porte sur les points rendus lisses`() {
        val s = StoryDrawingStroke(
            id = "s", colorHex = "000000", width = 2.0, smoothing = StrokeSmoothing.LINE,
            points = listOf(StoryDrawingStrokePoint(0.0, 0.0), StoryDrawingStrokePoint(50.0, 3.0), StoryDrawingStrokePoint(100.0, 0.0)),
        )
        assertThat(StrokeEraserHitTest.isHit(s, listOf(StrokePoint(50.0, 3.0)))).isFalse()
        assertThat(StrokeEraserHitTest.isHit(s, listOf(StrokePoint(0.0, 29.0)))).isTrue()
    }
}
