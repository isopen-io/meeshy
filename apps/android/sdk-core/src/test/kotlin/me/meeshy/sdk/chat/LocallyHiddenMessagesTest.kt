package me.meeshy.sdk.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LocallyHiddenMessagesTest {

    @Test
    fun an_empty_set_hides_nothing() {
        assertThat(LocallyHiddenMessages().isHidden("m1")).isFalse()
    }

    @Test
    fun hiding_a_message_marks_it_hidden() {
        val hidden = LocallyHiddenMessages().hide("m1")

        assertThat(hidden.isHidden("m1")).isTrue()
        assertThat(hidden.ids).containsExactly("m1")
    }

    @Test
    fun hiding_leaves_other_messages_visible() {
        val hidden = LocallyHiddenMessages().hide("m1")

        assertThat(hidden.isHidden("m2")).isFalse()
    }

    @Test
    fun hiding_an_already_hidden_message_returns_the_same_instance_so_persistence_can_be_skipped() {
        val once = LocallyHiddenMessages().hide("m1")
        val twice = once.hide("m1")

        assertThat(twice).isSameInstanceAs(once)
    }

    @Test
    fun hiding_a_blank_id_is_a_no_op_and_returns_the_same_instance() {
        val start = LocallyHiddenMessages().hide("m1")
        val afterBlank = start.hide("   ")

        assertThat(afterBlank).isSameInstanceAs(start)
        assertThat(afterBlank.ids).containsExactly("m1")
    }

    @Test
    fun hiding_a_second_distinct_message_accumulates() {
        val hidden = LocallyHiddenMessages().hide("m1").hide("m2")

        assertThat(hidden.ids).containsExactly("m1", "m2")
    }

    @Test
    fun visible_filters_out_hidden_ids_and_preserves_order() {
        val hidden = LocallyHiddenMessages(setOf("m2", "m4"))

        assertThat(hidden.visible(listOf("m1", "m2", "m3", "m4", "m5")))
            .containsExactly("m1", "m3", "m5")
            .inOrder()
    }

    @Test
    fun visible_over_an_empty_list_returns_empty() {
        assertThat(LocallyHiddenMessages(setOf("m1")).visible(emptyList())).isEmpty()
    }

    @Test
    fun visible_returns_every_id_when_none_are_hidden() {
        assertThat(LocallyHiddenMessages().visible(listOf("m1", "m2")))
            .containsExactly("m1", "m2")
            .inOrder()
    }

    @Test
    fun visible_keeps_duplicate_ids_when_that_id_is_not_hidden() {
        assertThat(LocallyHiddenMessages(setOf("m2")).visible(listOf("m1", "m1", "m2")))
            .containsExactly("m1", "m1")
            .inOrder()
    }
}
