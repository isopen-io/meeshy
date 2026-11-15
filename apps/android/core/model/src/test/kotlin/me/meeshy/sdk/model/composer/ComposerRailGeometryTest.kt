package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerRailGeometryTest {
    private val g = ComposerRailGeometry

    @Test
    fun `scene width subtracts the inset on both sides and never goes negative`() {
        assertThat(g.sceneWidth(402f, railsShown = true)).isEqualTo(382f)
        assertThat(g.sceneWidth(402f, railsShown = false)).isEqualTo(374f)
        assertThat(g.sceneWidth(10f, railsShown = true)).isEqualTo(0f)
    }

    @Test
    fun `roomy screens take the wide edge margin and a description inset bounded by the card`() {
        assertThat(g.edgeMargin(roomy = true)).isEqualTo(24f)
        assertThat(g.edgeMargin(roomy = false)).isEqualTo(10f)
        assertThat(g.descriptionInset(roomy = false, cardLeading = 300f)).isEqualTo(g.LANE)
        assertThat(g.descriptionInset(roomy = true, cardLeading = 300f)).isEqualTo(300f)
        assertThat(g.descriptionInset(roomy = true, cardLeading = 20f)).isEqualTo(g.LANE)
        assertThat(g.descriptionInset(roomy = true, cardLeading = Float.NaN)).isEqualTo(g.LANE)
        assertThat(g.ROOMY_PANEL_TRAILING).isEqualTo(76f)
    }

    @Test
    fun `lane and rail respect the 44 dp hit target`() {
        assertThat(g.RAIL_WIDTH).isAtLeast(44f)
        assertThat(g.LANE).isEqualTo(62f)
        assertThat(g.FLOATING_BOTTOM_INSET).isEqualTo(52f)
    }

    @Test
    fun `row width and overflow are arithmetic`() {
        assertThat(g.rowWidth(9)).isEqualTo(476f)
        assertThat(g.rowWidth(0)).isEqualTo(0f)
        assertThat(g.rowOverflow(9, available = 373f)).isEqualTo(103f)
        assertThat(g.rowOverflow(2, available = 373f)).isEqualTo(0f)
        assertThat(g.availableRowWidth(393f)).isEqualTo(373f)
    }

    @Test
    fun `column height and history reserve`() {
        assertThat(g.columnHeight(15)).isEqualTo(688f)
        assertThat(g.columnHeight(0)).isEqualTo(0f)
        assertThat(g.columnHeight(3, withSpring = true)).isEqualTo(3 * 44f + 4 * 2f)
        assertThat(g.historyReserve(undo = true, redo = false)).isEqualTo(46f)
        assertThat(g.historyReserve(undo = false, redo = false)).isEqualTo(0f)
    }

    @Test
    fun `trailing band rests when unmeasured and starts at the card top otherwise`() {
        val rest = ComposerRailBand(8f, 52f)
        assertThat(g.trailingRailBand(ComposerRect(0f, 0f, isNull = true), ComposerRect(0f, 0f), 100f)).isEqualTo(rest)
        val zone = ComposerRect(0f, 800f)
        assertThat(g.trailingRailBand(zone, ComposerRect(60f, 700f), 300f).top).isEqualTo(60f)
        assertThat(g.trailingRailBand(zone, ComposerRect(790f, 795f), 300f)).isEqualTo(rest)
    }
}
