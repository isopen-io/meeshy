package me.meeshy.sdk.model.profile

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ProfileHeaderMetricsTest {
    @Test
    fun `progress is zero at rest and for positive offsets`() {
        assertThat(ProfileHeaderMetrics.progress(0f)).isEqualTo(0f)
        assertThat(ProfileHeaderMetrics.progress(80f)).isEqualTo(0f)
    }

    @Test
    fun `progress reaches one at the collapse distance and stays there`() {
        assertThat(ProfileHeaderMetrics.progress(-120f)).isEqualTo(1f)
        assertThat(ProfileHeaderMetrics.progress(-900f)).isEqualTo(1f)
        assertThat(ProfileHeaderMetrics.progress(-60f)).isEqualTo(0.5f)
    }

    @Test
    fun `progress is monotone`() {
        val values = (0..150 step 10).map { ProfileHeaderMetrics.progress(-it.toFloat()) }
        assertThat(values).isInOrder()
    }

    @Test
    fun `constants match iOS`() {
        assertThat(ProfileHeaderMetrics.EXPANDED_BANNER_DP).isEqualTo(130f)
        assertThat(ProfileHeaderMetrics.COLLAPSED_BAR_DP).isEqualTo(52f)
    }
}
