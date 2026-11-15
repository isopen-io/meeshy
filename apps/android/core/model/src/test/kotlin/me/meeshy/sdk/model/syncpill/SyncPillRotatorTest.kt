package me.meeshy.sdk.model.syncpill

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SyncPillRotatorTest {
    private val three = SyncPillRotator().withItemCount(3)

    @Test
    fun `a tick advances and wraps`() {
        assertThat(three.tick(0).currentIndex).isEqualTo(1)
        assertThat(three.tick(0).tick(0).tick(0).currentIndex).isEqualTo(0)
    }

    @Test
    fun `one entry or fewer never rotates`() {
        val one = SyncPillRotator().withItemCount(1)
        assertThat(one.isRunning).isFalse()
        assertThat(one.tick(0).currentIndex).isEqualTo(0)
        assertThat(one.advance(0)).isEqualTo(one)
        assertThat(SyncPillRotator().withItemCount(0).isRunning).isFalse()
    }

    @Test
    fun `a manual swipe pauses the auto rotation for 5 seconds`() {
        val swiped = three.advance(now = 1_000)
        assertThat(swiped.currentIndex).isEqualTo(1)
        assertThat(swiped.tick(5_999).currentIndex).isEqualTo(1)
        val resumed = swiped.tick(6_000)
        assertThat(resumed.currentIndex).isEqualTo(2)
        assertThat(resumed.pausedUntil).isNull()
    }

    @Test
    fun `rewind goes back and wraps`() {
        assertThat(three.rewind(0).currentIndex).isEqualTo(2)
    }

    @Test
    fun `a frozen rotator does not tick`() {
        val frozen = three.withAutoRotation(false)
        assertThat(frozen.isRunning).isFalse()
        assertThat(frozen.tick(100_000).currentIndex).isEqualTo(0)
        assertThat(frozen.withAutoRotation(true).tick(0).currentIndex).isEqualTo(1)
    }

    @Test
    fun `the index is reindexed when the list shrinks`() {
        val onLast = three.tick(0).tick(0)
        assertThat(onLast.currentIndex).isEqualTo(2)
        assertThat(onLast.withItemCount(2).currentIndex).isEqualTo(0)
        assertThat(onLast.withItemCount(3).currentIndex).isEqualTo(2)
    }

    @Test
    fun `timings are the iOS ones`() {
        assertThat(SyncPillRotator.INTERVAL_MS).isEqualTo(2_700L)
        assertThat(SyncPillRotator.FREEZE_PRESS_MS).isEqualTo(500L)
    }
}
