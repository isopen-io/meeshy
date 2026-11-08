package me.meeshy.sdk.outbox

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class OutboxOutcomeRegistryTest {

    private class Probe {
        val received = mutableListOf<OutboxOutcome>()
        var ended = 0
        val observer = OutboxOutcomeRegistry.Observer({ received += it }, { ended++ })
    }

    private fun succeeded(cmid: String) = OutboxOutcome.Succeeded(cmid)

    @Test
    fun `a late subscriber receives the outcome published before it subscribed`() {
        val registry = OutboxOutcomeRegistry()
        registry.publish(succeeded("m1"))

        val subscription = registry.subscribe("m1", Probe().observer)

        assertThat(subscription).isEqualTo(OutboxOutcomeRegistry.Subscription.Fired(succeeded("m1")))
        assertThat(registry.observedCount).isEqualTo(0)
    }

    @Test
    fun `publishing serves every observer of the cmid once and empties the slot`() {
        val registry = OutboxOutcomeRegistry()
        val first = Probe()
        val second = Probe()
        registry.subscribe("m1", first.observer)
        registry.subscribe("m1", second.observer)

        registry.publish(succeeded("m1"))

        assertThat(first.received).containsExactly(succeeded("m1"))
        assertThat(second.received).containsExactly(succeeded("m1"))
        assertThat(registry.observedCount).isEqualTo(0)
    }

    @Test
    fun `dropping one token leaves the other observers of the same cmid served`() {
        val registry = OutboxOutcomeRegistry()
        val cancelled = Probe()
        val kept = Probe()
        val token = (registry.subscribe("m1", cancelled.observer) as OutboxOutcomeRegistry.Subscription.Registered).token
        registry.subscribe("m1", kept.observer)

        registry.drop("m1", token)
        registry.publish(succeeded("m1"))

        assertThat(cancelled.received).isEmpty()
        assertThat(kept.received).containsExactly(succeeded("m1"))
    }

    @Test
    fun `dropping is idempotent and forgets an empty slot`() {
        val registry = OutboxOutcomeRegistry()
        val token = (registry.subscribe("m1", Probe().observer) as OutboxOutcomeRegistry.Subscription.Registered).token

        registry.drop("m1", token)
        registry.drop("m1", token)

        assertThat(registry.observedCount).isEqualTo(0)
    }

    @Test
    fun `tombstones are bounded FIFO and the oldest outcome is the one forgotten`() {
        val registry = OutboxOutcomeRegistry(tombstoneCapacity = 3)
        listOf("a", "b", "c", "d").forEach { registry.publish(succeeded(it)) }

        assertThat(registry.firedOutcome("a")).isNull()
        assertThat(registry.firedOutcome("b")).isEqualTo(succeeded("b"))
        assertThat(registry.firedOutcome("d")).isEqualTo(succeeded("d"))
        assertThat(registry.tombstoneCount).isEqualTo(3)
    }

    @Test
    fun `republishing a cmid refreshes its place in the FIFO`() {
        val registry = OutboxOutcomeRegistry(tombstoneCapacity = 2)
        registry.publish(succeeded("a"))
        registry.publish(succeeded("b"))
        registry.publish(OutboxOutcome.Exhausted("a", "x"))
        registry.publish(succeeded("c"))

        assertThat(registry.firedOutcome("b")).isNull()
        assertThat(registry.firedOutcome("a")).isEqualTo(OutboxOutcome.Exhausted("a", "x"))
    }

    @Test
    fun `forgetting a cmid re-arms it so a new subscriber waits instead of reading the stale failure`() {
        val registry = OutboxOutcomeRegistry()
        registry.publish(OutboxOutcome.Exhausted("m1", "boom"))

        registry.forget("m1")

        assertThat(registry.subscribe("m1", Probe().observer))
            .isInstanceOf(OutboxOutcomeRegistry.Subscription.Registered::class.java)
    }

    @Test
    fun `ending a cmid finishes its observers without an outcome`() {
        val registry = OutboxOutcomeRegistry()
        val probe = Probe()
        registry.subscribe("m1", probe.observer)

        registry.end("m1")

        assertThat(probe.received).isEmpty()
        assertThat(probe.ended).isEqualTo(1)
        assertThat(registry.observedCount).isEqualTo(0)
    }

    @Test
    fun `reset drops the tombstones of a session and ends the observers`() {
        val registry = OutboxOutcomeRegistry()
        registry.publish(succeeded("old"))
        val probe = Probe()
        registry.subscribe("m1", probe.observer)

        registry.reset()

        assertThat(registry.firedOutcome("old")).isNull()
        assertThat(probe.ended).isEqualTo(1)
    }
}
