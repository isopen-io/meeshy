package me.meeshy.ui.appearance

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ServedProfileDecorItem
import me.meeshy.sdk.model.appearance.AvatarRingDesign
import me.meeshy.sdk.model.appearance.AvatarRingGeometry
import me.meeshy.sdk.model.appearance.AvatarRingStroke
import me.meeshy.sdk.model.appearance.RingStrokeLayer
import me.meeshy.sdk.model.appearance.RingStrokeStyle
import org.junit.Test

class AvatarRingViewSpecTest {

    private fun design(style: RingStrokeStyle, colors: List<String> = listOf("#FF0000", "#0000FF")) =
        AvatarRingDesign(key = "r", stroke = AvatarRingStroke(style = style, width = 0.04, colors = colors))

    private fun layersOf(style: RingStrokeStyle) = AvatarRingPlan(design(style)).layers

    @Test
    fun `solid se peint en un cercle plein`() {
        assertThat(layersOf(RingStrokeStyle.SOLID).single()).isInstanceOf(RingStrokeLayer.Circle::class.java)
    }

    @Test
    fun `double se peint en deux cercles, le second a l'interieur`() {
        val layers = layersOf(RingStrokeStyle.DOUBLE).filterIsInstance<RingStrokeLayer.Circle>()
        assertThat(layers).hasSize(2)
        assertThat(layers[1].radius).isLessThan(layers[0].radius)
    }

    @Test
    fun `pointille se peint en vingt-huit points`() {
        val dots = layersOf(RingStrokeStyle.DOTTED).single() as RingStrokeLayer.Dots
        assertThat(dots.count).isEqualTo(AvatarRingGeometry.DOT_COUNT)
    }

    @Test
    fun `tirets se peint en trente-six tirets`() {
        val dashes = layersOf(RingStrokeStyle.DASHED).single() as RingStrokeLayer.Dashes
        assertThat(dashes.count).isEqualTo(AvatarRingGeometry.DASH_COUNT)
    }

    @Test
    fun `degrade se peint en vingt-quatre arcs`() {
        val sweep = layersOf(RingStrokeStyle.GRADIENT).single() as RingStrokeLayer.Sweep
        assertThat(sweep.arcs).hasSize(AvatarRingGeometry.ARC_COUNT)
    }

    @Test
    fun `none ne trace aucun trait de base et un contour sans ornement n'a rien d'autre`() {
        val plan = AvatarRingPlan(design(RingStrokeStyle.NONE))
        assertThat(plan.layers).isEmpty()
        assertThat(plan.ornaments).isEmpty()
    }

    @Test
    fun `l'absence de catalogue ne donne aucun contour`() {
        val item = ServedProfileDecorItem(pack = "contours-essentiels", item = "filet")
        assertThat(AvatarRingResolver.Absent.resolve(item)).isNull()
        assertThat(AvatarRingResolver.Absent.resolve(null)).isNull()
    }
}
