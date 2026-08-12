package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for the pure slide drag-reorder resolver. The resolver turns a
 * horizontal drag (accumulated pixels) into the slot the dragged chip should land
 * in, so the `SlideStrip` Composable stays glue and feeds the already-tested
 * [StorySlideDeck.move] reducer a clamped, deterministic target index. No Android,
 * no I/O — slot widths are supplied by the caller from layout/density.
 */
@RunWith(JUnit4::class)
class SlideReorderResolverTest {

    @Test
    fun `no drag keeps the chip at its origin`() {
        val target = SlideReorderResolver.targetIndex(
            fromIndex = 2,
            dragPx = 0f,
            slotWidthPx = 100f,
            slideCount = 5,
        )
        assertThat(target).isEqualTo(2)
    }

    @Test
    fun `a drag shorter than half a slot does not move the chip`() {
        val target = SlideReorderResolver.targetIndex(
            fromIndex = 1,
            dragPx = 40f,
            slotWidthPx = 100f,
            slideCount = 5,
        )
        assertThat(target).isEqualTo(1)
    }

    @Test
    fun `dragging right past half a slot advances one position`() {
        val target = SlideReorderResolver.targetIndex(
            fromIndex = 1,
            dragPx = 60f,
            slotWidthPx = 100f,
            slideCount = 5,
        )
        assertThat(target).isEqualTo(2)
    }

    @Test
    fun `dragging left past half a slot retreats one position`() {
        val target = SlideReorderResolver.targetIndex(
            fromIndex = 3,
            dragPx = -60f,
            slotWidthPx = 100f,
            slideCount = 5,
        )
        assertThat(target).isEqualTo(2)
    }

    @Test
    fun `dragging across several slots crosses the matching number of positions`() {
        val target = SlideReorderResolver.targetIndex(
            fromIndex = 0,
            dragPx = 230f,
            slotWidthPx = 100f,
            slideCount = 5,
        )
        assertThat(target).isEqualTo(2)
    }

    @Test
    fun `dragging far right clamps to the last slot`() {
        val target = SlideReorderResolver.targetIndex(
            fromIndex = 2,
            dragPx = 9999f,
            slotWidthPx = 100f,
            slideCount = 4,
        )
        assertThat(target).isEqualTo(3)
    }

    @Test
    fun `dragging far left clamps to the first slot`() {
        val target = SlideReorderResolver.targetIndex(
            fromIndex = 2,
            dragPx = -9999f,
            slotWidthPx = 100f,
            slideCount = 4,
        )
        assertThat(target).isEqualTo(0)
    }

    @Test
    fun `a single-slide deck has nowhere to move`() {
        val target = SlideReorderResolver.targetIndex(
            fromIndex = 0,
            dragPx = 500f,
            slotWidthPx = 100f,
            slideCount = 1,
        )
        assertThat(target).isEqualTo(0)
    }

    @Test
    fun `a non-positive slot width degrades to the origin instead of dividing by zero`() {
        val target = SlideReorderResolver.targetIndex(
            fromIndex = 2,
            dragPx = 500f,
            slotWidthPx = 0f,
            slideCount = 5,
        )
        assertThat(target).isEqualTo(2)
    }

    @Test
    fun `an out-of-range origin is clamped before the drag is applied`() {
        val target = SlideReorderResolver.targetIndex(
            fromIndex = 99,
            dragPx = 0f,
            slotWidthPx = 100f,
            slideCount = 5,
        )
        assertThat(target).isEqualTo(4)
    }

    @Test
    fun `an empty deck resolves to zero without throwing`() {
        val target = SlideReorderResolver.targetIndex(
            fromIndex = 0,
            dragPx = 100f,
            slotWidthPx = 100f,
            slideCount = 0,
        )
        assertThat(target).isEqualTo(0)
    }
}
