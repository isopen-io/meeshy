package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Pure delivery-tier resolution — the single source of truth the sender's own
 * bubble uses to pick ✓ (sent) / ✓✓ (delivered) / ✓✓ read. Port of the iOS
 * `MeeshySDK.DeliveryStatusResolver`, applying WhatsApp-style **all-or-nothing**
 * group semantics: in a group the delivered / read tier lights up only once
 * EVERY recipient has received / read the message, never on the first peer.
 *
 * The send lifecycle (pending / failed) is decided upstream — this resolver only
 * concerns the received/read promotion.
 */
class DeliveryStatusResolverTest {

    // ---- direct conversation / unknown denominator (recipientCount <= 1) ----

    @Test
    fun a_direct_message_no_one_received_is_sent() {
        val tier = DeliveryStatusResolver.resolve(
            deliveredCount = 0,
            readCount = 0,
            recipientCount = 1,
        )

        assertThat(tier).isEqualTo(DeliveryTier.Sent)
    }

    @Test
    fun a_direct_message_the_single_peer_received_is_delivered() {
        val tier = DeliveryStatusResolver.resolve(
            deliveredCount = 1,
            readCount = 0,
            recipientCount = 1,
        )

        assertThat(tier).isEqualTo(DeliveryTier.Delivered)
    }

    @Test
    fun a_direct_message_the_single_peer_read_is_read() {
        val tier = DeliveryStatusResolver.resolve(
            deliveredCount = 1,
            readCount = 1,
            recipientCount = 1,
        )

        assertThat(tier).isEqualTo(DeliveryTier.Read)
    }

    @Test
    fun an_unknown_denominator_falls_back_to_any_recipient_semantics() {
        val delivered = DeliveryStatusResolver.resolve(
            deliveredCount = 1,
            readCount = 0,
            recipientCount = 0,
        )
        val read = DeliveryStatusResolver.resolve(
            deliveredCount = 3,
            readCount = 2,
            recipientCount = 0,
        )

        assertThat(delivered).isEqualTo(DeliveryTier.Delivered)
        assertThat(read).isEqualTo(DeliveryTier.Read)
    }

    @Test
    fun a_direct_read_by_all_marker_reads_even_without_a_count() {
        val tier = DeliveryStatusResolver.resolve(
            deliveredCount = 0,
            readCount = 0,
            recipientCount = 1,
            readByAllAt = "2026-07-06T10:00:00Z",
        )

        assertThat(tier).isEqualTo(DeliveryTier.Read)
    }

    @Test
    fun a_direct_delivered_to_all_marker_delivers_even_without_a_count() {
        val tier = DeliveryStatusResolver.resolve(
            deliveredCount = 0,
            readCount = 0,
            recipientCount = 1,
            deliveredToAllAt = "2026-07-06T10:00:00Z",
        )

        assertThat(tier).isEqualTo(DeliveryTier.Delivered)
    }

    // ---- group conversation (recipientCount > 1) ---------------------------

    @Test
    fun a_group_message_only_one_of_many_read_stays_sent() {
        val tier = DeliveryStatusResolver.resolve(
            deliveredCount = 1,
            readCount = 1,
            recipientCount = 4,
        )

        assertThat(tier).isEqualTo(DeliveryTier.Sent)
    }

    @Test
    fun a_group_message_all_received_none_read_is_delivered() {
        val tier = DeliveryStatusResolver.resolve(
            deliveredCount = 4,
            readCount = 0,
            recipientCount = 4,
        )

        assertThat(tier).isEqualTo(DeliveryTier.Delivered)
    }

    @Test
    fun a_group_message_partially_delivered_stays_sent() {
        val tier = DeliveryStatusResolver.resolve(
            deliveredCount = 3,
            readCount = 0,
            recipientCount = 4,
        )

        assertThat(tier).isEqualTo(DeliveryTier.Sent)
    }

    @Test
    fun a_group_message_all_read_is_read() {
        val tier = DeliveryStatusResolver.resolve(
            deliveredCount = 4,
            readCount = 4,
            recipientCount = 4,
        )

        assertThat(tier).isEqualTo(DeliveryTier.Read)
    }

    @Test
    fun a_group_message_all_read_but_stale_delivered_counter_still_reads() {
        val tier = DeliveryStatusResolver.resolve(
            deliveredCount = 2,
            readCount = 4,
            recipientCount = 4,
        )

        assertThat(tier).isEqualTo(DeliveryTier.Read)
    }

    @Test
    fun a_group_read_by_all_marker_reads_ahead_of_the_counter() {
        val tier = DeliveryStatusResolver.resolve(
            deliveredCount = 4,
            readCount = 1,
            recipientCount = 4,
            readByAllAt = "2026-07-06T10:00:00Z",
        )

        assertThat(tier).isEqualTo(DeliveryTier.Read)
    }

    @Test
    fun a_group_delivered_to_all_marker_delivers_ahead_of_the_counter() {
        val tier = DeliveryStatusResolver.resolve(
            deliveredCount = 1,
            readCount = 0,
            recipientCount = 4,
            deliveredToAllAt = "2026-07-06T10:00:00Z",
        )

        assertThat(tier).isEqualTo(DeliveryTier.Delivered)
    }

    @Test
    fun a_group_message_no_one_received_is_sent() {
        val tier = DeliveryStatusResolver.resolve(
            deliveredCount = 0,
            readCount = 0,
            recipientCount = 4,
        )

        assertThat(tier).isEqualTo(DeliveryTier.Sent)
    }

    @Test
    fun a_read_by_all_marker_wins_over_a_delivered_to_all_marker() {
        val tier = DeliveryStatusResolver.resolve(
            deliveredCount = 0,
            readCount = 0,
            recipientCount = 4,
            deliveredToAllAt = "2026-07-06T10:00:00Z",
            readByAllAt = "2026-07-06T10:05:00Z",
        )

        assertThat(tier).isEqualTo(DeliveryTier.Read)
    }
}
