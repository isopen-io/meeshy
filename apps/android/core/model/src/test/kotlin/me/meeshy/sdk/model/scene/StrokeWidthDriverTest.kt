package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.StoryDrawingStrokePoint
import me.meeshy.sdk.model.StrokeSmoothing
import me.meeshy.sdk.model.StrokeTool
import org.junit.Test

class StrokeWidthDriverTest {
    private fun line(n: Int, step: Double) = List(n) { StrokePoint(it * step, 0.0) }

    @Test fun `vitesse nulle donne pression 1 et vitesse max donne 0`() {
        assertThat(StrokeWidthDriver.fingerDriver(StrokeWidthDriver.normalize(0.0, 4000.0))).isEqualTo(1.0)
        assertThat(StrokeWidthDriver.fingerDriver(StrokeWidthDriver.normalize(4000.0, 4000.0))).isEqualTo(0.0)
        assertThat(StrokeWidthDriver.fingerDriver(StrokeWidthDriver.normalize(9000.0, 4000.0))).isEqualTo(0.0)
    }

    @Test fun `la vitesse est nulle sans predecesseur ou sans dt`() {
        assertThat(StrokeWidthDriver.velocity(null, StrokePoint(1.0, 1.0), 0.1)).isNull()
        assertThat(StrokeWidthDriver.velocity(StrokePoint(0.0, 0.0), StrokePoint(3.0, 4.0), 0.0)).isNull()
        assertThat(StrokeWidthDriver.velocity(StrokePoint(0.0, 0.0), StrokePoint(3.0, 4.0), 0.5)).isEqualTo(10.0)
    }

    @Test fun `la moyenne glissante de 5 lisse un pic`() {
        val avg = StrokeWidthDriver.movingAverage(listOf(0.0, 0.0, 10.0, 0.0, 0.0), 5)
        assertThat(avg[2]).isWithin(1e-9).of(2.0)
        assertThat(avg[0]).isWithin(1e-9).of(10.0 / 3)
    }

    @Test fun `le premier point est neutre a 0,5 et le doigt lent est epais`() {
        val p = StrokeWidthDriver.fingerPressures(line(6, 0.0), List(5) { 0.016 })
        assertThat(p.first()).isEqualTo(0.5)
        assertThat(p.drop(1)).containsExactly(1.0, 1.0, 1.0, 1.0, 1.0)
    }

    @Test fun `le doigt a vitesse max donne une pression nulle`() {
        val p = StrokeWidthDriver.fingerPressures(line(8, 4000.0), List(7) { 1.0 })
        assertThat(p[1]).isWithin(1e-9).of(0.25)
        assertThat(p.drop(3)).containsExactlyElementsIn(List(5) { 0.0 })
    }

    @Test fun `dts incoherents donnent des pressions neutres`() {
        assertThat(StrokeWidthDriver.fingerPressures(line(3, 1.0), listOf(0.1))).containsExactly(0.5, 0.5, 0.5)
    }

    @Test fun `le stylet est retenu quand l'etendue de force depasse 0,05`() {
        val pts = line(3, 4000.0)
        val p = StrokeWidthDriver.pressures(pts, listOf(1.0, 1.0), listOf(0.2, 0.5, 1.0))
        assertThat(p).containsExactly(0.2, 0.5, 1.0).inOrder()
    }

    @Test fun `une force quasi constante bascule sur la vitesse du doigt`() {
        val pts = line(3, 0.0)
        val p = StrokeWidthDriver.pressures(pts, listOf(0.016, 0.016), listOf(0.5, 0.52, 0.54))
        assertThat(p).containsExactly(0.5, 1.0, 1.0).inOrder()
    }

    @Test fun `pencilDriver sans force max est neutre`() {
        assertThat(StrokeWidthDriver.pencilDriver(0.3, 0.0)).isEqualTo(0.5)
    }
}
