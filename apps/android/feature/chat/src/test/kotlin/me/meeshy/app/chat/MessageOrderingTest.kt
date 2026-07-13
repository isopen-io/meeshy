package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for [MessageOrdering] — the pure per-conversation ordering
 * SSOT. Every case drives the public API and asserts the resulting order (or the
 * preservation of it), never an internal detail. Timestamps are chosen so each
 * comparator branch (present vs absent `createdAtMillis`, present vs absent
 * `seq`, tie → stable input order) is exercised on both sides.
 */
class MessageOrderingTest {

    private data class Msg(val id: String, val at: Long?, val seq: Long? = null)

    private fun order(vararg msgs: Msg): List<String> =
        MessageOrdering.order(msgs.toList()) { MessageOrderInput(it.at, it.seq) }.map { it.id }

    @Test
    fun empty_list_orders_to_empty() {
        assertThat(MessageOrdering.order(emptyList<Msg>()) { MessageOrderInput(it.at, it.seq) })
            .isEmpty()
    }

    @Test
    fun single_message_is_returned_unchanged() {
        assertThat(order(Msg("m1", at = 100L))).containsExactly("m1")
    }

    @Test
    fun a_list_already_ascending_by_time_keeps_its_order() {
        assertThat(order(Msg("a", 100L), Msg("b", 200L), Msg("c", 300L)))
            .containsExactly("a", "b", "c")
            .inOrder()
    }

    @Test
    fun a_list_reversed_by_time_is_re_sorted_oldest_first() {
        assertThat(order(Msg("c", 300L), Msg("b", 200L), Msg("a", 100L)))
            .containsExactly("a", "b", "c")
            .inOrder()
    }

    @Test
    fun an_out_of_order_arrival_is_placed_by_its_timestamp_not_its_position() {
        // "late" arrived last over the socket but its timestamp is oldest.
        assertThat(order(Msg("mid", 200L), Msg("new", 300L), Msg("late", 100L)))
            .containsExactly("late", "mid", "new")
            .inOrder()
    }

    @Test
    fun equal_timestamps_break_the_tie_by_ascending_seq() {
        assertThat(order(Msg("b", 100L, seq = 8L), Msg("a", 100L, seq = 3L)))
            .containsExactly("a", "b")
            .inOrder()
    }

    @Test
    fun at_an_equal_timestamp_a_message_without_a_seq_sorts_after_one_with_a_seq() {
        // An un-acked optimistic message (no server seq yet) trails its acked
        // sibling that shares the same instant.
        assertThat(order(Msg("pending", 100L, seq = null), Msg("acked", 100L, seq = 5L)))
            .containsExactly("acked", "pending")
            .inOrder()
    }

    @Test
    fun a_fully_tied_pair_preserves_the_incoming_server_order() {
        // Same timestamp, same (absent) seq → stable: input order is kept.
        assertThat(order(Msg("second", 100L), Msg("first", 100L)))
            .containsExactly("second", "first")
            .inOrder()
    }

    @Test
    fun a_message_with_no_timestamp_sorts_after_timestamped_ones() {
        // A freshly-composed message with no parsed time pins to the bottom (newest).
        assertThat(order(Msg("noTime", at = null), Msg("old", 100L), Msg("new", 300L)))
            .containsExactly("old", "new", "noTime")
            .inOrder()
    }

    @Test
    fun two_untimed_messages_fall_back_to_seq_then_preserve_input_order() {
        assertThat(order(Msg("later", at = null, seq = 9L), Msg("earlier", at = null, seq = 2L)))
            .containsExactly("earlier", "later")
            .inOrder()
    }

    @Test
    fun two_fully_untied_untimed_messages_preserve_their_input_order() {
        assertThat(order(Msg("x", at = null, seq = null), Msg("y", at = null, seq = null)))
            .containsExactly("x", "y")
            .inOrder()
    }

    @Test
    fun negative_pre_epoch_timestamps_still_order_correctly() {
        assertThat(order(Msg("future", 10L), Msg("past", -1000L)))
            .containsExactly("past", "future")
            .inOrder()
    }

    @Test
    fun very_large_timestamps_do_not_overflow_the_comparator() {
        val huge = Long.MAX_VALUE - 1
        assertThat(order(Msg("huge", huge), Msg("small", 1L)))
            .containsExactly("small", "huge")
            .inOrder()
    }

    @Test
    fun ordering_is_idempotent() {
        val once = MessageOrdering.order(
            listOf(Msg("c", 300L), Msg("a", 100L), Msg("b", 200L)),
        ) { MessageOrderInput(it.at, it.seq) }
        val twice = MessageOrdering.order(once) { MessageOrderInput(it.at, it.seq) }
        assertThat(twice.map { it.id }).isEqualTo(once.map { it.id })
    }

    @Test
    fun order_returns_the_original_items_not_the_projected_inputs() {
        val result = MessageOrdering.order(
            listOf(Msg("b", 200L), Msg("a", 100L)),
        ) { MessageOrderInput(it.at, it.seq) }
        assertThat(result).containsExactly(Msg("a", 100L), Msg("b", 200L)).inOrder()
    }

    @Test
    fun the_input_only_overload_orders_a_bare_list_of_inputs() {
        val ordered = MessageOrdering.order(
            listOf(
                MessageOrderInput(createdAtMillis = 300L, seq = null),
                MessageOrderInput(createdAtMillis = 100L, seq = null),
            ),
        )
        assertThat(ordered.map { it.createdAtMillis }).containsExactly(100L, 300L).inOrder()
    }
}
