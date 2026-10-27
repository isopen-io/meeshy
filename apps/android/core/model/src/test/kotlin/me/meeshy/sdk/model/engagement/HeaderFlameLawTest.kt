package me.meeshy.sdk.model.engagement

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class HeaderFlameLawTest {

    @Test
    fun `the flame hangs under the folded avatar while a streak runs and nobody dismissed it`() {
        assertThat(HeaderFlameLaw.isShown(headerExpanded = false, dismissed = false, hasEngagement = true)).isTrue()
        assertThat(HeaderFlameLaw.isShown(headerExpanded = true, dismissed = false, hasEngagement = true)).isFalse()
        assertThat(HeaderFlameLaw.isShown(headerExpanded = false, dismissed = true, hasEngagement = true)).isFalse()
        assertThat(HeaderFlameLaw.isShown(headerExpanded = false, dismissed = false, hasEngagement = false)).isFalse()
    }

    @Test
    fun `unfolding the header lights the flame again, folding keeps the dismissal`() {
        assertThat(HeaderFlameLaw.dismissedAfterHeaderExpanded(expanded = true, wasDismissed = true)).isFalse()
        assertThat(HeaderFlameLaw.dismissedAfterHeaderExpanded(expanded = false, wasDismissed = true)).isTrue()
        assertThat(HeaderFlameLaw.dismissedAfterHeaderExpanded(expanded = false, wasDismissed = false)).isFalse()
    }

    @Test
    fun `the glow lives in the first orbit then dies, the flame ignites afterwards`() {
        assertThat(HeaderFlameLaw.glowLength(0f)).isEqualTo(0f)
        assertThat(HeaderFlameLaw.glowLength(0.225f)).isWithin(1e-4f).of(0.32f)
        assertThat(HeaderFlameLaw.glowLength(0.6f)).isEqualTo(0f)
        assertThat(HeaderFlameLaw.glowOpacity(0.6f)).isEqualTo(0f)
        assertThat(HeaderFlameLaw.flameScale(0.3f)).isEqualTo(1f)
        assertThat(HeaderFlameLaw.flameScale(0.625f)).isWithin(1e-4f).of(HeaderFlameLaw.PEAK_SCALE)
        assertThat(HeaderFlameLaw.flameScale(1f)).isEqualTo(1f)
    }

    @Test
    fun `the flame dims during the orbit and is whole again after`() {
        assertThat(HeaderFlameLaw.flameOpacity(0f)).isEqualTo(1f)
        assertThat(HeaderFlameLaw.flameOpacity(0.2f)).isLessThan(0.5f)
        assertThat(HeaderFlameLaw.flameOpacity(0.5f)).isEqualTo(1f)
    }

    @Test
    fun `the glow head makes one eased turn from the bottom`() {
        assertThat(HeaderFlameLaw.glowHeadDegrees(0f)).isEqualTo(90f)
        assertThat(HeaderFlameLaw.glowHeadDegrees(0.45f)).isWithin(1e-3f).of(450f)
        assertThat(HeaderFlameLaw.glowHeadDegrees(2f)).isWithin(1e-3f).of(450f)
    }
}
