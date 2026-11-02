package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationEngagementSnapshotTest {

    private fun snapshot(total: Int = 42, today: Int = 5, streak: Int = 3, day: String? = "2026-09-30") =
        ConversationEngagementSnapshot("c1", total, today, streak, day)

    @Test
    fun `the same day shows everything`() {
        assertThat(snapshot().forDay("2026-09-30")).isEqualTo(snapshot())
    }

    @Test
    fun `the next day drops the day points but keeps the streak`() {
        val shown = snapshot().forDay("2026-10-01")
        assertThat(shown.todayPoints).isEqualTo(0)
        assertThat(shown.streakDays).isEqualTo(3)
    }

    @Test
    fun `two days later the streak is out`() {
        assertThat(snapshot().forDay("2026-10-02").streakDays).isEqualTo(0)
        assertThat(snapshot().forDay("2026-10-02").totalPoints).isEqualTo(42)
    }

    @Test
    fun `a missing or malformed day reads as no streak and no day points`() {
        assertThat(snapshot(day = null).forDay("2026-10-01").streakDays).isEqualTo(0)
        assertThat(snapshot(day = "hier").forDay("2026-10-01").todayPoints).isEqualTo(0)
        assertThat(snapshot().forDay("n'importe quoi").streakDays).isEqualTo(0)
    }

    @Test
    fun `the fresher snapshot is the later day, then the larger total`() {
        assertThat(snapshot(day = "2026-10-01").isFresherThan(snapshot(day = "2026-09-30", total = 99))).isTrue()
        assertThat(snapshot(total = 50).isFresherThan(snapshot(total = 42))).isTrue()
        assertThat(snapshot(total = 42).isFresherThan(snapshot(total = 50))).isFalse()
        assertThat(snapshot(day = null).isFresherThan(snapshot())).isFalse()
    }

    @Test
    fun `a running streak is what the flame needs`() {
        assertThat(snapshot(streak = 1).hasRunningStreak).isTrue()
        assertThat(snapshot(streak = 0).hasRunningStreak).isFalse()
    }
}
