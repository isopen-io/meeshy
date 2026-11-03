package me.meeshy.ui.component.refresh

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.chrome.PullIndicatorGeometry
import me.meeshy.sdk.model.chrome.PullRefreshPhase
import org.junit.Test

class MeeshyPullIndicatorGeometryTest {
    @Test
    fun `l indicateur a une hauteur nulle au repos et pleine une fois arme`() {
        assertThat(PullIndicatorGeometry.visibleHeightDp(PullRefreshPhase.Idle)).isEqualTo(0f)
        assertThat(PullIndicatorGeometry.visibleHeightDp(PullRefreshPhase.Armed)).isEqualTo(90f)
        assertThat(PullIndicatorGeometry.visibleHeightDp(PullRefreshPhase.Pulling(0.5f))).isEqualTo(45f)
    }

    @Test
    fun `le logo atteint 180 degres et 100 pour cent au seuil puis ne tourne plus`() {
        assertThat(PullIndicatorGeometry.logoRotationDegrees(PullRefreshPhase.Armed)).isEqualTo(180f)
        assertThat(PullIndicatorGeometry.logoOpacity(PullRefreshPhase.Armed)).isEqualTo(1f)
        assertThat(PullIndicatorGeometry.logoRotationDegrees(PullRefreshPhase.Refreshing)).isEqualTo(0f)
        assertThat(PullIndicatorGeometry.showsRing(PullRefreshPhase.Refreshing)).isTrue()
        assertThat(PullIndicatorGeometry.showsRing(PullRefreshPhase.Armed)).isFalse()
    }
}
