package me.meeshy.app.metrics

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.metrics.PayloadSummary
import me.meeshy.sdk.model.metrics.SignpostInput
import org.junit.Test

class MetricsSummaryStoreTest {
    private val day = 86_400_000L

    private class Memory : MetricsPersistence {
        var value: String? = null
        override fun read() = value
        override fun write(value: String) { this.value = value }
    }

    private fun store(memory: Memory = Memory(), now: Long = 1_000L) = MetricsSummaryStore(memory, { now })

    @Test fun `la retention garde 30 resumes et ecarte le plus ancien`() {
        val store = store()
        (0..30).forEach { store.consume(listOf(PayloadSummary(periodEndEpochMillis = it * day))) }
        assertThat(store.payloadSummaries).hasSize(30)
        assertThat(store.payloadSummaries.first().periodEndEpochMillis).isEqualTo(day)
    }

    @Test fun `un meme jour consomme deux fois ne produit qu'un resume`() {
        val store = store()
        store.consume(listOf(PayloadSummary(10, totalFrames = 5)))
        store.consume(listOf(PayloadSummary(20, totalFrames = 5)))
        assertThat(store.payloadSummaries).hasSize(1)
        assertThat(store.payloadSummaries[0].totalFrames).isEqualTo(10)
    }

    @Test fun `les agregats portent l'horloge injectee et ignorent les categories inconnues`() {
        val store = store(now = 777L)
        val kept = store.consume(
            listOf(SignpostInput("TimelineEngine", "play", 2, 0.1), SignpostInput("http", "x", 1, null)),
        )
        assertThat(kept).isEqualTo(1)
        assertThat(store.aggregates.single().receivedAtEpochMillis).isEqualTo(777L)
    }

    @Test fun `l'etat survit a une relecture du stockage local`() {
        val memory = Memory()
        store(memory).consume(listOf(PayloadSummary(5, totalFrames = 3)))
        assertThat(store(memory).payloadSummaries.single().totalFrames).isEqualTo(3)
    }

    @Test fun `reset vide tout`() {
        val store = store()
        store.consume(listOf(PayloadSummary(5)))
        store.reset()
        assertThat(store.payloadSummaries).isEmpty()
    }
}
