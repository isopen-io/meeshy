package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationEngagementTest {

    private fun snapshot(total: Int = 0, today: Int = 0, streak: Int = 0, day: String? = "2026-10-01") =
        ConversationEngagementSnapshot("c1", total, today, streak, day)

    @Test
    fun `no snapshot or no points shows nothing`() {
        assertThat(ConversationPointsForm.of(null)).isNull()
        assertThat(ConversationPointsForm.of(snapshot(total = 0, streak = 3))).isNull()
    }

    @Test
    fun `a running streak shows the streak and the total`() {
        val form = ConversationPointsForm.of(snapshot(total = 120, streak = 4))
        assertThat(form).isEqualTo(ConversationPointsForm.Streak(4, 120))
        assertThat(form!!.streakDays).isEqualTo(4)
        assertThat(form.totalPoints).isEqualTo(120)
    }

    @Test
    fun `without a streak only the total shows`() {
        val form = ConversationPointsForm.of(snapshot(total = 120))
        assertThat(form).isEqualTo(ConversationPointsForm.Total(120))
        assertThat(form!!.streakDays).isEqualTo(0)
    }

    @Test
    fun `a streak that lapsed yesterday-plus falls back to the total once projected on the day`() {
        val shown = snapshot(total = 42, streak = 5).forDay("2026-10-04")
        assertThat(ConversationPointsForm.of(shown)).isEqualTo(ConversationPointsForm.Total(42))
    }
}
