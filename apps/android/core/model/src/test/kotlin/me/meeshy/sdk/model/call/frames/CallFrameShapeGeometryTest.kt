package me.meeshy.sdk.model.call.frames

import com.google.common.truth.Truth.assertThat
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import org.junit.Test

class CallFrameShapeGeometryTest {

    private val cell = CallFrameRect(10.0, 20.0, 120.0, 160.0)

    private fun points(ops: List<CallFramePathOp>): List<Pair<Double, Double>> = ops.flatMap { op ->
        when (op) {
            is CallFramePathOp.MoveTo -> listOf(op.x to op.y)
            is CallFramePathOp.LineTo -> listOf(op.x to op.y)
            is CallFramePathOp.QuadTo -> listOf(op.x to op.y)
            is CallFramePathOp.CubicTo -> listOf(op.x to op.y)
            is CallFramePathOp.Arc -> (0..16).map { step ->
                val angle = op.start + op.sweep * step / 16
                (op.cx + op.radius * cos(angle)) to (op.cy + op.radius * sin(angle))
            }
            is CallFramePathOp.AddRect -> corners(op.rect)
            is CallFramePathOp.AddRoundRect -> corners(op.rect)
            is CallFramePathOp.AddOval -> corners(op.rect)
            CallFramePathOp.Close -> emptyList()
        }
    }

    private fun corners(r: CallFrameRect) = listOf(r.minX to r.minY, r.maxX to r.maxY)

    @Test
    fun `les quinze formes tracent un contour non vide qui reste dans la case`() {
        CallFrameSlotShape.entries.forEach { shape ->
            val ops = CallFrameShapeGeometry.slotPath(shape, cell, null, 3)
            assertThat(ops).isNotEmpty()
            val pts = points(ops)
            val slack = 0.05 * cell.width
            assertThat(pts.minOf { it.first }).isAtLeast(cell.minX - slack)
            assertThat(pts.maxOf { it.first }).isAtMost(cell.maxX + slack)
            assertThat(pts.minOf { it.second }).isAtLeast(cell.minY - slack)
            assertThat(pts.maxOf { it.second }).isAtMost(cell.maxY + slack)
        }
    }

    @Test
    fun `il y a exactement quinze formes de case`() {
        assertThat(CallFrameSlotShape.entries).hasSize(15)
    }

    @Test
    fun `une case sans surface se trace en rectangle plutot que de disparaitre`() {
        val ops = CallFrameShapeGeometry.slotPath(CallFrameSlotShape.STAR, CallFrameRect(0.0, 0.0, 0.0, 50.0), null, 0)
        assertThat(ops).containsExactly(CallFramePathOp.AddRect(CallFrameRect(0.0, 0.0, 0.0, 50.0)))
    }

    @Test
    fun `le cercle prend le petit cote et reste centre`() {
        val op = CallFrameShapeGeometry.slotPath(CallFrameSlotShape.CIRCLE, cell, null, 0).single() as CallFramePathOp.AddOval
        assertThat(op.rect.width).isEqualTo(120.0)
        assertThat(op.rect.height).isEqualTo(120.0)
        assertThat(op.rect.midX).isEqualTo(cell.midX)
        assertThat(op.rect.midY).isEqualTo(cell.midY)
    }

    @Test
    fun `la forme arrondie suit le rayon du cadre sinon 8 pour cent du petit cote`() {
        val default = CallFrameShapeGeometry.slotPath(CallFrameSlotShape.ROUND, cell, null, 0).single() as CallFramePathOp.AddRoundRect
        val custom = CallFrameShapeGeometry.slotPath(CallFrameSlotShape.ROUND, cell, 0.2, 0).single() as CallFramePathOp.AddRoundRect
        assertThat(default.radius).isWithin(1e-9).of(0.08 * 120)
        assertThat(custom.radius).isWithin(1e-9).of(0.2 * 120)
    }

    @Test
    fun `l hexagone a six sommets et l etoile dix`() {
        val hex = CallFrameShapeGeometry.slotPath(CallFrameSlotShape.HEX, cell, null, 0)
        val star = CallFrameShapeGeometry.slotPath(CallFrameSlotShape.STAR, cell, null, 0)
        assertThat(hex.filterIsInstance<CallFramePathOp.LineTo>()).hasSize(5)
        assertThat(star.filterIsInstance<CallFramePathOp.LineTo>()).hasSize(9)
    }

    @Test
    fun `le galet et le bord dechire sont deterministes pour une meme case et varient d une case a l autre`() {
        fun blob(seed: Int) = CallFrameShapeGeometry.slotPath(CallFrameSlotShape.BLOB, cell, null, seed)
        fun torn(seed: Int) = CallFrameShapeGeometry.slotPath(CallFrameSlotShape.TORN, cell, null, seed)
        assertThat(blob(2)).isEqualTo(blob(2))
        assertThat(blob(2)).isNotEqualTo(blob(5))
        assertThat(torn(2)).isEqualTo(torn(2))
        assertThat(torn(2)).isNotEqualTo(torn(5))
    }

    @Test
    fun `le bord dechire garde ses coins intacts et ne ronge que vers l interieur`() {
        val pts = CallFrameShapeGeometry.tornPoints(cell, 4)
        assertThat(pts.first()).isEqualTo(cell.minX to cell.minY)
        assertThat(pts.all { it.first in cell.minX..cell.maxX && it.second in cell.minY..cell.maxY }).isTrue()
    }

    @Test
    fun `le polaroid est une photo carree avec une marge de pied epaisse`() {
        val window = CallFrameShapeGeometry.polaroidWindow(cell)
        assertThat(window.width).isEqualTo(window.height)
        assertThat(cell.maxY - window.maxY).isAtLeast(cell.height * 0.2 - 1e-9)
    }

    @Test
    fun `le medaillon est un ovale vertical trois quatre`() {
        val medallion = CallFrameShapeGeometry.medallionRect(cell)
        assertThat(medallion.width / medallion.height).isWithin(1e-9).of(0.75)
        assertThat(medallion.midX).isWithin(1e-9).of(cell.midX)
    }

    @Test
    fun `l arche remonte son arc par le haut`() {
        val arc = CallFrameShapeGeometry.slotPath(CallFrameSlotShape.ARCH, cell, null, 0).filterIsInstance<CallFramePathOp.Arc>().single()
        assertThat(arc.sweep).isWithin(1e-9).of(PI)
        assertThat(arc.start).isEqualTo(PI)
    }

    @Test
    fun `le rectangle utile d une forme reste dans la case`() {
        CallFrameSlotShape.entries.forEach { shape ->
            val inner = CallFrameShapeGeometry.shapeInnerRect(shape, cell)
            assertThat(inner.width).isAtMost(cell.width + 1e-9)
            assertThat(inner.height).isAtMost(cell.height + 1e-9)
            assertThat(inner.minX).isAtLeast(cell.minX - 1e-9)
            assertThat(inner.maxX).isAtMost(cell.maxX + 1e-9)
        }
    }
}
