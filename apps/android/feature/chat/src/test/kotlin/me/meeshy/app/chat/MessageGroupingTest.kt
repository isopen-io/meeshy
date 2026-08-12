package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MessageGroupingTest {

    private val gap = MessageGrouping.DEFAULT_GAP_MILLIS

    private fun msg(
        id: String,
        senderId: String? = "u1",
        isOutgoing: Boolean = false,
        at: Long? = 0L,
    ) = MessageGroupInput(id = id, senderId = senderId, isOutgoing = isOutgoing, createdAtMillis = at)

    private fun positionsFor(vararg messages: MessageGroupInput) =
        MessageGrouping.positions(messages.toList())

    @Test
    fun an_empty_list_produces_no_positions() {
        assertThat(MessageGrouping.positions(emptyList())).isEmpty()
    }

    @Test
    fun a_single_message_is_a_standalone_group() {
        val positions = positionsFor(msg("m1"))

        val p = positions.getValue("m1")
        assertThat(p.isFirstInGroup).isTrue()
        assertThat(p.isLastInGroup).isTrue()
        assertThat(p.isStandalone).isTrue()
    }

    @Test
    fun two_messages_from_the_same_sender_within_the_gap_form_one_group() {
        val positions = positionsFor(
            msg("m1", senderId = "u1", at = 0L),
            msg("m2", senderId = "u1", at = 1_000L),
        )

        assertThat(positions.getValue("m1")).isEqualTo(
            MessageGroupPosition(isFirstInGroup = true, isLastInGroup = false),
        )
        assertThat(positions.getValue("m2")).isEqualTo(
            MessageGroupPosition(isFirstInGroup = false, isLastInGroup = true),
        )
    }

    @Test
    fun same_sender_beyond_the_gap_starts_a_new_group() {
        val positions = positionsFor(
            msg("m1", senderId = "u1", at = 0L),
            msg("m2", senderId = "u1", at = gap + 1L),
        )

        assertThat(positions.getValue("m1").isStandalone).isTrue()
        assertThat(positions.getValue("m2").isStandalone).isTrue()
    }

    @Test
    fun a_gap_exactly_on_the_threshold_still_groups() {
        val positions = positionsFor(
            msg("m1", senderId = "u1", at = 0L),
            msg("m2", senderId = "u1", at = gap),
        )

        assertThat(positions.getValue("m1").isLastInGroup).isFalse()
        assertThat(positions.getValue("m2").isFirstInGroup).isFalse()
    }

    @Test
    fun different_incoming_senders_never_group() {
        val positions = positionsFor(
            msg("m1", senderId = "u1", at = 0L),
            msg("m2", senderId = "u2", at = 1_000L),
        )

        assertThat(positions.getValue("m1").isStandalone).isTrue()
        assertThat(positions.getValue("m2").isStandalone).isTrue()
    }

    @Test
    fun two_outgoing_messages_group_as_the_same_self_sender() {
        val positions = positionsFor(
            msg("m1", senderId = "me", isOutgoing = true, at = 0L),
            msg("m2", senderId = "me", isOutgoing = true, at = 1_000L),
        )

        assertThat(positions.getValue("m1").isFirstInGroup).isTrue()
        assertThat(positions.getValue("m1").isLastInGroup).isFalse()
        assertThat(positions.getValue("m2").isLastInGroup).isTrue()
    }

    @Test
    fun outgoing_followed_by_incoming_breaks_the_group() {
        val positions = positionsFor(
            msg("m1", senderId = "me", isOutgoing = true, at = 0L),
            msg("m2", senderId = "u1", isOutgoing = false, at = 1_000L),
        )

        assertThat(positions.getValue("m1").isStandalone).isTrue()
        assertThat(positions.getValue("m2").isStandalone).isTrue()
    }

    @Test
    fun an_incoming_message_with_no_sender_id_never_groups() {
        val positions = positionsFor(
            msg("m1", senderId = null, at = 0L),
            msg("m2", senderId = null, at = 1_000L),
        )

        assertThat(positions.getValue("m1").isStandalone).isTrue()
        assertThat(positions.getValue("m2").isStandalone).isTrue()
    }

    @Test
    fun a_missing_timestamp_rides_with_the_previous_same_sender_group() {
        val positions = positionsFor(
            msg("m1", senderId = "u1", at = 0L),
            msg("m2", senderId = "u1", at = null),
        )

        assertThat(positions.getValue("m1").isLastInGroup).isFalse()
        assertThat(positions.getValue("m2").isFirstInGroup).isFalse()
        assertThat(positions.getValue("m2").isLastInGroup).isTrue()
    }

    @Test
    fun the_middle_of_a_three_message_run_is_neither_first_nor_last() {
        val positions = positionsFor(
            msg("m1", senderId = "u1", at = 0L),
            msg("m2", senderId = "u1", at = 1_000L),
            msg("m3", senderId = "u1", at = 2_000L),
        )

        assertThat(positions.getValue("m1")).isEqualTo(
            MessageGroupPosition(isFirstInGroup = true, isLastInGroup = false),
        )
        assertThat(positions.getValue("m2")).isEqualTo(
            MessageGroupPosition(isFirstInGroup = false, isLastInGroup = false),
        )
        assertThat(positions.getValue("m3")).isEqualTo(
            MessageGroupPosition(isFirstInGroup = false, isLastInGroup = true),
        )
    }

    @Test
    fun a_sender_change_in_the_middle_splits_two_runs() {
        val positions = positionsFor(
            msg("a1", senderId = "u1", at = 0L),
            msg("a2", senderId = "u1", at = 1_000L),
            msg("b1", senderId = "u2", at = 2_000L),
        )

        assertThat(positions.getValue("a1").isFirstInGroup).isTrue()
        assertThat(positions.getValue("a2").isLastInGroup).isTrue()
        assertThat(positions.getValue("b1").isStandalone).isTrue()
    }

    @Test
    fun a_custom_gap_overrides_the_default() {
        val tightGap = 500L
        val positions = MessageGrouping.positions(
            listOf(
                msg("m1", senderId = "u1", at = 0L),
                msg("m2", senderId = "u1", at = 1_000L),
            ),
            gapMillis = tightGap,
        )

        assertThat(positions.getValue("m1").isStandalone).isTrue()
        assertThat(positions.getValue("m2").isStandalone).isTrue()
    }

    @Test
    fun an_out_of_order_timestamp_uses_the_absolute_delta() {
        val positions = positionsFor(
            msg("m1", senderId = "u1", at = 5_000L),
            msg("m2", senderId = "u1", at = 4_000L),
        )

        assertThat(positions.getValue("m1").isLastInGroup).isFalse()
        assertThat(positions.getValue("m2").isFirstInGroup).isFalse()
    }

    @Test
    fun positions_are_keyed_by_message_id_for_every_message() {
        val positions = positionsFor(
            msg("m1", senderId = "u1", at = 0L),
            msg("m2", senderId = "u2", at = 1_000L),
            msg("m3", senderId = "u2", at = 2_000L),
        )

        assertThat(positions.keys).containsExactly("m1", "m2", "m3")
    }
}
