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

    @Test
    fun `la banniere passe de 130 a 52 dp et perd 60 pour cent d'opacite`() {
        assertThat(ProfileHeaderMetrics.bannerHeightDp(0f)).isEqualTo(130f)
        assertThat(ProfileHeaderMetrics.bannerHeightDp(1f)).isEqualTo(52f)
        assertThat(ProfileHeaderMetrics.bannerHeightDp(0.5f)).isEqualTo(91f)
        assertThat(ProfileHeaderMetrics.bannerAlpha(1f)).isWithin(1e-6f).of(0.4f)
        assertThat(ProfileHeaderMetrics.bannerHeightDp(3f)).isEqualTo(52f)
    }

    @Test
    fun `l'identite retrecit de 12 pour cent et s'efface`() {
        assertThat(ProfileHeaderMetrics.identityScale(0f)).isEqualTo(1f)
        assertThat(ProfileHeaderMetrics.identityScale(1f)).isWithin(1e-6f).of(0.88f)
        assertThat(ProfileHeaderMetrics.identityAlpha(1f)).isEqualTo(0f)
        assertThat(ProfileHeaderMetrics.identityAlpha(0.25f)).isEqualTo(0.75f)
    }

    @Test
    fun `les onglets glissent sous la barre compacte`() {
        assertThat(ProfileHeaderMetrics.tabBarTopInsetDp(0f)).isEqualTo(0f)
        assertThat(ProfileHeaderMetrics.tabBarTopInsetDp(1f)).isEqualTo(52f)
    }

    @Test
    fun `la barre compacte ne prend le relais qu'au-dela de la moitie`() {
        assertThat(ProfileHeaderMetrics.compactBarOwnsIdentity(0.5f)).isFalse()
        assertThat(ProfileHeaderMetrics.compactBarOwnsIdentity(0.51f)).isTrue()
    }

    @Test
    fun `un en-tete sorti de l'ecran vaut un repli complet`() {
        assertThat(ProfileHeaderMetrics.scrolledDp(firstVisibleIndex = 0, firstVisibleOffsetDp = 30f)).isEqualTo(30f)
        assertThat(ProfileHeaderMetrics.scrolledDp(firstVisibleIndex = 2, firstVisibleOffsetDp = 0f)).isEqualTo(120f)
        assertThat(ProfileHeaderMetrics.progress(-ProfileHeaderMetrics.scrolledDp(1, 0f))).isEqualTo(1f)
    }
}
