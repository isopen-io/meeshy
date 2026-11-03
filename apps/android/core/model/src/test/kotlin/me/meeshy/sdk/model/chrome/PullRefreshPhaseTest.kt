package me.meeshy.sdk.model.chrome

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PullRefreshPhaseTest {
    private val law = PullRefreshLaw

    @Test
    fun `idle stays idle without writing when nothing is pulled`() {
        assertThat(law.next(PullRefreshPhase.Idle, 0f)).isNull()
        assertThat(law.next(PullRefreshPhase.Idle, -12f)).isNull()
    }

    @Test
    fun `a partial pull gives proportional progress`() {
        assertThat(law.next(PullRefreshPhase.Idle, 45f)).isEqualTo(PullRefreshPhase.Pulling(0.5f))
    }

    @Test
    fun `an unchanged pull distance writes nothing`() {
        assertThat(law.next(PullRefreshPhase.Pulling(0.5f), 45f)).isNull()
    }

    @Test
    fun `reaching the 90 dp threshold arms once`() {
        assertThat(law.next(PullRefreshPhase.Pulling(0.9f), 90f)).isEqualTo(PullRefreshPhase.Armed)
        assertThat(law.next(PullRefreshPhase.Armed, 140f)).isNull()
    }

    @Test
    fun `armed falls back to pulling when the finger comes back`() {
        assertThat(law.next(PullRefreshPhase.Armed, 30f)).isEqualTo(PullRefreshPhase.Pulling(30f / 90f))
    }

    @Test
    fun `releasing to zero returns to idle`() {
        assertThat(law.next(PullRefreshPhase.Pulling(0.4f), 0f)).isEqualTo(PullRefreshPhase.Idle)
        assertThat(law.next(PullRefreshPhase.Armed, 0f)).isEqualTo(PullRefreshPhase.Idle)
    }

    @Test
    fun `refreshing and completing ignore scrolling`() {
        listOf(PullRefreshPhase.Refreshing, PullRefreshPhase.Completing).forEach {
            assertThat(law.next(it, 0f)).isNull()
            assertThat(law.next(it, 200f)).isNull()
        }
    }

    @Test
    fun `degenerate threshold arms immediately`() {
        assertThat(law.next(PullRefreshPhase.Idle, 1f, threshold = 0f)).isEqualTo(PullRefreshPhase.Armed)
    }

    @Test
    fun `haptic fires only on the crossing into armed`() {
        assertThat(law.crossesThreshold(PullRefreshPhase.Pulling(0.9f), PullRefreshPhase.Armed)).isTrue()
        assertThat(law.crossesThreshold(PullRefreshPhase.Armed, PullRefreshPhase.Armed)).isFalse()
        assertThat(law.crossesThreshold(PullRefreshPhase.Idle, PullRefreshPhase.Pulling(0.2f))).isFalse()
    }

    @Test
    fun `geometry is zero height at rest and full when armed`() {
        val g = PullIndicatorGeometry
        assertThat(g.visibleHeightDp(PullRefreshPhase.Idle)).isEqualTo(0f)
        assertThat(g.visibleHeightDp(PullRefreshPhase.Pulling(0.5f))).isEqualTo(45f)
        assertThat(g.visibleHeightDp(PullRefreshPhase.Pulling(3f))).isEqualTo(90f)
        assertThat(g.visibleHeightDp(PullRefreshPhase.Armed)).isEqualTo(90f)
        assertThat(g.visibleHeightDp(PullRefreshPhase.Refreshing)).isEqualTo(90f)
        assertThat(g.visibleHeightDp(PullRefreshPhase.Completing)).isEqualTo(90f)
    }

    @Test
    fun `armed logo is full opacity scaled 1_04 and rotated 180`() {
        val g = PullIndicatorGeometry
        assertThat(g.logoOpacity(PullRefreshPhase.Armed)).isEqualTo(1f)
        assertThat(g.logoScale(PullRefreshPhase.Armed)).isEqualTo(1.04f)
        assertThat(g.logoRotationDegrees(PullRefreshPhase.Armed)).isEqualTo(180f)
        assertThat(g.logoRotationDegrees(PullRefreshPhase.Pulling(0.5f))).isEqualTo(90f)
        assertThat(g.logoRotationDegrees(PullRefreshPhase.Refreshing)).isEqualTo(0f)
    }

    @Test
    fun `logo grows from 60 percent while pulling and the ring shows only while refreshing`() {
        val g = PullIndicatorGeometry
        assertThat(g.logoScale(PullRefreshPhase.Idle)).isEqualTo(0.6f)
        assertThat(g.logoScale(PullRefreshPhase.Pulling(0.5f))).isWithin(1e-5f).of(0.8f)
        assertThat(g.showsRing(PullRefreshPhase.Refreshing)).isTrue()
        assertThat(g.showsRing(PullRefreshPhase.Completing)).isFalse()
        assertThat(g.isContinuous(PullRefreshPhase.Refreshing)).isTrue()
    }
}
