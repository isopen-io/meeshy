package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.StoryDrawingStrokePoint
import me.meeshy.sdk.model.StrokeSmoothing
import me.meeshy.sdk.model.StrokeTool
import org.junit.Test

class RamerDouglasPeuckerTest {
    @Test fun `les points colineaires sont supprimes`() {
        val pts = List(6) { StrokePoint(it * 10.0, it * 5.0) }
        assertThat(RamerDouglasPeucker.straighten(pts)).containsExactly(pts.first(), pts.last()).inOrder()
    }

    @Test fun `un coin plus loin que 8 est conserve`() {
        val pts = listOf(StrokePoint(0.0, 0.0), StrokePoint(50.0, 20.0), StrokePoint(100.0, 0.0))
        assertThat(RamerDouglasPeucker.straighten(pts)).isEqualTo(pts)
    }

    @Test fun `une deviation de 8 exactement ou moins est supprimee`() {
        val pts = listOf(StrokePoint(0.0, 0.0), StrokePoint(50.0, 8.0), StrokePoint(100.0, 0.0))
        assertThat(RamerDouglasPeucker.straighten(pts)).hasSize(2)
        val over = listOf(StrokePoint(0.0, 0.0), StrokePoint(50.0, 8.5), StrokePoint(100.0, 0.0))
        assertThat(RamerDouglasPeucker.straighten(over)).hasSize(3)
    }

    @Test fun `tolerance zero est l'identite`() {
        val pts = List(5) { StrokePoint(it.toDouble(), 0.0) }
        assertThat(RamerDouglasPeucker.straighten(pts, tolerance = 0.0)).isEqualTo(pts)
    }

    @Test fun `chaque point conserve garde sa largeur source`() {
        val pts = listOf(StrokePoint(0.0, 0.0), StrokePoint(50.0, 30.0), StrokePoint(100.0, 0.0), StrokePoint(150.0, 0.0))
        val out = RamerDouglasPeucker.straighten(pts, listOf(1.0, 2.0, 3.0, 4.0))
        assertThat(out.map { it.width }).containsExactly(1.0, 2.0, 4.0).inOrder()
    }

    @Test fun `deux points ou moins restent identiques`() {
        val two = listOf(StrokePoint(0.0, 0.0), StrokePoint(1.0, 1.0))
        assertThat(RamerDouglasPeucker.straighten(two)).isEqualTo(two)
    }
}
