package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ReplyThreadsTest {

    private fun link(id: String, replyToId: String? = null, isDeleted: Boolean = false) =
        ReplyLink(id = id, replyToId = replyToId, isDeleted = isDeleted)

    @Test
    fun an_empty_conversation_produces_no_threads() {
        val threads = ReplyThreads.of(emptyList())

        assertThat(threads.size).isEqualTo(0)
        assertThat(threads.threadFor("m1")).isNull()
    }

    @Test
    fun a_conversation_with_no_replies_produces_no_threads() {
        val threads = ReplyThreads.of(listOf(link("m1"), link("m2"), link("m3")))

        assertThat(threads.size).isEqualTo(0)
        assertThat(threads.threadFor("m1")).isNull()
    }

    @Test
    fun a_single_reply_yields_a_thread_of_count_one_on_its_parent() {
        val threads = ReplyThreads.of(listOf(link("m1"), link("m2", replyToId = "m1")))

        assertThat(threads.threadFor("m1"))
            .isEqualTo(ReplyThread(parentId = "m1", count = 1, firstReplyId = "m2"))
    }

    @Test
    fun several_replies_to_the_same_parent_accumulate_the_count() {
        val threads = ReplyThreads.of(
            listOf(
                link("m1"),
                link("m2", replyToId = "m1"),
                link("m3", replyToId = "m1"),
                link("m4", replyToId = "m1"),
            ),
        )

        assertThat(threads.threadFor("m1"))
            .isEqualTo(ReplyThread(parentId = "m1", count = 3, firstReplyId = "m2"))
    }

    @Test
    fun the_first_reply_in_list_order_is_kept_as_the_thread_anchor() {
        val threads = ReplyThreads.of(
            listOf(
                link("early", replyToId = "m1"),
                link("m1"),
                link("late", replyToId = "m1"),
            ),
        )

        assertThat(threads.threadFor("m1")?.firstReplyId).isEqualTo("early")
        assertThat(threads.threadFor("m1")?.count).isEqualTo(2)
    }

    @Test
    fun distinct_parents_get_distinct_threads() {
        val threads = ReplyThreads.of(
            listOf(
                link("a"),
                link("b"),
                link("r1", replyToId = "a"),
                link("r2", replyToId = "b"),
                link("r3", replyToId = "a"),
            ),
        )

        assertThat(threads.size).isEqualTo(2)
        assertThat(threads.threadFor("a")?.count).isEqualTo(2)
        assertThat(threads.threadFor("b")?.count).isEqualTo(1)
    }

    @Test
    fun a_self_referential_reply_is_ignored() {
        val threads = ReplyThreads.of(listOf(link("m1", replyToId = "m1")))

        assertThat(threads.size).isEqualTo(0)
    }

    @Test
    fun a_blank_reply_target_does_not_start_a_thread() {
        val threads = ReplyThreads.of(listOf(link("m1"), link("m2", replyToId = "   ")))

        assertThat(threads.size).isEqualTo(0)
    }

    @Test
    fun a_padded_reply_target_is_trimmed_before_grouping() {
        val threads = ReplyThreads.of(listOf(link("m1"), link("m2", replyToId = "  m1  ")))

        assertThat(threads.threadFor("m1")?.count).isEqualTo(1)
    }

    @Test
    fun a_deleted_reply_does_not_count_toward_the_thread() {
        val threads = ReplyThreads.of(
            listOf(
                link("m1"),
                link("m2", replyToId = "m1", isDeleted = true),
                link("m3", replyToId = "m1"),
            ),
        )

        assertThat(threads.threadFor("m1"))
            .isEqualTo(ReplyThread(parentId = "m1", count = 1, firstReplyId = "m3"))
    }

    @Test
    fun a_parent_whose_only_reply_is_deleted_has_no_thread() {
        val threads = ReplyThreads.of(
            listOf(link("m1"), link("m2", replyToId = "m1", isDeleted = true)),
        )

        assertThat(threads.size).isEqualTo(0)
        assertThat(threads.threadFor("m1")).isNull()
    }

    @Test
    fun a_reply_to_a_paged_out_parent_is_still_grouped_under_that_parent_id() {
        val threads = ReplyThreads.of(listOf(link("m2", replyToId = "gone")))

        assertThat(threads.threadFor("gone")?.count).isEqualTo(1)
        assertThat(threads.threadFor("gone")?.firstReplyId).isEqualTo("m2")
    }

    @Test
    fun looking_up_a_message_with_no_replies_returns_null() {
        val threads = ReplyThreads.of(listOf(link("m1"), link("m2", replyToId = "m1")))

        assertThat(threads.threadFor("m2")).isNull()
    }
}
