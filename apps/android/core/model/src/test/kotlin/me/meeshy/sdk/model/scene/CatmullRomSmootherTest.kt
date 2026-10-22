package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.StoryDrawingStrokePoint
import me.meeshy.sdk.model.StrokeSmoothing
import me.meeshy.sdk.model.StrokeTool
import org.junit.Test

class CatmullRomSmootherTest {
    private val pts = listOf(StrokePoint(0.0, 0.0), StrokePoint(10.0, 10.0), StrokePoint(20.0, 0.0), StrokePoint(30.0, 10.0))

    @Test fun `8 echantillons par segment plus le point de depart`() {
        assertThat(CatmullRomSmoother.smooth(pts)).hasSize(1 + 3 * 8)
    }

    @Test fun `les extremites sont preservees et la courbe passe par les points`() {
        val out = CatmullRomSmoother.smooth(pts)
        assertThat(out.first()).isEqualTo(pts.first())
        assertThat(out.last().x).isWithin(1e-9).of(30.0)
        assertThat(out[8].x).isWithin(1e-9).of(10.0)
        assertThat(out[8].y).isWithin(1e-9).of(10.0)
    }

    @Test fun `moins de 3 points reste identique`() {
        val two = pts.take(2)
        assertThat(CatmullRomSmoother.smooth(two)).isEqualTo(two)
    }

    @Test fun `les largeurs sont interpolees en lockstep`() {
        val out = CatmullRomSmoother.smooth(pts, listOf(2.0, 4.0, 6.0, 8.0))
        assertThat(out).hasSize(25)
        assertThat(out.first().width).isEqualTo(2.0)
        assertThat(out[8].width).isWithin(1e-9).of(4.0)
        assertThat(out.last().width).isWithin(1e-9).of(8.0)
        assertThat(out[4].width).isGreaterThan(2.0)
        assertThat(out[4].width).isLessThan(4.5)
    }

    @Test fun `largeurs de longueur differente laissent la source intacte`() {
        assertThat(CatmullRomSmoother.smooth(pts, listOf(1.0))).hasSize(1)
    }
}
