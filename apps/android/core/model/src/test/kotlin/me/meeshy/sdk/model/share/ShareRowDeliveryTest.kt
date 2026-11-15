package me.meeshy.sdk.model.share

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ShareRowDeliveryTest {
    private val failed = ShareDelivery.Failed(ShareFailure.GENERIC)

    @Test
    fun `idle starts sending and a failure can be retried`() {
        assertThat(ShareRowDelivery.next(null, ShareRowDelivery.Event.Begin)).isEqualTo(ShareDelivery.Sending)
        assertThat(ShareRowDelivery.next(failed, ShareRowDelivery.Event.Begin)).isEqualTo(ShareDelivery.Sending)
    }

    @Test
    fun `a sending row ends sent, queued offline or failed`() {
        assertThat(ShareRowDelivery.next(ShareDelivery.Sending, ShareRowDelivery.Event.Served(queued = false))).isEqualTo(ShareDelivery.Sent)
        assertThat(ShareRowDelivery.next(ShareDelivery.Sending, ShareRowDelivery.Event.Served(queued = true))).isEqualTo(ShareDelivery.Queued)
        assertThat(ShareRowDelivery.next(ShareDelivery.Sending, ShareRowDelivery.Event.Failed(ShareFailure.UNREACHABLE)))
            .isEqualTo(ShareDelivery.Failed(ShareFailure.UNREACHABLE))
    }

    @Test
    fun `a served row never starts again and never regresses`() {
        listOf(ShareDelivery.Sent, ShareDelivery.Queued, ShareDelivery.Sending).forEach { current ->
            assertThat(ShareRowDelivery.next(current, ShareRowDelivery.Event.Begin)).isEqualTo(current)
        }
        listOf(ShareDelivery.Sent, ShareDelivery.Queued).forEach { current ->
            assertThat(ShareRowDelivery.next(current, ShareRowDelivery.Event.Failed(ShareFailure.GENERIC))).isEqualTo(current)
            assertThat(ShareRowDelivery.next(current, ShareRowDelivery.Event.Served(queued = false))).isEqualTo(current)
        }
    }

    @Test
    fun `an outcome without a begin is ignored`() {
        assertThat(ShareRowDelivery.next(null, ShareRowDelivery.Event.Served(queued = false))).isNull()
        assertThat(ShareRowDelivery.next(null, ShareRowDelivery.Event.Failed(ShareFailure.GENERIC))).isNull()
    }

    @Test
    fun `only a failure shows the retry and only idle or failed rows are retryable`() {
        assertThat(ShareRowDelivery.isRetryable(failed)).isTrue()
        assertThat(ShareRowDelivery.isRetryable(null)).isTrue()
        assertThat(ShareRowDelivery.isRetryable(ShareDelivery.Sending)).isFalse()
        assertThat(ShareRowDelivery.isRetryable(ShareDelivery.Sent)).isFalse()
        assertThat(ShareRowDelivery.isRetryable(ShareDelivery.Queued)).isFalse()
    }
}
