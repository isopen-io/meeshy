package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class QueueStepRuleTest {

    @Test
    fun `previous after more than three seconds restarts the track`() {
        assertThat(QueueStepRule.previous(positionMs = 3_001, hasPrevious = true)).isEqualTo(PreviousStep.Restart)
    }

    @Test
    fun `previous at exactly three seconds rewinds to the previous track`() {
        assertThat(QueueStepRule.previous(positionMs = 3_000, hasPrevious = true)).isEqualTo(PreviousStep.Rewind)
    }

    @Test
    fun `previous without any history always restarts`() {
        assertThat(QueueStepRule.previous(positionMs = 0, hasPrevious = false)).isEqualTo(PreviousStep.Restart)
        assertThat(QueueStepRule.previous(positionMs = 10_000, hasPrevious = false)).isEqualTo(PreviousStep.Restart)
    }

    @Test
    fun `the restart threshold is three seconds`() {
        assertThat(QueueStepRule.RESTART_THRESHOLD_MS).isEqualTo(3_000L)
    }
}
