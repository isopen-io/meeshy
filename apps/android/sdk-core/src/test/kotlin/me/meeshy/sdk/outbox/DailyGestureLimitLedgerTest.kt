package me.meeshy.sdk.outbox

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.feedback.DailyGestureLimit
import org.junit.Test

class DailyGestureLimitLedgerTest {

    private fun limit(at: Long) = DailyGestureLimit(DailyGestureLimit.Gesture.COMMENT, at, 50)

    @Test
    fun `la limite d'une mutation se lit une seule fois`() {
        val ledger = DailyGestureLimitLedger()
        ledger.record(limit(1), "m1")
        assertThat(ledger.take("m1")).isEqualTo(limit(1))
        assertThat(ledger.take("m1")).isNull()
    }

    @Test
    fun `une mutation inconnue ne rend rien`() {
        assertThat(DailyGestureLimitLedger().take("absente")).isNull()
    }

    @Test
    fun `le registre est borne a 64 entrees et la plus ancienne cede`() {
        val ledger = DailyGestureLimitLedger()
        (0 until DailyGestureLimitLedger.CAPACITY + 10).forEach { ledger.record(limit(it.toLong()), "m$it") }
        assertThat(DailyGestureLimitLedger.CAPACITY).isEqualTo(64)
        (0 until 10).forEach { assertThat(ledger.take("m$it")).isNull() }
        (10 until 74).forEach { assertThat(ledger.take("m$it")).isEqualTo(limit(it.toLong())) }
    }

    @Test
    fun `reenregistrer une mutation ne la compte qu'une fois`() {
        val ledger = DailyGestureLimitLedger()
        repeat(200) { ledger.record(limit(it.toLong()), "meme") }
        ledger.record(limit(7), "autre")
        assertThat(ledger.take("autre")).isEqualTo(limit(7))
        assertThat(ledger.take("meme")).isEqualTo(limit(199))
    }
}
