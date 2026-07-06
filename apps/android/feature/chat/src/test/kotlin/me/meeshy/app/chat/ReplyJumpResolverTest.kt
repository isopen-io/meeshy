package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ReplyJumpResolverTest {

    private fun link(id: String, replyToId: String? = null) = ReplyLink(id = id, replyToId = replyToId)

    @Test
    fun tapping_a_message_that_is_not_loaded_resolves_to_none() {
        val result = ReplyJumpResolver.resolve("ghost", listOf(link("m1"), link("m2")))

        assertThat(result).isEqualTo(ReplyJump.None)
    }

    @Test
    fun tapping_a_message_that_is_not_a_reply_resolves_to_none() {
        val result = ReplyJumpResolver.resolve("m2", listOf(link("m1"), link("m2", replyToId = null)))

        assertThat(result).isEqualTo(ReplyJump.None)
    }

    @Test
    fun a_blank_reply_target_resolves_to_none() {
        val result = ReplyJumpResolver.resolve("m2", listOf(link("m1"), link("m2", replyToId = "   ")))

        assertThat(result).isEqualTo(ReplyJump.None)
    }

    @Test
    fun a_self_referential_reply_resolves_to_none() {
        val result = ReplyJumpResolver.resolve("m2", listOf(link("m2", replyToId = "m2")))

        assertThat(result).isEqualTo(ReplyJump.None)
    }

    @Test
    fun a_reply_to_a_loaded_original_scrolls_to_that_original() {
        val result = ReplyJumpResolver.resolve(
            tappedMessageId = "m3",
            messages = listOf(link("m1"), link("m2"), link("m3", replyToId = "m1")),
        )

        assertThat(result).isEqualTo(ReplyJump.Scroll("m1"))
    }

    @Test
    fun a_reply_to_a_paged_out_original_reports_target_not_loaded() {
        val result = ReplyJumpResolver.resolve(
            tappedMessageId = "m3",
            messages = listOf(link("m2"), link("m3", replyToId = "gone")),
        )

        assertThat(result).isEqualTo(ReplyJump.TargetNotLoaded)
    }

    @Test
    fun a_padded_reply_target_is_trimmed_before_lookup() {
        val result = ReplyJumpResolver.resolve(
            tappedMessageId = "m3",
            messages = listOf(link("m1"), link("m3", replyToId = "  m1  ")),
        )

        assertThat(result).isEqualTo(ReplyJump.Scroll("m1"))
    }

    @Test
    fun an_empty_conversation_resolves_to_none() {
        val result = ReplyJumpResolver.resolve("m1", emptyList())

        assertThat(result).isEqualTo(ReplyJump.None)
    }

    @Test
    fun the_first_message_matching_the_tapped_id_wins() {
        val result = ReplyJumpResolver.resolve(
            tappedMessageId = "dup",
            messages = listOf(link("dup", replyToId = "m1"), link("m1"), link("dup", replyToId = "gone")),
        )

        assertThat(result).isEqualTo(ReplyJump.Scroll("m1"))
    }
}
