package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ReplyMentionPrefillTest {

    @Test
    fun `injects the mention when the reply target is itself a reply`() {
        val result = ReplyMentionPrefill.apply(
            currentText = "",
            previousMention = null,
            replyToParentId = "root1",
            authorUsername = "bob",
        )

        assertThat(result.text).isEqualTo("@bob ")
        assertThat(result.prefilledMention).isEqualTo("@bob ")
    }

    @Test
    fun `does not inject when the reply target is a top-level comment`() {
        val result = ReplyMentionPrefill.apply(
            currentText = "",
            previousMention = null,
            replyToParentId = null,
            authorUsername = "bob",
        )

        assertThat(result.text).isEqualTo("")
        assertThat(result.prefilledMention).isNull()
    }

    @Test
    fun `does not inject when the reply target is a top-level comment with a blank parentId`() {
        val result = ReplyMentionPrefill.apply(
            currentText = "",
            previousMention = null,
            replyToParentId = "  ",
            authorUsername = "bob",
        )

        assertThat(result.text).isEqualTo("")
        assertThat(result.prefilledMention).isNull()
    }

    @Test
    fun `does not inject when the author has no username`() {
        val result = ReplyMentionPrefill.apply(
            currentText = "",
            previousMention = null,
            replyToParentId = "root1",
            authorUsername = null,
        )

        assertThat(result.text).isEqualTo("")
        assertThat(result.prefilledMention).isNull()
    }

    @Test
    fun `strips the previously injected mention when switching to a new reply-to-reply target`() {
        val result = ReplyMentionPrefill.apply(
            currentText = "@alice hey",
            previousMention = "@alice ",
            replyToParentId = "root1",
            authorUsername = "bob",
        )

        assertThat(result.text).isEqualTo("@bob hey")
        assertThat(result.prefilledMention).isEqualTo("@bob ")
    }

    @Test
    fun `strips the previously injected mention when switching to a top-level target`() {
        val result = ReplyMentionPrefill.apply(
            currentText = "@alice hey",
            previousMention = "@alice ",
            replyToParentId = null,
            authorUsername = null,
        )

        assertThat(result.text).isEqualTo("hey")
        assertThat(result.prefilledMention).isNull()
    }

    @Test
    fun `re-tapping the same reply target is idempotent, no double prefix`() {
        val result = ReplyMentionPrefill.apply(
            currentText = "@bob hey",
            previousMention = "@bob ",
            replyToParentId = "root1",
            authorUsername = "bob",
        )

        assertThat(result.text).isEqualTo("@bob hey")
        assertThat(result.prefilledMention).isEqualTo("@bob ")
    }

    @Test
    fun `leaves an edited-away prefix alone when the text no longer starts with it`() {
        val result = ReplyMentionPrefill.apply(
            currentText = "hey @alice",
            previousMention = "@alice ",
            replyToParentId = "root1",
            authorUsername = "bob",
        )

        assertThat(result.text).isEqualTo("@bob hey @alice")
        assertThat(result.prefilledMention).isEqualTo("@bob ")
    }
}
