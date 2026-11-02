package me.meeshy.sdk.model.reading.river

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Arithmétique pure des couloirs. Miroir de `RiverColumnLayoutTests.swift`. */
class RiverColumnLayoutTest {

    private fun layout(laneCount: Int, laneWidth: Double = 300.0, gutter: Double = 28.0) =
        RiverColumnLayout(laneWidth, gutter, laneCount)

    @Test
    fun `la largeur totale est le nombre de couloirs fois leur largeur, zero sans couloir`() {
        assertThat(layout(4).totalWidth).isEqualTo(1200.0)
        assertThat(layout(0).totalWidth).isEqualTo(0.0)
    }

    @Test
    fun `le rail passe au centre du couloir`() {
        val l = layout(3)
        assertThat(listOf(l.railX(0), l.railX(1), l.railX(2))).containsExactly(150.0, 450.0, 750.0).inOrder()
        assertThat(l.laneLeadingX(0)).isEqualTo(0.0)
        assertThat(l.laneLeadingX(2)).isEqualTo(600.0)
    }

    @Test
    fun `la largeur utile retranche la gouttiere deux fois et ne devient jamais negative`() {
        assertThat(layout(1).bubbleContentWidth).isEqualTo(244.0)
        assertThat(layout(1, laneWidth = 40.0).bubbleContentWidth).isAtLeast(0.0)
    }

    @Test
    fun `les valeurs par defaut des tokens retrouvent la maquette normative`() {
        val l = layout(2, RiverMetrics.Lane.WIDTH_REFERENCE, RiverMetrics.Lane.GUTTER)
        assertThat(l.railX(0)).isEqualTo(150.0)
        assertThat(l.railX(1)).isEqualTo(450.0)
        assertThat(l.totalWidth).isEqualTo(600.0)
    }

    @Test
    fun `le decalage amene le rail au centre du volet, borne entre la rive et le bord`() {
        val l = layout(6)
        assertThat(l.horizontalOffset(3, 402.0)).isEqualTo(1050.0 - 201.0)
        assertThat(l.horizontalOffset(0, 402.0)).isEqualTo(0.0)
        assertThat(l.horizontalOffset(5, 402.0)).isEqualTo(1800.0 - 402.0)
    }

    @Test
    fun `le decalage est nul quand tout tient dans le volet`() {
        assertThat(layout(1).horizontalOffset(0, 402.0)).isEqualTo(0.0)
    }
}
