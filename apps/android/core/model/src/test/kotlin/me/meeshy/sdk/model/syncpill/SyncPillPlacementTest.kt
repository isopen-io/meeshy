package me.meeshy.sdk.model.syncpill

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SyncPillPlacementTest {
    @Test
    fun `the bottom edge is max of keyboard and safe area plus docked height plus 8`() {
        assertThat(SyncPillPlacement.bottomFromScreenEdge(34f, 0f, 0f)).isEqualTo(42f)
        assertThat(SyncPillPlacement.bottomFromScreenEdge(34f, 300f, 60f)).isEqualTo(368f)
        assertThat(SyncPillPlacement.bottomFromScreenEdge(-5f, -1f, -9f)).isEqualTo(8f)
    }

    @Test
    fun `docked height from a measure adds the lift and never goes negative`() {
        assertThat(SyncPillPlacement.dockedHeight(56f, 8f)).isEqualTo(64f)
        assertThat(SyncPillPlacement.dockedHeight(-4f, -1f)).isEqualTo(0f)
    }

    @Test
    fun `docked height from the chrome top subtracts the edge`() {
        assertThat(SyncPillPlacement.dockedHeightFromTop(120f, 34f, 0f)).isEqualTo(86f)
        assertThat(SyncPillPlacement.dockedHeightFromTop(10f, 34f, 0f)).isEqualTo(0f)
    }
}
