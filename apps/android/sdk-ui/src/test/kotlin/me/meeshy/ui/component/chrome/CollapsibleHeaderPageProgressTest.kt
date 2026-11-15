package me.meeshy.ui.component.chrome

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.chrome.CollapsibleHeaderMetrics
import org.junit.Test

class CollapsibleHeaderPageProgressTest {

    @Test
    fun `scroll offset is negative dp, zero at rest`() {
        assertThat(CollapsibleHeaderPageProgress.scrollOffsetDp(0, 2f)).isEqualTo(0f)
        assertThat(CollapsibleHeaderPageProgress.scrollOffsetDp(120, 2f)).isEqualTo(-60f)
        assertThat(CollapsibleHeaderPageProgress.scrollOffsetDp(-40, 2f)).isEqualTo(0f)
    }

    @Test
    fun `a bad density never divides by zero`() {
        assertThat(CollapsibleHeaderPageProgress.scrollOffsetDp(100, 0f)).isEqualTo(0f)
    }

    @Test
    fun `lazy offset past the first item is fully collapsed`() {
        val offset = CollapsibleHeaderPageProgress.lazyOffsetDp(2, 0, 2f)
        assertThat(CollapsibleHeaderMetrics.progress(offset)).isEqualTo(1f)
    }

    @Test
    fun `lazy offset on the first item follows its pixel offset`() {
        val offset = CollapsibleHeaderPageProgress.lazyOffsetDp(0, 60, 2f)
        assertThat(CollapsibleHeaderMetrics.progress(offset)).isEqualTo(0.5f)
    }
}
