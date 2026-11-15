package me.meeshy.ui.component.chrome

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ScrollMotionVisibilityTest {

    @Test
    fun `hidden while scrolling regardless of how long it has been quiet`() {
        assertThat(ScrollMotionVisibility.isVisible(isScrolling = true, quietMillis = 0L)).isFalse()
        assertThat(ScrollMotionVisibility.isVisible(isScrolling = true, quietMillis = 10_000L)).isFalse()
    }

    @Test
    fun `hidden the instant scrolling stops (quiet = 0)`() {
        assertThat(ScrollMotionVisibility.isVisible(isScrolling = false, quietMillis = 0L)).isFalse()
    }

    @Test
    fun `hidden just under the stillness threshold (159ms)`() {
        assertThat(ScrollMotionVisibility.isVisible(isScrolling = false, quietMillis = 159L)).isFalse()
    }

    @Test
    fun `visible at or after the stillness threshold (160ms)`() {
        assertThat(ScrollMotionVisibility.isVisible(isScrolling = false, quietMillis = 160L)).isTrue()
        assertThat(ScrollMotionVisibility.isVisible(isScrolling = false, quietMillis = 500L)).isTrue()
    }
}
