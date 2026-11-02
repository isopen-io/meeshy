package me.meeshy.sdk.model.call.frames

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallFrameRenderKitTest {

    @Test
    fun `le hasard d un cadre est deterministe et dans l intervalle 0 1`() {
        val draws = (0 until 200).map { CallFrameRenderKit.rand(301.0, it.toDouble()) }
        assertThat(draws).isEqualTo((0 until 200).map { CallFrameRenderKit.rand(301.0, it.toDouble()) })
        assertThat(draws.all { it in 0.0..1.0 }).isTrue()
        assertThat(draws.toSet().size).isGreaterThan(150)
    }

    @Test
    fun `une couleur illisible tombe sur le noir et l alpha se multiplie`() {
        assertThat(CallFrameRenderKit.color("nope")).isEqualTo(CallFrameColor(0.0, 0.0, 0.0, 1.0))
        assertThat(CallFrameRenderKit.color("#FFFFFF80", 0.5).alpha).isWithin(1e-9).of(128 / 255.0 * 0.5)
        assertThat(CallFrameRenderKit.tint("#FFFFFF", 4.0).alpha).isEqualTo(1.0)
        assertThat(CallFrameRenderKit.tint("#FFFFFF", -1.0).alpha).isEqualTo(0.0)
    }

    @Test
    fun `le melange va de la premiere couleur a la seconde`() {
        val half = CallFrameRenderKit.mix("#000000", "#FFFFFF", 0.5)
        assertThat(half.red).isWithin(1e-9).of(0.5)
        assertThat(CallFrameRenderKit.mix("#112233", "#FFFFFF", 0.0)).isEqualTo(CallFrameRenderKit.color("#112233"))
    }

    @Test
    fun `la luminance percue place le blanc a un et le noir a zero`() {
        assertThat(CallFrameRenderKit.perceived("#FFFFFF")).isWithin(1e-9).of(1.0)
        assertThat(CallFrameRenderKit.perceived("#000000")).isEqualTo(0.0)
        assertThat(CallFrameRenderKit.perceived("n'importe quoi")).isEqualTo(0.0)
    }

    @Test
    fun `la densite pondere le nombre sans jamais descendre sous un`() {
        assertThat(CallFrameRenderKit.count(10.0, CallFrameDensity.LOW)).isEqualTo(5)
        assertThat(CallFrameRenderKit.count(10.0, CallFrameDensity.MID)).isEqualTo(10)
        assertThat(CallFrameRenderKit.count(10.0, CallFrameDensity.HIGH)).isEqualTo(18)
        assertThat(CallFrameRenderKit.count(0.2, CallFrameDensity.LOW)).isEqualTo(1)
    }

    @Test
    fun `le reseau decale une rangee sur deux d un demi pas`() {
        val lattice = CallFrameRenderKit.lattice(100.0, 100.0, 20.0, stagger = true)
        val first = lattice.first { it.row == 0 && it.col == 0 }
        val second = lattice.first { it.row == 1 && it.col == 0 }
        assertThat(second.x - first.x).isWithin(1e-9).of(10.0)
        assertThat(lattice.size).isEqualTo(7 * 7)
        assertThat(CallFrameRenderKit.lattice(100.0, 100.0, 0.0, stagger = false)).isEmpty()
    }

    @Test
    fun `le perimetre repartit des points sur les quatre cotes`() {
        val points = CallFrameRenderKit.perimeter(CallFrameRect(0.0, 0.0, 100.0, 50.0), 10.0)
        assertThat(points.map { it.side }.toSet()).containsExactly(0, 1, 2, 3)
        assertThat(points.count { it.side == 0 }).isEqualTo(10)
        assertThat(points.count { it.side == 1 }).isEqualTo(5)
        assertThat(points.first()).isEqualTo(CallFramePerimeterPoint(0.0, 0.0, 0))
    }

    @Test
    fun `les coins entrent dans le rectangle`() {
        val corners = CallFrameRenderKit.corners(CallFrameRect(0.0, 0.0, 10.0, 20.0))
        assertThat(corners.map { it.sx to it.sy }).containsExactly(1.0 to 1.0, -1.0 to 1.0, -1.0 to -1.0, 1.0 to -1.0).inOrder()
    }

    @Test
    fun `la marge ne rend jamais une surface negative`() {
        val inset = CallFrameRenderKit.inset(CallFrameRect(0.0, 0.0, 10.0, 10.0), 8.0)
        assertThat(inset.width).isEqualTo(0.0)
        assertThat(inset.height).isEqualTo(0.0)
    }

    @Test
    fun `une case tournee encombre plus qu une case droite`() {
        val straight = CallFrameSlotBox(CallFrameRect(0.0, 0.0, 100.0, 100.0), CallFrameSlotShape.RECT, 0.0, 0)
        val turned = straight.copy(rotation = 9.0)
        assertThat(CallFrameRenderKit.footprint(straight)).isEqualTo(straight.rect)
        assertThat(CallFrameRenderKit.footprint(turned).width).isGreaterThan(100.0)
        assertThat(CallFrameRenderKit.footprint(turned.copy(rotation = -9.0))).isEqualTo(CallFrameRenderKit.footprint(turned))
    }

    @Test
    fun `le visage occupe la case entiere ou l interieur de la carte`() {
        val box = CallFrameRect(0.0, 0.0, 100.0, 200.0)
        assertThat(CallFrameRenderKit.photoRect(box, null)).isEqualTo(box)
        val photo = CallFrameRenderKit.photoRect(box, CallFrameCard("#FFFFFF", pad = 0.1, foot = 0.2))
        assertThat(photo).isEqualTo(CallFrameRect(10.0, 10.0, 80.0, 200.0 - 20.0 - 20.0))
    }

    @Test
    fun `une image remplit la cible en etant rognee et centree sans deformation`() {
        val target = CallFrameRect(0.0, 0.0, 100.0, 100.0)
        val wide = CallFrameRenderKit.aspectFill(200.0, 100.0, target)!!
        assertThat(wide.height).isEqualTo(100.0)
        assertThat(wide.width).isEqualTo(200.0)
        assertThat(wide.midX).isEqualTo(50.0)
        val tall = CallFrameRenderKit.aspectFill(50.0, 100.0, target)!!
        assertThat(tall.width).isEqualTo(100.0)
        assertThat(tall.height).isEqualTo(200.0)
        assertThat(tall.midY).isEqualTo(50.0)
    }

    @Test
    fun `une image vide ou une cible vide ne dessinent rien`() {
        val target = CallFrameRect(0.0, 0.0, 100.0, 100.0)
        assertThat(CallFrameRenderKit.aspectFill(0.0, 10.0, target)).isNull()
        assertThat(CallFrameRenderKit.aspectFill(10.0, 10.0, CallFrameRect(0.0, 0.0, 0.0, 5.0))).isNull()
    }
}
