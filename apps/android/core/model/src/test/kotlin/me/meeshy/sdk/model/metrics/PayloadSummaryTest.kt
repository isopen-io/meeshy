package me.meeshy.sdk.model.metrics

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PayloadSummaryTest {
    private val day = 86_400_000L

    private fun summary(at: Long, total: Long = 0, slow: Long = 0, peak: Long? = null) =
        PayloadSummary(periodEndEpochMillis = at, totalFrames = total, slowFrames = slow, peakMemoryBytes = peak)

    @Test fun `le taux de hitch est nul sans image et sinon lentes sur mesurees`() {
        assertThat(summary(0).slowFrameRatio).isNull()
        assertThat(summary(0, total = 200, slow = 10).slowFrameRatio).isEqualTo(0.05)
    }

    @Test fun `la retention borne a 30 et ecarte le plus ancien`() {
        val stored = (0 until 30).map { summary(it * day) }
        val result = PayloadSummary.retain(stored, listOf(summary(30 * day)))
        assertThat(result).hasSize(30)
        assertThat(result.first().periodEndEpochMillis).isEqualTo(day)
        assertThat(result.last().periodEndEpochMillis).isEqualTo(30 * day)
    }

    @Test fun `deux resumes du meme jour se fusionnent`() {
        val result = PayloadSummary.retain(
            listOf(summary(10, total = 100, slow = 5, peak = 50)),
            listOf(summary(20, total = 100, slow = 15, peak = 80)),
        )
        assertThat(result).hasSize(1)
        assertThat(result[0].totalFrames).isEqualTo(200)
        assertThat(result[0].slowFrames).isEqualTo(20)
        assertThat(result[0].peakMemoryBytes).isEqualTo(80)
        assertThat(result[0].periodEndEpochMillis).isEqualTo(20)
    }

    @Test fun `une categorie inconnue est ignoree et l'horloge est celle de l'appelant`() {
        val inputs = listOf(
            SignpostInput("TimelineEngine", "play", 3, 0.5, 0.1),
            SignpostInput("http", "call", 9, null),
            SignpostInput("ReelSwitch", "swipe", 1, null),
        )
        val out = TrackedSignpostAggregate.fromInputs(inputs, TrackedSignpostAggregate.MediaCategories, 42L)
        assertThat(out.map { it.category }).containsExactly("TimelineEngine", "ReelSwitch").inOrder()
        assertThat(out.all { it.receivedAtEpochMillis == 42L }).isTrue()
    }

    @Test fun `le tally cumule comptes cpu et temps hors budget`() {
        val budget = SignpostTally.HITCH_BUDGET_NANOS
        val tally = SignpostTally().record(budget, 1_000_000_000).record(budget * 2, 0)
        val input = tally.toInput("TimelineEngine", "play")
        assertThat(input.totalCount).isEqualTo(2)
        assertThat(input.cumulativeCpuTimeSeconds).isEqualTo(1.0)
        assertThat(input.hitchTimeRatio).isWithin(1e-9).of(1.0 / 3.0)
    }
}
