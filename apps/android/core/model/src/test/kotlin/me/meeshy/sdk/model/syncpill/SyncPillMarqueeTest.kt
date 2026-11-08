package me.meeshy.sdk.model.syncpill

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SyncPillMarqueeTest {
    @Test
    fun `scrolls only when the text strictly overflows`() {
        assertThat(SyncPillMarquee.shouldScroll(100f, 100f)).isFalse()
        assertThat(SyncPillMarquee.shouldScroll(100.1f, 100f)).isTrue()
    }

    @Test
    fun `duration is proportional with a one second floor`() {
        assertThat(SyncPillMarquee.scrollDuration(400f)).isEqualTo(10.0)
        assertThat(SyncPillMarquee.scrollDuration(10f)).isEqualTo(1.0)
    }

    @Test
    fun `the offset is a pure function of elapsed time`() {
        assertThat(SyncPillMarquee.offset(0.0, 200f, 100f)).isEqualTo(0f)
        assertThat(SyncPillMarquee.offset(-1.0, 200f, 100f)).isEqualTo(0f)
        assertThat(SyncPillMarquee.offset(1.0, 200f, 100f)).isEqualTo(-40f)
        // first pass ends at 224 pt (5.6 s); then laps restart from the right edge
        assertThat(SyncPillMarquee.offset(5.6, 200f, 100f)).isWithin(0.01f).of(-224f)
        assertThat(SyncPillMarquee.offset(6.0, 200f, 100f)).isWithin(0.01f).of(100f - 16f)
    }
}
