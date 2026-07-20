package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ReplyThreadOverlayTest {

    private data class Msg(
        override val id: String,
        override val replyToId: String? = null,
        override val isDeleted: Boolean = false,
        override val isOutgoing: Boolean = false,
        override val senderName: String? = null,
        override val text: String = "",
        override val hasImage: Boolean = false,
        override val hasFile: Boolean = false,
    ) : ThreadMessage

    @Test
    fun an_empty_conversation_yields_no_overlay() {
        assertThat(ReplyThreadOverlay.of("m1", emptyList())).isNull()
    }

    @Test
    fun a_blank_parent_id_yields_no_overlay() {
        val messages = listOf(Msg("m1", text = "parent"), Msg("m2", replyToId = "m1"))

        assertThat(ReplyThreadOverlay.of("   ", messages)).isNull()
    }

    @Test
    fun a_paged_out_parent_yields_no_overlay() {
        // The parent "m1" is not currently loaded, only a reply to it is.
        val messages = listOf(Msg("m2", replyToId = "m1", text = "reply"))

        assertThat(ReplyThreadOverlay.of("m1", messages)).isNull()
    }

    @Test
    fun a_parent_with_no_replies_yields_no_overlay() {
        val messages = listOf(Msg("m1", text = "parent"), Msg("m2", text = "unrelated"))

        assertThat(ReplyThreadOverlay.of("m1", messages)).isNull()
    }

    @Test
    fun replies_to_a_different_parent_do_not_form_this_thread() {
        val messages = listOf(
            Msg("m1", text = "parent"),
            Msg("m2", replyToId = "other", text = "reply to someone else"),
        )

        assertThat(ReplyThreadOverlay.of("m1", messages)).isNull()
    }

    @Test
    fun a_parent_with_one_live_reply_yields_a_single_row_overlay() {
        val messages = listOf(
            Msg("m1", text = "parent", senderName = "Ada"),
            Msg("m2", replyToId = "m1", text = "a reply", senderName = "Bob"),
        )

        val overlay = ReplyThreadOverlay.of("m1", messages)

        assertThat(overlay).isNotNull()
        assertThat(overlay!!.parentId).isEqualTo("m1")
        assertThat(overlay.parent.messageId).isEqualTo("m1")
        assertThat(overlay.parent.senderName).isEqualTo("Ada")
        assertThat(overlay.parent.snippet).isEqualTo(PinnedSnippet.Text("parent"))
        assertThat(overlay.replyCount).isEqualTo(1)
        assertThat(overlay.replies.map { it.messageId }).containsExactly("m2")
        assertThat(overlay.replies.single().snippet).isEqualTo(PinnedSnippet.Text("a reply"))
    }

    @Test
    fun a_deleted_reply_is_excluded_from_the_thread() {
        val messages = listOf(
            Msg("m1", text = "parent"),
            Msg("m2", replyToId = "m1", text = "live reply"),
            Msg("m3", replyToId = "m1", text = "", isDeleted = true),
        )

        val overlay = ReplyThreadOverlay.of("m1", messages)

        assertThat(overlay!!.replyCount).isEqualTo(1)
        assertThat(overlay.replies.map { it.messageId }).containsExactly("m2")
    }

    @Test
    fun a_parent_whose_only_reply_is_deleted_yields_no_overlay() {
        val messages = listOf(
            Msg("m1", text = "parent"),
            Msg("m2", replyToId = "m1", isDeleted = true),
        )

        assertThat(ReplyThreadOverlay.of("m1", messages)).isNull()
    }

    @Test
    fun a_self_referencing_message_is_not_its_own_reply() {
        val messages = listOf(Msg("m1", replyToId = "m1", text = "loops to itself"))

        assertThat(ReplyThreadOverlay.of("m1", messages)).isNull()
    }

    @Test
    fun replies_keep_incoming_list_order_earliest_first() {
        val messages = listOf(
            Msg("m1", text = "parent"),
            Msg("r1", replyToId = "m1", text = "first"),
            Msg("r2", replyToId = "m1", text = "second"),
            Msg("r3", replyToId = "m1", text = "third"),
        )

        val overlay = ReplyThreadOverlay.of("m1", messages)

        assertThat(overlay!!.replyCount).isEqualTo(3)
        assertThat(overlay.replies.map { it.messageId }).containsExactly("r1", "r2", "r3").inOrder()
    }

    @Test
    fun a_whitespace_padded_reply_reference_still_matches_the_parent() {
        val messages = listOf(
            Msg("m1", text = "parent"),
            Msg("m2", replyToId = "  m1  ", text = "reply"),
        )

        val overlay = ReplyThreadOverlay.of("m1", messages)

        assertThat(overlay!!.replies.map { it.messageId }).containsExactly("m2")
    }

    @Test
    fun a_blank_reply_reference_is_not_a_reply() {
        val messages = listOf(
            Msg("m1", text = "parent"),
            Msg("m2", replyToId = "   ", text = "not actually a reply"),
        )

        assertThat(ReplyThreadOverlay.of("m1", messages)).isNull()
    }

    @Test
    fun a_deleted_parent_still_shows_its_live_replies() {
        // Mirrors ReplyThreads counting replies to a deleted parent: the tombstone
        // heads the overlay (isDeleted) but its live replies are still worth reading.
        val messages = listOf(
            Msg("m1", text = "", isDeleted = true, senderName = "Ada"),
            Msg("m2", replyToId = "m1", text = "still here"),
        )

        val overlay = ReplyThreadOverlay.of("m1", messages)

        assertThat(overlay).isNotNull()
        assertThat(overlay!!.parent.isDeleted).isTrue()
        assertThat(overlay.parent.snippet).isEqualTo(PinnedSnippet.Empty)
        assertThat(overlay.replies.map { it.messageId }).containsExactly("m2")
    }

    @Test
    fun a_blank_sender_name_resolves_to_null_on_rows() {
        val messages = listOf(
            Msg("m1", text = "parent", senderName = "   "),
            Msg("m2", replyToId = "m1", text = "reply", senderName = ""),
        )

        val overlay = ReplyThreadOverlay.of("m1", messages)

        assertThat(overlay!!.parent.senderName).isNull()
        assertThat(overlay.replies.single().senderName).isNull()
    }

    @Test
    fun a_trimmed_sender_name_is_carried_on_rows() {
        val messages = listOf(
            Msg("m1", text = "parent", senderName = "  Ada  "),
            Msg("m2", replyToId = "m1", text = "reply"),
        )

        assertThat(ReplyThreadOverlay.of("m1", messages)!!.parent.senderName).isEqualTo("Ada")
    }

    @Test
    fun an_image_only_reply_projects_an_image_snippet_and_a_file_reply_a_file_snippet() {
        val messages = listOf(
            Msg("m1", text = "parent"),
            Msg("m2", replyToId = "m1", text = "", hasImage = true),
            Msg("m3", replyToId = "m1", text = "", hasFile = true),
        )

        val overlay = ReplyThreadOverlay.of("m1", messages)

        assertThat(overlay!!.replies.map { it.snippet })
            .containsExactly(PinnedSnippet.Image, PinnedSnippet.File).inOrder()
    }

    @Test
    fun text_beats_media_and_image_beats_file_in_the_snippet_projection() {
        val messages = listOf(
            Msg("m1", text = "  parent body  ", hasImage = true, hasFile = true),
            Msg("m2", replyToId = "m1", text = "", hasImage = true, hasFile = true),
        )

        val overlay = ReplyThreadOverlay.of("m1", messages)

        // Text wins for the parent (trimmed), image beats file for the reply.
        assertThat(overlay!!.parent.snippet).isEqualTo(PinnedSnippet.Text("parent body"))
        assertThat(overlay.replies.single().snippet).isEqualTo(PinnedSnippet.Image)
    }

    @Test
    fun the_outgoing_flag_is_carried_on_rows() {
        val messages = listOf(
            Msg("m1", text = "parent", isOutgoing = true),
            Msg("m2", replyToId = "m1", text = "reply", isOutgoing = false),
        )

        val overlay = ReplyThreadOverlay.of("m1", messages)

        assertThat(overlay!!.parent.isOutgoing).isTrue()
        assertThat(overlay.replies.single().isOutgoing).isFalse()
    }
}
