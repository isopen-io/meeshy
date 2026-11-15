package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallBubbleAttachmentsMergeTest {

    private fun bubble(vararg pieces: String) = ApiMessage(
        id = "call1",
        conversationId = "c1",
        content = "",
        attachments = pieces.map { ApiMessageAttachment(id = it, fileUrl = "https://cdn/$it.mp4", mimeType = "video/mp4") },
    )

    @Test
    fun `the live to terminal transition replaces the pieces of the call bubble`() {
        val live = bubble("old")
        val terminal = bubble("recording")

        val merged = MessageMergePolicy.merge(existing = live, incoming = terminal).message

        assertThat(merged.attachments.map { it.id }).containsExactly("recording")
    }

    @Test
    fun `a rebroadcast without any piece removes none`() {
        val held = bubble("recording")

        val merged = MessageMergePolicy.merge(existing = held, incoming = bubble()).message

        assertThat(merged.attachments.map { it.id }).containsExactly("recording")
    }
}
