package me.meeshy.sdk.model.call.frames

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallFrameBorderGeometryTest {

    private fun border(kind: CallFrameBorderKind, color: String = "#C9A24B") = CallFrameBorder(kind, color, 0.01, 0.02)

    private fun plan(kind: CallFrameBorderKind, width: Double = 1080.0, height: Double = 1920.0, color: String = "#C9A24B") =
        CallFrameBorderGeometry.plan(border(kind, color), width, height, minOf(width, height))

    private fun shapes(steps: List<CallFrameBorderStep>) = steps.filterIsInstance<CallFrameBorderStep.Shape>()

    @Test
    fun `les quatorze bordures peignent au moins une etape`() {
        assertThat(CallFrameBorderKind.entries).hasSize(14)
        CallFrameBorderKind.entries.forEach { assertThat(plan(it)).isNotEmpty() }
    }

    @Test
    fun `le trait fin est un seul trait du rectangle interieur au bord`() {
        val step = shapes(plan(CallFrameBorderKind.HAIRLINE)).single()
        assertThat(step.style).isEqualTo(CallFramePaintStyle.STROKE)
        val rect = (step.ops.single() as CallFramePathOp.AddRect).rect
        assertThat(rect.minX).isWithin(1e-9).of(1080 * 0.02 + step.width / 2)
    }

    @Test
    fun `la bordure s epaissit avec la toile mais ne descend jamais sous trois quarts de pixel`() {
        assertThat(shapes(plan(CallFrameBorderKind.HAIRLINE, 108.0, 192.0)).single().width).isAtLeast(0.75)
        assertThat(shapes(plan(CallFrameBorderKind.HAIRLINE, 1080.0, 1920.0)).single().width).isWithin(1e-9).of(10.8)
    }

    @Test
    fun `le double filet porte un second trait deux fois plus fin`() {
        val steps = shapes(plan(CallFrameBorderKind.DOUBLE))
        assertThat(steps).hasSize(2)
        assertThat(steps[1].width).isWithin(1e-9).of(steps[0].width * 0.5)
    }

    @Test
    fun `le neon trace deux traits lumineux dont le coeur est eclairci`() {
        val steps = shapes(plan(CallFrameBorderKind.NEON, color = "#FF00AA"))
        assertThat(steps).hasSize(2)
        assertThat(steps.all { it.shadow != null }).isTrue()
        assertThat(steps[1].color.green).isGreaterThan(steps[0].color.green)
    }

    @Test
    fun `les bords dechire deuil et polaroid se remplissent en pair impair`() {
        listOf(CallFrameBorderKind.TORN, CallFrameBorderKind.MOURNING, CallFrameBorderKind.POLAROID).forEach {
            assertThat(shapes(plan(it)).first().style).isEqualTo(CallFramePaintStyle.FILL_EVEN_ODD)
        }
    }

    @Test
    fun `les ampoules posent un halo puis une ampoule par point du perimetre`() {
        val steps = plan(CallFrameBorderKind.BULBS)
        val glows = steps.filterIsInstance<CallFrameBorderStep.Glow>()
        val bulbs = steps.filterIsInstance<CallFrameBorderStep.Bulb>()
        assertThat(glows).isNotEmpty()
        assertThat(glows).hasSize(bulbs.size)
        assertThat(steps.first()).isInstanceOf(CallFrameBorderStep.Glow::class.java)
    }

    @Test
    fun `la pellicule met ses bandes sur les cotes en portrait et en haut et en bas en paysage`() {
        fun strips(width: Double, height: Double) =
            (shapes(plan(CallFrameBorderKind.FILMSTRIP, width, height)).first().ops.filterIsInstance<CallFramePathOp.AddRect>()).map { it.rect }
        val portrait = strips(1080.0, 1920.0)
        val landscape = strips(1920.0, 1080.0)
        assertThat(portrait.all { it.height > it.width }).isTrue()
        assertThat(landscape.all { it.width > it.height }).isTrue()
    }

    @Test
    fun `les trous de la pellicule s eclaircissent sur une bande sombre et s assombrissent sur une bande claire`() {
        val onDark = shapes(plan(CallFrameBorderKind.FILMSTRIP, color = "#101010"))[1].color
        val onLight = shapes(plan(CallFrameBorderKind.FILMSTRIP, color = "#F0F0F0"))[1].color
        assertThat(onDark.red).isGreaterThan(0.9)
        assertThat(onLight.red).isLessThan(0.1)
    }

    @Test
    fun `le billet pointille sa ligne de dechirure`() {
        val steps = shapes(plan(CallFrameBorderKind.TICKET))
        assertThat(steps.first().dash).isNull()
        assertThat(steps.last().dash).isNotNull()
        assertThat(steps.last().color.alpha).isWithin(1e-9).of(0.35)
    }

    @Test
    fun `une bordure est stable d une image a l autre`() {
        CallFrameBorderKind.entries.forEach { assertThat(plan(it)).isEqualTo(plan(it)) }
    }

    @Test
    fun `les feuilles de la vigne sont fermees et tournees`() {
        val leaves = shapes(plan(CallFrameBorderKind.VINES)).last()
        assertThat(leaves.style).isEqualTo(CallFramePaintStyle.FILL)
        assertThat(leaves.ops.filterIsInstance<CallFramePathOp.QuadTo>()).isNotEmpty()
    }

    @Test
    fun `une bande est deux rectangles emboites`() {
        val band = CallFrameBorderGeometry.band(CallFrameRect(0.0, 0.0, 10.0, 10.0), CallFrameRect(1.0, 1.0, 8.0, 8.0))
        assertThat(band).hasSize(2)
    }
}
