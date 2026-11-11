package me.meeshy.sdk.model.call.group

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GroupCallStageGeometryTest {
    private val ids = listOf("a", "b", "m")

    private fun rects(focus: GroupCallStageFocus, w: Float = 400f, h: Float = 800f, full: Boolean = false, rtl: Boolean = false) =
        GroupCallStageGeometry.rects(ids, focus, w, h, full, rtl)

    @Test
    fun `the grid gives every person a cell, in arrival order, 8 dp apart`() {
        val grid = rects(GroupCallStageFocus.Grid)
        assertThat(grid.keys).containsExactly("a", "b", "m")
        assertThat(grid.getValue("a")).isEqualTo(CallStageRect(0f, 0f, 196f, 396f))
        assertThat(grid.getValue("b")).isEqualTo(CallStageRect(204f, 0f, 196f, 396f))
        assertThat(grid.getValue("m")).isEqualTo(CallStageRect(0f, 404f, 196f, 396f))
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
        assertThat(GroupCallStageGeometry.rects(emptyList(), GroupCallStageFocus.Grid, 400f, 800f, false, false)).isEmpty()
        assertThat(GroupCallStageGeometry.rects(ids, GroupCallStageFocus.Grid, 0f, 800f, false, false)).isEmpty()
    }
}
