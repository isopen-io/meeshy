package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * The pure sender-side delivery resolver — port of the iOS `DeliveryStatusResolver`.
 * The contract: honest, all-or-nothing group checks that never over-report, with a
 * `> 0` fallback for 1:1 and unambiguous "all" markers that win over the counts.
 */
class DeliveryStatusResolverTest {

    // ----- send-cycle passthrough -----

    @Test
    fun pending_base_is_returned_verbatim_ignoring_counts() {
        val state = DeliveryStatusResolver.resolve(
            base = DeliveryState.Pending,
            deliveredCount = 9,
            readCount = 9,
            recipientCount = 1,
        )

        assertThat(state).isEqualTo(DeliveryState.Pending)
    }

    @Test
    fun failed_base_is_returned_verbatim_ignoring_counts() {
        val state = DeliveryStatusResolver.resolve(
            base = DeliveryState.Failed,
            deliveredCount = 5,
            readCount = 5,
            recipientCount = 3,
            readByAllAt = "2026-07-06T00:00:00Z",
        )

        assertThat(state).isEqualTo(DeliveryState.Failed)
    }

    // ----- 1:1 / unknown denominator (recipientCount <= 1) -----

    @Test
    fun direct_chat_read_when_any_read() {
        assertThat(
            DeliveryStatusResolver.resolve(DeliveryState.Sent, deliveredCount = 1, readCount = 1, recipientCount = 1),
        ).isEqualTo(DeliveryState.Read)
    }

    @Test
    fun direct_chat_delivered_when_delivered_but_unread() {
        assertThat(
            DeliveryStatusResolver.resolve(DeliveryState.Sent, deliveredCount = 1, readCount = 0, recipientCount = 1),
        ).isEqualTo(DeliveryState.Delivered)
    }

    @Test
    fun direct_chat_sent_when_no_receipts() {
        assertThat(
            DeliveryStatusResolver.resolve(DeliveryState.Sent, deliveredCount = 0, readCount = 0, recipientCount = 1),
        ).isEqualTo(DeliveryState.Sent)
    }

    @Test
    fun zero_recipient_count_is_treated_as_unknown_denominator() {
        // recipientCount 0 (denominator not yet known) must not divide-by-zero into
        // a false negative — it trusts the > 0 threshold like a 1:1.
        assertThat(
            DeliveryStatusResolver.resolve(DeliveryState.Sent, deliveredCount = 2, readCount = 0, recipientCount = 0),
        ).isEqualTo(DeliveryState.Delivered)
    }

    // ----- group all-or-nothing -----

    @Test
    fun group_partial_read_stays_below_read() {
        // 2 of 3 recipients read → NOT "read by all". Delivered is also partial → Sent.
        assertThat(
            DeliveryStatusResolver.resolve(DeliveryState.Sent, deliveredCount = 2, readCount = 2, recipientCount = 3),
        ).isEqualTo(DeliveryState.Sent)
    }

    @Test
    fun group_read_only_when_all_recipients_read() {
        assertThat(
            DeliveryStatusResolver.resolve(DeliveryState.Sent, deliveredCount = 3, readCount = 3, recipientCount = 3),
        ).isEqualTo(DeliveryState.Read)
    }

    @Test
    fun group_delivered_only_when_all_recipients_received() {
        assertThat(
            DeliveryStatusResolver.resolve(DeliveryState.Sent, deliveredCount = 3, readCount = 0, recipientCount = 3),
        ).isEqualTo(DeliveryState.Delivered)
    }

    @Test
    fun group_partial_delivery_is_still_only_sent() {
        assertThat(
            DeliveryStatusResolver.resolve(DeliveryState.Sent, deliveredCount = 2, readCount = 0, recipientCount = 3),
        ).isEqualTo(DeliveryState.Sent)
    }

    @Test
    fun group_read_boundary_off_by_one_is_not_read() {
        // exactly one short of the denominator must not tip to Read.
        assertThat(
            DeliveryStatusResolver.resolve(DeliveryState.Sent, deliveredCount = 4, readCount = 3, recipientCount = 4),
        ).isEqualTo(DeliveryState.Delivered)
    }

    @Test
    fun group_read_wins_over_delivered_when_both_satisfied() {
        assertThat(
            DeliveryStatusResolver.resolve(DeliveryState.Sent, deliveredCount = 4, readCount = 4, recipientCount = 4),
        ).isEqualTo(DeliveryState.Read)
    }

    @Test
    fun a_read_base_downgrades_when_group_counts_are_only_partial() {
        // The anti-lie core: an upstream "Read" is re-resolved and honestly downgraded
        // when the counts show only a partial group read.
        assertThat(
            DeliveryStatusResolver.resolve(DeliveryState.Read, deliveredCount = 1, readCount = 1, recipientCount = 3),
        ).isEqualTo(DeliveryState.Sent)
    }

    // ----- "all" markers win, denominator-independent -----

    @Test
    fun read_by_all_marker_forces_read_regardless_of_counts() {
        assertThat(
            DeliveryStatusResolver.resolve(
                DeliveryState.Sent,
                deliveredCount = 0,
                readCount = 0,
                recipientCount = 5,
                readByAllAt = "2026-07-06T10:00:00Z",
            ),
        ).isEqualTo(DeliveryState.Read)
    }

    @Test
    fun delivered_to_all_marker_forces_delivered_regardless_of_counts() {
        assertThat(
            DeliveryStatusResolver.resolve(
                DeliveryState.Sent,
                deliveredCount = 0,
                readCount = 0,
                recipientCount = 5,
                deliveredToAllAt = "2026-07-06T10:00:00Z",
            ),
        ).isEqualTo(DeliveryState.Delivered)
    }

    @Test
    fun read_by_all_marker_wins_over_delivered_to_all_marker() {
        assertThat(
            DeliveryStatusResolver.resolve(
                DeliveryState.Sent,
                deliveredCount = 0,
                readCount = 0,
                recipientCount = 5,
                deliveredToAllAt = "2026-07-06T10:00:00Z",
                readByAllAt = "2026-07-06T10:00:01Z",
            ),
        ).isEqualTo(DeliveryState.Read)
    }

    // ----- clamping garbage input -----

    @Test
    fun negative_counts_are_clamped_to_sent() {
        assertThat(
            DeliveryStatusResolver.resolve(DeliveryState.Sent, deliveredCount = -4, readCount = -9, recipientCount = 3),
        ).isEqualTo(DeliveryState.Sent)
    }

    // ----- fromCounts entry (live reducer) -----

    @Test
    fun fromCounts_applies_the_same_all_or_nothing_rule() {
        assertThat(
            DeliveryStatusResolver.fromCounts(deliveredCount = 3, readCount = 3, recipientCount = 3),
        ).isEqualTo(DeliveryState.Read)
        assertThat(
            DeliveryStatusResolver.fromCounts(deliveredCount = 2, readCount = 2, recipientCount = 3),
        ).isEqualTo(DeliveryState.Sent)
    }
}
