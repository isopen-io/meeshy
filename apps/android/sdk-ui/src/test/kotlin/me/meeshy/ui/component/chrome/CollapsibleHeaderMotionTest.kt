package me.meeshy.ui.component.chrome

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CollapsibleHeaderMotionTest {

    @Test
    fun `collapseProgress at the top of the list is 0`() {
        val progress = CollapsibleHeaderMotion.collapseProgress(
            firstVisibleItemIndex = 0,
            firstVisibleItemScrollOffsetPx = 0,
            thresholdPx = 60,
        )
        assertThat(progress).isEqualTo(0f)
    }

    @Test
    fun `collapseProgress at half the threshold is 0point5`() {
        val progress = CollapsibleHeaderMotion.collapseProgress(
            firstVisibleItemIndex = 0,
            firstVisibleItemScrollOffsetPx = 30,
            thresholdPx = 60,
        )
        assertThat(progress).isEqualTo(0.5f)
    }

    @Test
    fun `collapseProgress at or beyond the threshold clamps to 1`() {
        val atThreshold = CollapsibleHeaderMotion.collapseProgress(
            firstVisibleItemIndex = 0,
            firstVisibleItemScrollOffsetPx = 60,
            thresholdPx = 60,
        )
        val beyondThreshold = CollapsibleHeaderMotion.collapseProgress(
            firstVisibleItemIndex = 0,
            firstVisibleItemScrollOffsetPx = 240,
            thresholdPx = 60,
        )
        assertThat(atThreshold).isEqualTo(1f)
        assertThat(beyondThreshold).isEqualTo(1f)
    }

    @Test
    fun `collapseProgress once scrolled past the first item is fully collapsed regardless of offset`() {
        val progress = CollapsibleHeaderMotion.collapseProgress(
            firstVisibleItemIndex = 1,
            firstVisibleItemScrollOffsetPx = 0,
            thresholdPx = 60,
        )
        assertThat(progress).isEqualTo(1f)
    }

    @Test
    fun `heightDp interpolates from expanded to collapsed`() {
        assertThat(CollapsibleHeaderMotion.heightDp(0f, 64f, 44f)).isEqualTo(64f)
        assertThat(CollapsibleHeaderMotion.heightDp(1f, 64f, 44f)).isEqualTo(44f)
        assertThat(CollapsibleHeaderMotion.heightDp(0.5f, 64f, 44f)).isEqualTo(54f)
    }

    @Test
    fun `dividerAlpha scales linearly up to 0point3 at full collapse`() {
        assertThat(CollapsibleHeaderMotion.dividerAlpha(0f)).isEqualTo(0f)
        assertThat(CollapsibleHeaderMotion.dividerAlpha(0.5f)).isEqualTo(0.15f)
        assertThat(CollapsibleHeaderMotion.dividerAlpha(1f)).isEqualTo(0.3f)
    }

    @Test
    fun `titleFontSizeSp interpolates from 28 to 17`() {
        assertThat(CollapsibleHeaderMotion.titleFontSizeSp(0f)).isEqualTo(28f)
        assertThat(CollapsibleHeaderMotion.titleFontSizeSp(1f)).isEqualTo(17f)
    }

    @Test
    fun `isTitleBold is true below 0point5 and false at or above 0point5`() {
        assertThat(CollapsibleHeaderMotion.isTitleBold(0f)).isTrue()
        assertThat(CollapsibleHeaderMotion.isTitleBold(0.49f)).isTrue()
        assertThat(CollapsibleHeaderMotion.isTitleBold(0.5f)).isFalse()
        assertThat(CollapsibleHeaderMotion.isTitleBold(1f)).isFalse()
    }
}
