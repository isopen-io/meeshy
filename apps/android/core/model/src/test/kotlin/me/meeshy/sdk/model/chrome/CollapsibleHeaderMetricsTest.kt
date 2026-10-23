package me.meeshy.sdk.model.chrome

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CollapsibleHeaderMetricsTest {

    private val m = CollapsibleHeaderMetrics

    @Test
    fun `progress is minus offset over 60 clamped to 0 and 1`() {
        assertThat(m.progress(0f)).isEqualTo(0f)
        assertThat(m.progress(-30f)).isEqualTo(0.5f)
        assertThat(m.progress(-60f)).isEqualTo(1f)
        assertThat(m.progress(-400f)).isEqualTo(1f)
        assertThat(m.progress(25f)).isEqualTo(0f)
    }

    @Test
    fun `title goes from 24 to 17 and is bold below half then semibold`() {
        assertThat(m.titleSizeSp(0f)).isEqualTo(24f)
        assertThat(m.titleSizeSp(1f)).isEqualTo(17f)
        assertThat(m.isTitleBold(0.49f)).isTrue()
        assertThat(m.isTitleBold(0.5f)).isFalse()
    }

    @Test
    fun `subtitle shrinks from 15 to 12 and fades out before 0point7 then reappears collapsed`() {
        assertThat(m.expandedSubtitleSizeSp(0f)).isEqualTo(15f)
        assertThat(m.expandedSubtitleSizeSp(1f)).isEqualTo(12f)
        assertThat(m.expandedSubtitleAlpha(0f)).isEqualTo(1f)
        assertThat(m.expandedSubtitleAlpha(0.3f)).isWithin(1e-6f).of(0.5f)
        assertThat(m.expandedSubtitleAlpha(0.6f)).isWithin(1e-6f).of(0f)
        assertThat(m.showExpandedSubtitle(0.69f)).isTrue()
        assertThat(m.showExpandedSubtitle(0.7f)).isFalse()
        assertThat(m.showCollapsedSubtitle(0.7f)).isFalse()
        assertThat(m.showCollapsedSubtitle(0.85f)).isTrue()
        assertThat(m.collapsedSubtitleAlpha(0.85f)).isWithin(1e-6f).of(0.5f)
        assertThat(m.collapsedSubtitleAlpha(0.5f)).isEqualTo(0f)
    }

    @Test
    fun `leading scales 1 to 0point8 and title view 1 to 0point65`() {
        assertThat(m.leadingScale(1f)).isWithin(1e-6f).of(0.8f)
        assertThat(m.titleViewScale(1f)).isWithin(1e-6f).of(0.65f)
        assertThat(m.leadingScale(0f)).isEqualTo(1f)
    }

    @Test
    fun `center reveal appears only after 0point6`() {
        assertThat(m.revealOpacity(0.6f)).isEqualTo(0f)
        assertThat(m.revealOpacity(0.8f)).isWithin(1e-6f).of(0.5f)
        assertThat(m.revealOpacity(1f)).isEqualTo(1f)
        assertThat(m.revealOffsetDp(0f)).isEqualTo(6f)
        assertThat(m.revealOffsetDp(1f)).isEqualTo(0f)
    }

    @Test
    fun `back arrow goes from 18 to 16 and bottom padding from 6 to 0`() {
        assertThat(m.backArrowSizeDp(0f)).isEqualTo(18f)
        assertThat(m.backArrowSizeDp(1f)).isEqualTo(16f)
        assertThat(m.titleBottomPaddingDp(0f)).isEqualTo(6f)
        assertThat(m.titleBottomPaddingDp(1f)).isEqualTo(0f)
    }

    @Test
    fun `inline accessory reveals between 78 and 148 dp`() {
        assertThat(m.inlineAccessoryReveal(-78f)).isEqualTo(0f)
        assertThat(m.inlineAccessoryReveal(-113f)).isWithin(1e-6f).of(0.5f)
        assertThat(m.inlineAccessoryReveal(-148f)).isEqualTo(1f)
        assertThat(m.inlineAccessoryReveal(0f)).isEqualTo(0f)
    }

    @Test
    fun `pinned reveal with a degenerate range is a step`() {
        assertThat(m.pinnedAccessoryReveal(-10f, start = 20f, end = 20f)).isEqualTo(0f)
        assertThat(m.pinnedAccessoryReveal(-20f, start = 20f, end = 20f)).isEqualTo(1f)
    }

    @Test
    fun `collapsed height is 44 plain, 60 with a revealed accessory, 57point2 with a center reveal`() {
        assertThat(m.effectiveCollapsedHeight(hasCenterReveal = false, hasTitleAccessory = false, inlineReveal = 1f)).isEqualTo(44f)
        assertThat(m.effectiveCollapsedHeight(hasCenterReveal = false, hasTitleAccessory = true, inlineReveal = 0f)).isEqualTo(44f)
        assertThat(m.effectiveCollapsedHeight(hasCenterReveal = false, hasTitleAccessory = true, inlineReveal = 1f)).isEqualTo(60f)
        assertThat(m.effectiveCollapsedHeight(hasCenterReveal = true, hasTitleAccessory = false, inlineReveal = 0f)).isWithin(1e-4f).of(57.2f)
    }

    @Test
    fun `header height lerps from 64 to the collapsed height`() {
        assertThat(m.headerHeight(0f, 44f)).isEqualTo(64f)
        assertThat(m.headerHeight(1f, 44f)).isEqualTo(44f)
        assertThat(m.headerHeight(0.5f, 60f)).isEqualTo(62f)
    }

    @Test
    fun `round chrome gutters derive from the 28 dp edge gutter`() {
        assertThat(m.TRAILING_ACTIONS_INSET).isEqualTo(16f)
        assertThat(m.LEADING_BACK_INSET).isEqualTo(16f)
        assertThat(m.ROUND_CHROME_DIAMETER).isEqualTo(40f)
        assertThat(m.ACTION_TARGET).isEqualTo(48f)
    }
}
