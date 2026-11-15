package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FeedHeaderCollapseStateTest {

    private fun state(index: Int = 0, offset: Int = 0, scrolling: Boolean = false, quiet: Long = 1_000L) =
        FeedHeaderCollapseState.of(
            firstVisibleItemIndex = index,
            firstVisibleItemScrollOffsetPx = offset,
            thresholdPx = 100,
            isScrollInProgress = scrolling,
            quietMillis = quiet,
        )

    @Test
    fun `at rest the title is shown and the actions are visible`() {
        val s = state()
        assertThat(s.progress).isEqualTo(0f)
        assertThat(s.isCollapsed).isFalse()
        assertThat(s.actionsVisible).isTrue()
    }

    @Test
    fun `half way through the threshold the header is half folded`() {
        val s = state(offset = 50)
        assertThat(s.progress).isEqualTo(0.5f)
        assertThat(s.isCollapsed).isFalse()
    }

    @Test
    fun `past the threshold the title yields to the compact story strip`() {
        assertThat(state(offset = 100).isCollapsed).isTrue()
        assertThat(state(offset = 900).progress).isEqualTo(1f)
    }

    @Test
    fun `scrolled to a later item the header never re-expands`() {
        assertThat(state(index = 3, offset = 0).isCollapsed).isTrue()
    }

    @Test
    fun `the actions hide while the list is moving`() {
        assertThat(state(scrolling = true, quiet = 0L).actionsVisible).isFalse()
    }

    @Test
    fun `the actions wait for the stillness delay before coming back`() {
        assertThat(state(scrolling = false, quiet = 50L).actionsVisible).isFalse()
        assertThat(state(scrolling = false, quiet = 160L).actionsVisible).isTrue()
    }
}
