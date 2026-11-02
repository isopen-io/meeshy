package me.meeshy.sdk.model.call.frames

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallFramePatternGeometryTest {

    private fun plan(kind: CallFramePatternKind, width: Double, height: Double, unit: Double) =
        CallFramePatternGeometry.plan(kind, width, height, unit)

    @Test
    fun `les quatorze motifs dessinent quelque chose`() {
        assertThat(CallFramePatternKind.entries).hasSize(14)
        CallFramePatternKind.entries.forEach { kind ->
            val p = plan(kind, 1080.0, 1920.0, 1080.0)
            assertThat(p.fill.size + p.stroke.size).isGreaterThan(0)
        }
    }

    @Test
    fun `un motif trace est un trait avec une epaisseur et un motif rempli n en a pas besoin`() {
        listOf(CallFramePatternKind.GRID, CallFramePatternKind.WAVES, CallFramePatternKind.CIRCUIT).forEach {
            val p = plan(it, 1080.0, 1920.0, 1080.0)
            assertThat(p.stroke).isNotEmpty()
            assertThat(p.lineWidth).isGreaterThan(0.0)
        }
        assertThat(plan(CallFramePatternKind.DOTS, 1080.0, 1920.0, 1080.0).stroke).isEmpty()
    }

    @Test
    fun `une vignette et une capture comptent les memes pieces du motif`() {
        val scaleFree = listOf(
            CallFramePatternKind.DOTS, CallFramePatternKind.STRIPES, CallFramePatternKind.GRID,
            CallFramePatternKind.CHECKER, CallFramePatternKind.STARS, CallFramePatternKind.CONFETTI,
            CallFramePatternKind.SUNBURST, CallFramePatternKind.WAVES, CallFramePatternKind.CIRCUIT,
            CallFramePatternKind.DAMASK, CallFramePatternKind.HEARTS,
        )
        scaleFree.forEach { kind ->
            val small = plan(kind, 108.0, 192.0, 108.0)
            val large = plan(kind, 1080.0, 1920.0, 1080.0)
            assertThat(small.fill.size).isEqualTo(large.fill.size)
            assertThat(small.stroke.size).isEqualTo(large.stroke.size)
        }
    }

    @Test
    fun `les coordonnees d un motif suivent la taille de la toile a l identique`() {
        val small = plan(CallFramePatternKind.STARS, 108.0, 192.0, 108.0).fill.filterIsInstance<CallFramePathOp.MoveTo>()
        val large = plan(CallFramePatternKind.STARS, 1080.0, 1920.0, 1080.0).fill.filterIsInstance<CallFramePathOp.MoveTo>()
        small.zip(large).forEach { (a, b) ->
            assertThat(b.x).isWithin(1e-6).of(a.x * 10)
            assertThat(b.y).isWithin(1e-6).of(a.y * 10)
        }
    }

    @Test
    fun `le hasard d un motif est le meme a chaque image`() {
        assertThat(plan(CallFramePatternKind.GRAIN, 540.0, 960.0, 540.0)).isEqualTo(plan(CallFramePatternKind.GRAIN, 540.0, 960.0, 540.0))
    }

    @Test
    fun `le grain pose deux mille six cents grains`() {
        assertThat(plan(CallFramePatternKind.GRAIN, 540.0, 960.0, 540.0).fill).hasSize(2600)
    }

    @Test
    fun `les rayons du soleil sont dix huit`() {
        assertThat(plan(CallFramePatternKind.SUNBURST, 540.0, 960.0, 540.0).fill.filterIsInstance<CallFramePathOp.Close>()).hasSize(18)
    }
}
