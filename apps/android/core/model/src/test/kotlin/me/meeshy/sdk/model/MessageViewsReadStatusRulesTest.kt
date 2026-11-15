package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MessageViewsReadStatusRules.MessageDeliveryCounts
import me.meeshy.sdk.model.MessageViewsReadStatusRules.ReadStatusTally
import org.junit.Test

class MessageViewsReadStatusRulesTest {
    private val rules = MessageViewsReadStatusRules

    @Test fun `cold open fetches`() =
        assertThat(rules.shouldFetch(hasExisting = false, isLoading = false, force = false, hasServerId = true)).isTrue()

    @Test fun `existing data without force does not refetch`() =
        assertThat(rules.shouldFetch(true, false, false, true)).isFalse()

    @Test fun `force refetches existing data`() = assertThat(rules.shouldFetch(true, false, true, true)).isTrue()

    @Test fun `no concurrent fetch, even forced`() = assertThat(rules.shouldFetch(false, true, true, true)).isFalse()

    @Test fun `no server id never fetches`() = assertThat(rules.shouldFetch(false, false, true, false)).isFalse()

    @Test fun `spinner only on cold start`() {
        assertThat(rules.showsSpinner(isLoading = true, hasExisting = false)).isTrue()
        assertThat(rules.showsSpinner(isLoading = true, hasExisting = true)).isFalse()
        assertThat(rules.showsSpinner(isLoading = false, hasExisting = false)).isFalse()
    }

    private fun level(
        lifecycle: SendLifecycle = SendLifecycle.Settled,
        message: MessageDeliveryCounts = MessageDeliveryCounts(),
        tally: ReadStatusTally? = null,
        receipts: Boolean = true,
    ) = rules.deliveryStatusLevel(lifecycle, message, tally, receipts)

    @Test fun `lifecycle maps to failed and sending levels`() {
        assertThat(level(SendLifecycle.Failed)).isEqualTo(-1)
        assertThat(level(SendLifecycle.InFlight)).isEqualTo(0)
        assertThat(level(SendLifecycle.QueuedOffline)).isEqualTo(0)
    }

    @Test fun `settled with nothing is sent`() = assertThat(level()).isEqualTo(1)

    @Test fun `server tally replaces an unknown message denominator`() {
        val msg = MessageDeliveryCounts(recipientCount = 0, deliveredCount = 1, readCount = 1)
        assertThat(level(message = msg)).isEqualTo(3)
        assertThat(level(message = msg, tally = ReadStatusTally(recipientCount = 10, deliveredCount = 4, readCount = 1)))
            .isEqualTo(1)
    }

    @Test fun `group read only when everybody read`() {
        assertThat(level(tally = ReadStatusTally(3, 3, 3))).isEqualTo(3)
        assertThat(level(tally = ReadStatusTally(3, 3, 2))).isEqualTo(2)
    }

    @Test fun `hidden receipts mask read`() =
        assertThat(level(tally = ReadStatusTally(1, 1, 1), receipts = false)).isEqualTo(2)

    @Test fun `badge follows the level`() {
        assertThat((-1..4).map { MessageViewsDeliveryBadge.fromLevel(it) }).containsExactly(
            MessageViewsDeliveryBadge.Failed, MessageViewsDeliveryBadge.Sending, MessageViewsDeliveryBadge.Sent,
            MessageViewsDeliveryBadge.Delivered, MessageViewsDeliveryBadge.Read, MessageViewsDeliveryBadge.Failed,
        ).inOrder()
    }
}
