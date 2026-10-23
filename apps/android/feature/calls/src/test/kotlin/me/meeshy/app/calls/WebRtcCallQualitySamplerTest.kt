package me.meeshy.app.calls

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.call.CallQualityStatsFeed
import me.meeshy.sdk.model.call.CallStats
import org.junit.Test

class WebRtcCallQualitySamplerTest {
    private val feed = CallQualityStatsFeed()
    private val clock = object : CallClock {
        var now = 0L
        override fun nowMs() = now.also { now += 5_000L }
    }

    private fun sampler(vararg readings: CallStats?): WebRtcCallQualitySampler {
        val queue = ArrayDeque(readings.toList())
        return WebRtcCallQualitySampler({ queue.removeFirstOrNull() }, feed, clock, intervalMs = 5_000L)
    }

    @Test
    fun `une lecture toutes les cinq secondes, la perte est celle de l'intervalle`() = runTest {
        val first = CallStats(roundTripTimeMs = 40.0, packetsLost = 10, inboundPacketsReceived = 90, bandwidth = 1_000, bytesReceived = 2_000)
        val second = CallStats(roundTripTimeMs = 50.0, packetsLost = 10, inboundPacketsReceived = 190, bandwidth = 3_000, bytesReceived = 6_000, jitterMs = 7.0)
        sampler(first, second).samples.test {
            advanceTimeBy(4_999)
            expectNoEvents()
            advanceTimeBy(1)
            runCurrent()
            assertThat(awaitItem().packetLoss).isWithin(1e-9).of(0.1)
            advanceTimeBy(5_000)
            runCurrent()
            val sample = awaitItem()
            assertThat(sample.packetLoss).isEqualTo(0.0)
            assertThat(sample.jitterMs).isEqualTo(7.0)
            assertThat(sample.bytesReceived).isEqualTo(6_000L)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `une lecture manquante saute le tick sans interrompre le flux`() = runTest {
        sampler(null, CallStats(roundTripTimeMs = 30.0)).samples.test {
            advanceTimeBy(10_000)
            runCurrent()
            assertThat(awaitItem().rttMs).isEqualTo(30.0)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `le relais reçoit la lecture puis l'efface quand la collecte s'arrête`() = runTest {
        sampler(CallStats(roundTripTimeMs = 30.0, relayed = true)).samples.test {
            advanceTimeBy(5_000)
            runCurrent()
            awaitItem()
            assertThat(feed.readings.value?.relayed).isTrue()
            cancelAndIgnoreRemainingEvents()
        }
        assertThat(feed.readings.value).isNull()
    }
}
