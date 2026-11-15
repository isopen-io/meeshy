package me.meeshy.ui.theme

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LentilleMetricsTest {

    @Test
    fun `row metrics are frozen`() {
        assertThat(LentilleMetrics.Row.height.value).isEqualTo(84f)
        assertThat(LentilleMetrics.Row.paddingVertical.value).isEqualTo(8f)
        assertThat(LentilleMetrics.Row.paddingHorizontal.value).isEqualTo(16f)
        assertThat(LentilleMetrics.Row.marginHorizontal.value).isEqualTo(8f)
        assertThat(LentilleMetrics.Row.marginVertical.value).isEqualTo(8f)
        assertThat(LentilleMetrics.Row.radius.value).isEqualTo(16f)
    }

    @Test
    fun `avatar and presence metrics are frozen`() {
        assertThat(LentilleMetrics.Avatar.size.value).isEqualTo(44f)
        assertThat(LentilleMetrics.Avatar.ringWidth.value).isEqualTo(1.5f)
        assertThat(LentilleMetrics.Avatar.ringOpacity).isEqualTo(0.55f)
        assertThat(LentilleMetrics.PresenceDot.size.value).isEqualTo(11f)
        assertThat(LentilleMetrics.PresenceDot.borderSize.value).isEqualTo(2.5f)
    }

    @Test
    fun `text metrics are frozen`() {
        assertThat(LentilleMetrics.Name.size.value).isEqualTo(15f)
        assertThat(LentilleMetrics.Time.size.value).isEqualTo(12f)
        assertThat(LentilleMetrics.Line2.size.value).isEqualTo(13f)
        assertThat(LentilleMetrics.Sticker.size.value).isEqualTo(10.5f)
        assertThat(LentilleMetrics.Sticker.letterSpacingEm).isEqualTo(0.1f)
        assertThat(LentilleMetrics.Sticker.paddingVertical.value).isEqualTo(4f)
        assertThat(LentilleMetrics.Sticker.paddingHorizontal.value).isEqualTo(13f)
    }

    @Test
    fun `badges tags and states are frozen`() {
        assertThat(LentilleMetrics.UnreadDot.size.value).isEqualTo(8f)
        assertThat(LentilleMetrics.Tags.size.value).isEqualTo(6f)
        assertThat(LentilleMetrics.Tags.maxCount).isEqualTo(3)
        assertThat(LentilleMetrics.Muted.opacity).isEqualTo(0.55f)
        assertThat(LentilleMetrics.Agent.avatarRingWidth.value).isEqualTo(1.5f)
    }

    @Test
    fun `focus card and rail metrics are frozen`() {
        assertThat(LentilleMetrics.FocusCard.height.value).isEqualTo(124f)
        assertThat(LentilleMetrics.FocusCard.ringSize.value).isEqualTo(1.5f)
        assertThat(LentilleMetrics.FocusInline.height.value).isEqualTo(100f)
        assertThat(LentilleMetrics.Rail.size.value).isEqualTo(48f)
        assertThat(LentilleMetrics.Rail.ringWidth.value).isEqualTo(3.5f)
        assertThat(LentilleMetrics.Rail.maxEntries).isEqualTo(6)
        assertThat(LentilleMetrics.Rail.pinnedAccessoryHeight.value).isEqualTo(60f)
    }
}
