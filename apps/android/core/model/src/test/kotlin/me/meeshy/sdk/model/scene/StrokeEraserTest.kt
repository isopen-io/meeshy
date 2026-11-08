package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.StoryDrawingStrokePoint
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class StrokeEraserTest {

    private fun stroke(id: String, y: Double) = StoryDrawingStroke(
        id = id,
        points = listOf(StoryDrawingStrokePoint(100.0, y), StoryDrawingStrokePoint(500.0, y)),
        colorHex = "FFFFFF",
        width = 10.0,
    )

    @Test
    fun `a stroke grazed by the gesture is removed, the others stay`() {
        val strokes = listOf(stroke("a", 100.0), stroke("b", 900.0))

        val kept = StrokeEraser.survivors(strokes, listOf(StrokePoint(300.0, 120.0)))

        assertThat(kept.map { it.id }).containsExactly("b")
    }

    @Test
    fun `a gesture between two samples still erases through the segment`() {
        val kept = StrokeEraser.survivors(listOf(stroke("a", 100.0)), listOf(StrokePoint(300.0, 110.0)))

        assertThat(kept).isEmpty()
    }

    @Test
    fun `a gesture that misses everything returns the same list`() {
        val strokes = listOf(stroke("a", 100.0))

        assertThat(StrokeEraser.survivors(strokes, listOf(StrokePoint(300.0, 1000.0)))).isSameInstanceAs(strokes)
        assertThat(StrokeEraser.survivors(strokes, emptyList())).isSameInstanceAs(strokes)
    }
}
