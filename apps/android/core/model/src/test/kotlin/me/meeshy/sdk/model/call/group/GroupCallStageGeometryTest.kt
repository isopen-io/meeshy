package me.meeshy.sdk.model.call.group

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GroupCallStageGeometryTest {
    private val ids = listOf("a", "b", "m")

    private fun rects(focus: GroupCallStageFocus, w: Float = 400f, h: Float = 800f, full: Boolean = false, rtl: Boolean = false, compact: Boolean = false) =
        GroupCallStageGeometry.rects(ids, focus, w, h, full, rtl, compact)

    @Test
    fun `the grid gives every person a cell, in arrival order, 8 dp apart`() {
        val grid = rects(GroupCallStageFocus.Grid)
        assertThat(grid.keys).containsExactly("a", "b", "m")
        assertThat(grid.getValue("a")).isEqualTo(CallStageRect(0f, 0f, 196f, 396f))
        assertThat(grid.getValue("b")).isEqualTo(CallStageRect(204f, 0f, 196f, 396f))
        assertThat(grid.getValue("m")).isEqualTo(CallStageRect(0f, 404f, 196f, 396f))
    }

    private val four = listOf("a", "b", "c", "m")

    @Test
    fun `L4,1 - four people share one row in a landscape window of compact height`() {
        val grid = GroupCallStageGeometry.rects(four, GroupCallStageFocus.Grid, 800f, 390f, false, false, true)
        assertThat(grid.values.map { it.top }.toSet()).containsExactly(0f)
        assertThat(grid.getValue("a")).isEqualTo(CallStageRect(0f, 0f, 194f, 390f))
        assertThat(grid.getValue("m").left).isEqualTo(3 * 202f)
    }

    @Test
    fun `W2 - four people make a 2 by 2 on a wide window of ample height, edge to edge like iOS`() {
        val grid = GroupCallStageGeometry.rects(four, GroupCallStageFocus.Grid, 1280f, 800f, false, false, false)
        assertThat(grid.getValue("a")).isEqualTo(CallStageRect(0f, 0f, 636f, 396f))
        assertThat(grid.getValue("b")).isEqualTo(CallStageRect(644f, 0f, 636f, 396f))
        assertThat(grid.getValue("c")).isEqualTo(CallStageRect(0f, 404f, 636f, 396f))
    }

    @Test
    fun `W2 - the 2 by 2 mirrors in right-to-left`() {
        val rtl = GroupCallStageGeometry.rects(four, GroupCallStageFocus.Grid, 1280f, 800f, false, true, false)
        assertThat(rtl.getValue("a").left).isEqualTo(644f)
        assertThat(rtl.getValue("b").left).isEqualTo(0f)
    }

    @Test
    fun `in portrait the featured tile fills the width and the others line up under it`() {
        val spotlight = rects(GroupCallStageFocus.Spotlight("b", isScreenShare = false))
        assertThat(spotlight.getValue("b")).isEqualTo(CallStageRect(0f, 0f, 400f, 800f - 8f - 124f))
        assertThat(spotlight.getValue("a").left).isEqualTo(0f)
        assertThat(spotlight.getValue("m").left).isEqualTo(92f)
        assertThat(spotlight.getValue("a").top).isEqualTo(800f - 124f + 6f)
        assertThat(spotlight.getValue("a").height).isEqualTo(112f)
    }

    @Test
    fun `in landscape the others stack in a column on the right of the featured tile`() {
        val spotlight = rects(GroupCallStageFocus.Spotlight("b", isScreenShare = false), w = 800f, h = 400f)
        assertThat(spotlight.getValue("b")).isEqualTo(CallStageRect(0f, 0f, 800f - 8f - 128f, 400f))
        assertThat(spotlight.getValue("a").left).isEqualTo(664f + 8f + 22f)
        assertThat(spotlight.getValue("m").top).isEqualTo(6f + 120f)
    }

    @Test
    fun `full screen keeps the featured tile alone, the others have no place`() {
        val spotlight = rects(GroupCallStageFocus.Spotlight("b", isScreenShare = false), full = true)
        assertThat(spotlight.keys).containsExactly("b")
        assertThat(spotlight.getValue("b")).isEqualTo(CallStageRect(0f, 0f, 400f, 800f))
    }

    @Test
    fun `right-to-left mirrors every rectangle across the stage`() {
        val ltr = rects(GroupCallStageFocus.Grid)
        val rtl = rects(GroupCallStageFocus.Grid, rtl = true)
        assertThat(rtl.getValue("a").left).isEqualTo(400f - ltr.getValue("a").left - 196f)
        assertThat(rtl.getValue("a").top).isEqualTo(ltr.getValue("a").top)
    }

    @Test
    fun `an empty or zero-sized stage places nobody`() {
        assertThat(GroupCallStageGeometry.rects(emptyList(), GroupCallStageFocus.Grid, 400f, 800f, false, false, false)).isEmpty()
        assertThat(GroupCallStageGeometry.rects(ids, GroupCallStageFocus.Grid, 0f, 800f, false, false, false)).isEmpty()
    }
    @Test
    fun `an interrupted move starts again from where the tile IS, not from where it was going (P14_10)`() {
        val from = CallStageRect(0f, 0f, 100f, 200f)
        val to = CallStageRect(200f, 400f, 300f, 400f)
        assertThat(GroupCallStageGeometry.between(from, to, 0.5f)).isEqualTo(CallStageRect(100f, 200f, 200f, 300f))
        assertThat(GroupCallStageGeometry.between(from, to, 0f)).isEqualTo(from)
    }

    @Test
    fun `a finished move, or one without a start, is at its destination`() {
        val to = CallStageRect(10f, 20f, 30f, 40f)
        assertThat(GroupCallStageGeometry.between(CallStageRect(0f, 0f, 1f, 1f), to, 1f)).isEqualTo(to)
        assertThat(GroupCallStageGeometry.between(null, to, 0.3f)).isEqualTo(to)
    }

    /** U2.10 — the strip of the others leaves by ITS edge of the screen, measured. */
    @Test
    fun `in portrait the strip top lands on the bottom edge of the window`() {
        val stage = CallStageRect(left = 12f, top = 120f, width = 366f, height = 500f)
        val travel = GroupCallStageGeometry.stripTravel(GroupCallFilmstrip.Bottom, stage, windowWidth = 390f, windowHeight = 844f, stripExtent = 112f, isRtl = false)
        assertThat(travel.dx).isEqualTo(0f)
        assertThat(stage.top + stage.height - 112f + travel.dy).isEqualTo(844f)
    }

    @Test
    fun `in landscape the column leaves by the right edge, and by the left one right to left`() {
        val stage = CallStageRect(left = 59f, top = 20f, width = 700f, height = 340f)
        val ltr = GroupCallStageGeometry.stripTravel(GroupCallFilmstrip.Trailing, stage, windowWidth = 844f, windowHeight = 390f, stripExtent = 128f, isRtl = false)
        assertThat(ltr.dy).isEqualTo(0f)
        assertThat(stage.left + stage.width - 128f + ltr.dx).isEqualTo(844f)
        val rtl = GroupCallStageGeometry.stripTravel(GroupCallFilmstrip.Trailing, stage, windowWidth = 844f, windowHeight = 390f, stripExtent = 128f, isRtl = true)
        assertThat(stage.left + 128f + rtl.dx).isEqualTo(0f)
    }

    @Test
    fun `a stage at the edge moves the strip by its own size, and an unmeasured stage still leaves the screen`() {
        val atEdge = CallStageRect(0f, 0f, 390f, 844f)
        assertThat(GroupCallStageGeometry.stripTravel(GroupCallFilmstrip.Bottom, atEdge, 390f, 844f, 112f, false).dy).isEqualTo(112f)
        val unmeasured = GroupCallStageGeometry.stripTravel(GroupCallFilmstrip.Bottom, null, 390f, 844f, 112f, false)
        assertThat(unmeasured.dy).isAtLeast(844f)
    }

    @Test
    fun `without a strip nothing travels`() {
        val travel = GroupCallStageGeometry.stripTravel(GroupCallFilmstrip.None, CallStageRect(0f, 0f, 1f, 1f), 390f, 844f, 112f, false)
        assertThat(travel.dx).isEqualTo(0f)
        assertThat(travel.dy).isEqualTo(0f)
    }
}
