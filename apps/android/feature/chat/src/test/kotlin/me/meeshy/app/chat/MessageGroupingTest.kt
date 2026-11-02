package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import java.time.ZoneOffset
import org.junit.Test

class MessageGroupingTest {

    private val hour = 60 * 60 * 1000L

    private fun msg(
        id: String,
        senderId: String? = "u1",
        isOutgoing: Boolean = false,
        at: Long? = 0L,
        isSystem: Boolean = false,
    ) = MessageGroupInput(
        id = id,
        senderId = senderId,
        isOutgoing = isOutgoing,
        createdAtMillis = at,
        isSystem = isSystem,
    )

    private fun positionsFor(vararg messages: MessageGroupInput) =
        MessageGrouping.positions(messages.toList(), ZoneOffset.UTC)

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
    fun same_sender_across_midnight_starts_a_new_group() {
        val positions = positionsFor(
            msg("m1", senderId = "u1", at = 23 * hour),
            msg("m2", senderId = "u1", at = 25 * hour),
        )

        assertThat(positions.getValue("m1").isStandalone).isTrue()
        assertThat(positions.getValue("m2").isStandalone).isTrue()
    }

    @Test
    fun same_sender_hours_apart_on_the_same_day_still_groups() {
        // iOS n'a pas de fenêtre de 5 min : seul le jour calendaire coupe une suite.
        val positions = positionsFor(
            msg("m1", senderId = "u1", at = 1 * hour),
            msg("m2", senderId = "u1", at = 20 * hour),
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
    fun the_day_boundary_follows_the_given_zone() {
        // 23 h et 01 h UTC tombent le même jour à UTC-3 (20 h et 22 h).
        val positions = MessageGrouping.positions(
            listOf(
                msg("m1", senderId = "u1", at = 23 * hour),
                msg("m2", senderId = "u1", at = 25 * hour),
            ),
            ZoneOffset.ofHours(-3),
        )

        assertThat(positions.getValue("m1").isLastInGroup).isFalse()
        assertThat(positions.getValue("m2").isFirstInGroup).isFalse()
    }

    @Test
    fun an_out_of_order_timestamp_on_the_same_day_still_groups() {
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

    // A system message ("X joined the conversation") is written with the
    // arriver as its author. Grouping on sender id alone would fold the
    // newcomer's first real bubble into their own join notice's run. A system
    // message is never a turn at talk: it always stands alone, and it never
    // extends into a neighbour either as predecessor or successor.

    @Test
    fun a_system_message_never_continues_the_previous_same_sender_message() {
        val positions = positionsFor(
            msg("m1", senderId = "u1", at = 0L),
            msg("m2", senderId = "u1", at = 1_000L, isSystem = true),
        )

        assertThat(positions.getValue("m1").isLastInGroup).isTrue()
        assertThat(positions.getValue("m2").isStandalone).isTrue()
    }

    @Test
    fun a_system_message_never_lets_the_next_same_sender_message_continue_it() {
        val positions = positionsFor(
            msg("m1", senderId = "u1", at = 0L, isSystem = true),
            msg("m2", senderId = "u1", at = 1_000L),
        )

        assertThat(positions.getValue("m1").isStandalone).isTrue()
        assertThat(positions.getValue("m2").isFirstInGroup).isTrue()
    }

    @Test
    fun two_system_messages_from_the_same_sender_never_group_with_each_other() {
        val positions = positionsFor(
            msg("m1", senderId = "u1", at = 0L, isSystem = true),
            msg("m2", senderId = "u1", at = 1_000L, isSystem = true),
        )

        assertThat(positions.getValue("m1").isStandalone).isTrue()
        assertThat(positions.getValue("m2").isStandalone).isTrue()
    }

    @Test
    fun a_join_notice_never_groups_with_the_newcomers_own_first_bubble_even_when_it_concerns_the_reader() {
        // The join notice can concern the reader themself (isOutgoing = true) —
        // isSystem is an orthogonal mark, never a stand-in for isOutgoing.
        val positions = positionsFor(
            msg("m1", senderId = "me", isOutgoing = true, at = 0L, isSystem = true),
            msg("m2", senderId = "me", isOutgoing = true, at = 1_000L),
        )

        assertThat(positions.getValue("m1").isStandalone).isTrue()
        assertThat(positions.getValue("m2").isFirstInGroup).isTrue()
    }
}
