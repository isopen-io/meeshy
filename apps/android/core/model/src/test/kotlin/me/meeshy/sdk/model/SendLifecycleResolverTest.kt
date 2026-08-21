package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SendLifecycleResolverTest {

    @Test
    fun `a pending message with a live connection is in flight`() {
        assertThat(
            SendLifecycleResolver.resolve(isPending = true, isFailed = false, isOffline = false),
        ).isEqualTo(SendLifecycle.InFlight)
    }

    @Test
    fun `a pending message while offline is queued in the outbox`() {
        assertThat(
            SendLifecycleResolver.resolve(isPending = true, isFailed = false, isOffline = true),
        ).isEqualTo(SendLifecycle.QueuedOffline)
    }

    @Test
    fun `a failure wins over an in-flight send`() {
        assertThat(
            SendLifecycleResolver.resolve(isPending = true, isFailed = true, isOffline = false),
        ).isEqualTo(SendLifecycle.Failed)
    }

    @Test
    fun `a failure wins over the offline queue`() {
        assertThat(
            SendLifecycleResolver.resolve(isPending = true, isFailed = true, isOffline = true),
        ).isEqualTo(SendLifecycle.Failed)
    }

    @Test
    fun `a settled message is Settled with a live connection`() {
        assertThat(
            SendLifecycleResolver.resolve(isPending = false, isFailed = false, isOffline = false),
        ).isEqualTo(SendLifecycle.Settled)
    }

    @Test
    fun `a settled message stays Settled even while offline`() {
        // The SOTA guard: a message that already reached the server never regresses
        // to the outbox hourglass just because the device later dropped its link.
        assertThat(
            SendLifecycleResolver.resolve(isPending = false, isFailed = false, isOffline = true),
        ).isEqualTo(SendLifecycle.Settled)
    }

    @Test
    fun `a failed message reports Failed even once the connection is back`() {
        assertThat(
            SendLifecycleResolver.resolve(isPending = false, isFailed = true, isOffline = false),
        ).isEqualTo(SendLifecycle.Failed)
    }

    // MARK: - shouldRevealSendingGlyph (online in-flight clock debounce)
    // Port of iOS `BubbleDeliveryCheck.SendingClockGlyph.shouldRevealImmediately`
    // (revealDelay = 0.2s): a send that round-trips under 200ms never flashes a
    // clock icon, but a send that genuinely lingers past the threshold reveals it.

    @Test
    fun `with no send-start time the sending clock reveals immediately`() {
        // A row scrolled into view with no known start (e.g. a restored draft
        // send) has nothing to debounce against — show the glyph, never hide it.
        assertThat(
            SendLifecycleResolver.shouldRevealSendingGlyph(sendStartedAtMillis = null, nowMillis = 10_000L),
        ).isTrue()
    }

    @Test
    fun `a send that just started keeps the clock hidden`() {
        assertThat(
            SendLifecycleResolver.shouldRevealSendingGlyph(sendStartedAtMillis = 10_000L, nowMillis = 10_000L),
        ).isFalse()
    }

    @Test
    fun `a send elapsed 100ms keeps the clock hidden`() {
        assertThat(
            SendLifecycleResolver.shouldRevealSendingGlyph(sendStartedAtMillis = 10_000L, nowMillis = 10_100L),
        ).isFalse()
    }

    @Test
    fun `a send elapsed 199ms still keeps the clock hidden`() {
        // Exclusive lower edge: one millisecond under the threshold is still hidden.
        assertThat(
            SendLifecycleResolver.shouldRevealSendingGlyph(sendStartedAtMillis = 10_000L, nowMillis = 10_199L),
        ).isFalse()
    }

    @Test
    fun `a send elapsed exactly 200ms reveals the clock`() {
        // Inclusive boundary — mirrors iOS `>= revealDelay`.
        assertThat(
            SendLifecycleResolver.shouldRevealSendingGlyph(sendStartedAtMillis = 10_000L, nowMillis = 10_200L),
        ).isTrue()
    }

    @Test
    fun `a send lingering 5 seconds reveals the clock`() {
        assertThat(
            SendLifecycleResolver.shouldRevealSendingGlyph(sendStartedAtMillis = 10_000L, nowMillis = 15_000L),
        ).isTrue()
    }

    @Test
    fun `a start time in the future from clock skew keeps the clock hidden`() {
        // Negative elapsed (device clock skew) is under the threshold — stay hidden
        // rather than flash a glyph for a message that has barely started.
        assertThat(
            SendLifecycleResolver.shouldRevealSendingGlyph(sendStartedAtMillis = 10_500L, nowMillis = 10_000L),
        ).isFalse()
    }

    @Test
    fun `the reveal delay is 200 milliseconds`() {
        assertThat(SendLifecycleResolver.SENDING_REVEAL_DELAY_MILLIS).isEqualTo(200L)
    }
}
