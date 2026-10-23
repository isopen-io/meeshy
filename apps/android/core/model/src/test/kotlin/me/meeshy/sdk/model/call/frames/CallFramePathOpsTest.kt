package me.meeshy.sdk.model.call.frames

import com.google.common.truth.Truth.assertThat
import kotlin.math.PI
import org.junit.Test

class CallFramePathOpsTest {

    @Test
    fun `un arc horaire balaie de son depart a son arrivee`() {
        assertThat(CallFramePathOp.Arc(0.0, 0.0, 1.0, PI, 0.0, false).sweep).isWithin(1e-9).of(PI)
        assertThat(CallFramePathOp.Arc(0.0, 0.0, 1.0, 0.0, PI / 2, false).sweep).isWithin(1e-9).of(PI / 2)
    }

    @Test
    fun `un arc anti horaire balaie en sens inverse`() {
        assertThat(CallFramePathOp.Arc(0.0, 0.0, 1.0, PI, PI / 2, true).sweep).isWithin(1e-9).of(-PI / 2)
        assertThat(CallFramePathOp.Arc(0.0, 0.0, 1.0, -PI / 2, PI / 2, true).sweep).isWithin(1e-9).of(-PI)
        assertThat(CallFramePathOp.Arc(0.0, 0.0, 1.0, 0.0, -PI / 2, true).sweep).isWithin(1e-9).of(-PI / 2)
    }

    @Test
    fun `un arc d un tour complet reste un tour complet`() {
        assertThat(CallFramePathOp.Arc(0.0, 0.0, 1.0, 0.0, 2 * PI, false).sweep).isWithin(1e-9).of(2 * PI)
    }

    @Test
    fun `un rectangle pose dans un repere tourne devient un polygone ferme`() {
        val ops = buildCallFramePath(CallFrameTurn(10.0, 20.0, 0.0)) { addRect(CallFrameRect(0.0, 0.0, 4.0, 2.0)) }
        assertThat(ops).containsExactly(
            CallFramePathOp.MoveTo(10.0, 20.0),
            CallFramePathOp.LineTo(14.0, 20.0),
            CallFramePathOp.LineTo(14.0, 22.0),
            CallFramePathOp.LineTo(10.0, 22.0),
            CallFramePathOp.Close,
        ).inOrder()
    }

    @Test
    fun `la rotation d un quart de tour envoie x sur y`() {
        val ops = buildCallFramePath(CallFrameTurn(0.0, 0.0, PI / 2)) { moveTo(1.0, 0.0) }
        val move = ops.single() as CallFramePathOp.MoveTo
        assertThat(move.x).isWithin(1e-9).of(0.0)
        assertThat(move.y).isWithin(1e-9).of(1.0)
    }

    @Test
    fun `un rayon d arrondi trop grand est ramene a la moitie du petit cote`() {
        val op = buildCallFramePath { addRoundRect(CallFrameRect(0.0, 0.0, 40.0, 10.0), 99.0) }.single() as CallFramePathOp.AddRoundRect
        assertThat(op.radius).isEqualTo(5.0)
    }

    @Test
    fun `un rayon nul ou une surface nulle ne tracent pas de coin arrondi`() {
        assertThat(buildCallFramePath { addRoundRect(CallFrameRect(0.0, 0.0, 0.0, 10.0), 3.0) }).isEmpty()
        assertThat(buildCallFramePath { addRoundRect(CallFrameRect(0.0, 0.0, 10.0, 10.0), 0.0) })
            .containsExactly(CallFramePathOp.AddRect(CallFrameRect(0.0, 0.0, 10.0, 10.0)))
    }

    @Test
    fun `un cercle de rayon nul ne trace rien`() {
        assertThat(buildCallFramePath { addCircle(1.0, 1.0, 0.0) }).isEmpty()
    }
}
