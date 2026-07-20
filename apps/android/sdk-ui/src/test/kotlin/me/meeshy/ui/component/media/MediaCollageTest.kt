package me.meeshy.ui.component.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the adaptive multi-image collage solver. Drives the public
 * [MediaCollage.solve] and asserts the row/cell structure, the width/height weights,
 * the `+N` overflow, and the structural invariants that hold for every count.
 */
class MediaCollageTest {

    @Test
    fun `empty count yields no rows and is not single`() {
        val layout = MediaCollage.solve(0)
        assertThat(layout.rows).isEmpty()
        assertThat(layout.isEmpty).isTrue()
        assertThat(layout.isSingle).isFalse()
    }

    @Test
    fun `negative count is treated as empty`() {
        val layout = MediaCollage.solve(-3)
        assertThat(layout.rows).isEmpty()
        assertThat(layout.isSingle).isFalse()
    }

    @Test
    fun `single image is one full-bleed cell flagged single`() {
        val layout = MediaCollage.solve(1)
        assertThat(layout.isSingle).isTrue()
        assertThat(layout.isEmpty).isFalse()
        assertThat(layout.rows).hasSize(1)
        val row = layout.rows.single()
        assertThat(row.heightWeight).isWithin(TOL).of(1f)
        val cell = row.cells.single()
        assertThat(cell.index).isEqualTo(0)
        assertThat(cell.widthWeight).isWithin(TOL).of(1f)
        assertThat(cell.overflowCount).isEqualTo(0)
    }

    @Test
    fun `two images are one row of equal side-by-side cells`() {
        val layout = MediaCollage.solve(2)
        assertThat(layout.isSingle).isFalse()
        assertThat(layout.rows).hasSize(1)
        val cells = layout.rows.single().cells
        assertThat(cells.map { it.index }).containsExactly(0, 1).inOrder()
        cells.forEach { assertThat(it.widthWeight).isWithin(TOL).of(0.5f) }
    }

    @Test
    fun `three images are one large row over a two-up row`() {
        val layout = MediaCollage.solve(3)
        assertThat(layout.rows).hasSize(2)
        val (top, bottom) = layout.rows
        assertThat(top.cells.map { it.index }).containsExactly(0)
        assertThat(top.cells.single().widthWeight).isWithin(TOL).of(1f)
        assertThat(bottom.cells.map { it.index }).containsExactly(1, 2).inOrder()
        bottom.cells.forEach { assertThat(it.widthWeight).isWithin(TOL).of(0.5f) }
        // the "large" top row is taller than the two-up row beneath it
        assertThat(top.heightWeight).isGreaterThan(bottom.heightWeight)
    }

    @Test
    fun `four images are a row-major two by two grid`() {
        val layout = MediaCollage.solve(4)
        assertThat(layout.rows).hasSize(2)
        assertThat(layout.rows[0].cells.map { it.index }).containsExactly(0, 1).inOrder()
        assertThat(layout.rows[1].cells.map { it.index }).containsExactly(2, 3).inOrder()
        layout.rows.forEach { row ->
            assertThat(row.heightWeight).isWithin(TOL).of(0.5f)
            row.cells.forEach { assertThat(it.widthWeight).isWithin(TOL).of(0.5f) }
        }
    }

    @Test
    fun `five images are a two-up row over a three-up row with no overflow`() {
        val layout = MediaCollage.solve(5)
        assertThat(layout.rows).hasSize(2)
        assertThat(layout.rows[0].cells.map { it.index }).containsExactly(0, 1).inOrder()
        assertThat(layout.rows[1].cells.map { it.index }).containsExactly(2, 3, 4).inOrder()
        layout.rows[1].cells.forEach { assertThat(it.widthWeight).isWithin(TOL).of(1f / 3f) }
        assertThat(layout.rows.flatMap { it.cells }.map { it.overflowCount }).containsExactly(0, 0, 0, 0, 0)
    }

    @Test
    fun `six images cap at five cells with a plus-one overflow on the last`() {
        val layout = MediaCollage.solve(6)
        val cells = layout.rows.flatMap { it.cells }
        assertThat(cells.map { it.index }).containsExactly(0, 1, 2, 3, 4).inOrder()
        assertThat(cells.last().overflowCount).isEqualTo(1)
        assertThat(cells.dropLast(1).map { it.overflowCount }).containsExactly(0, 0, 0, 0)
    }

    @Test
    fun `many images report the full hidden remainder on the overflow cell`() {
        val layout = MediaCollage.solve(12)
        val cells = layout.rows.flatMap { it.cells }
        assertThat(cells).hasSize(5)
        assertThat(cells.last().overflowCount).isEqualTo(7)
    }

    @Test
    fun `every layout covers its visible indices exactly once in order`() {
        (1..20).forEach { count ->
            val visible = minOf(count, MediaCollage.MAX_VISIBLE)
            val indices = MediaCollage.solve(count).rows.flatMap { row -> row.cells.map { it.index } }
            assertThat(indices).isEqualTo((0 until visible).toList())
        }
    }

    @Test
    fun `overflow appears only on the last cell and only past the cap`() {
        (1..MediaCollage.MAX_VISIBLE).forEach { count ->
            val overflows = MediaCollage.solve(count).rows.flatMap { it.cells }.map { it.overflowCount }
            assertThat(overflows.all { it == 0 }).isTrue()
        }
        (MediaCollage.MAX_VISIBLE + 1..MediaCollage.MAX_VISIBLE + 5).forEach { count ->
            val cells = MediaCollage.solve(count).rows.flatMap { it.cells }
            assertThat(cells.dropLast(1).all { it.overflowCount == 0 }).isTrue()
            assertThat(cells.last().overflowCount).isEqualTo(count - MediaCollage.MAX_VISIBLE)
        }
    }

    @Test
    fun `row height weights and per-row width weights each sum to one`() {
        (1..20).forEach { count ->
            val layout = MediaCollage.solve(count)
            val heightSum = layout.rows.sumOf { it.heightWeight.toDouble() }
            assertThat(heightSum).isWithin(TOL.toDouble()).of(1.0)
            layout.rows.forEach { row ->
                val widthSum = row.cells.sumOf { it.widthWeight.toDouble() }
                assertThat(widthSum).isWithin(TOL.toDouble()).of(1.0)
            }
        }
    }

    private companion object {
        const val TOL = 0.001f
    }
}
