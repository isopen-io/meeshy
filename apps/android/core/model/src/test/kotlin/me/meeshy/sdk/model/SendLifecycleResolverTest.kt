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
}
