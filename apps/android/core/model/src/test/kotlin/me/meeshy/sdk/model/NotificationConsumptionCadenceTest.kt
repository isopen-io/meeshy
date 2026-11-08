package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class NotificationConsumptionCadenceTest {

    @Test
    fun `the first request of a key may start`() {
        assertThat(NotificationConsumptionCadence().tryBegin("conversation:a", now = 0)).isTrue()
    }

    @Test
    fun `two requests are never in flight for the same key`() {
        val cadence = NotificationConsumptionCadence()
        cadence.tryBegin("conversation:a", now = 0)

        assertThat(cadence.tryBegin("conversation:a", now = 10)).isFalse()
    }

    @Test
    fun `another key is independent`() {
        val cadence = NotificationConsumptionCadence()
        cadence.tryBegin("conversation:a", now = 0)

        assertThat(cadence.tryBegin("conversation:b", now = 0)).isTrue()
        assertThat(cadence.tryBegin("post:a", now = 0)).isTrue()
    }

    @Test
    fun `a finished request opens a five second window`() {
        val cadence = NotificationConsumptionCadence()
        cadence.tryBegin("post:p", now = 0)
        cadence.finish("post:p", now = 100, stamp = true)

        assertThat(cadence.tryBegin("post:p", now = 5_099)).isFalse()
        assertThat(cadence.tryBegin("post:p", now = 5_100)).isTrue()
    }

    @Test
    fun `a failed request leaves the key immediately retryable`() {
        val cadence = NotificationConsumptionCadence()
        cadence.tryBegin("post:p", now = 0)
        cadence.finish("post:p", now = 100, stamp = false)

        assertThat(cadence.tryBegin("post:p", now = 101)).isTrue()
    }

    @Test
    fun `stale stamps are pruned and never block`() {
        val cadence = NotificationConsumptionCadence()
        cadence.tryBegin("a", now = 0)
        cadence.finish("a", now = 0, stamp = true)
        cadence.tryBegin("b", now = 10_000)
        cadence.finish("b", now = 10_000, stamp = true)

        assertThat(cadence.tryBegin("a", now = 10_001)).isTrue()
    }

    @Test
    fun `clear forgets in flight keys and windows`() {
        val cadence = NotificationConsumptionCadence()
        cadence.tryBegin("a", now = 0)

        cadence.clear()

        assertThat(cadence.tryBegin("a", now = 1)).isTrue()
    }
}
