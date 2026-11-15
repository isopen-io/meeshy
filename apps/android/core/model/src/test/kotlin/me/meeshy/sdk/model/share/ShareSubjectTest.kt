package me.meeshy.sdk.model.share

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import org.junit.Test

class ShareSubjectTest {
    private fun message(id: String, vararg pieces: String) = ApiMessage(
        id = id,
        conversationId = "c1",
        content = "t$id",
        attachments = pieces.map { ApiMessageAttachment(id = it, mimeType = "image/png") },
    )

    @Test
    fun `removed messages leave the plan entry but not the subject`() {
        val subject = ShareSubject.Messages(listOf(message("1"), message("2"), message("3")), "c1")
        val entry = subject.entry(setOf("2")) as ShareEntry.Messages
        assertThat(entry.messages.map { it.id }).containsExactly("1", "3").inOrder()
        assertThat(subject.sourceMessages).hasSize(3)
    }

    @Test
    fun `a piece plans as a piece and widens to its whole message without closing`() {
        val subject = ShareSubject.Piece(message("1", "a", "b"), "b", "c1")
        assertThat(subject.entry()).isInstanceOf(ShareEntry.Piece::class.java)
        val widened = subject.widenedToWholeMessage as ShareSubject.Messages
        assertThat(widened.messages.map { it.id }).containsExactly("1")
        assertThat(widened.sourceConversationId).isEqualTo("c1")
        assertThat(widened.widenedToWholeMessage).isNull()
    }

    @Test
    fun `received text alone is text, a web address a link, files with text media`() {
        assertThat(ShareSubject.Text("x").entry()).isEqualTo(ShareEntry.Text("x"))
        assertThat(ShareSubject.Incoming(" https://a.b/c ", emptyList()).entry()).isEqualTo(ShareEntry.Link("https://a.b/c"))
        val media = listOf(ShareMedia("m", "image/png"))
        assertThat(ShareSubject.Incoming("  ", media).entry()).isEqualTo(ShareEntry.Media(media, null))
    }

    @Test
    fun `a card plans with its kind and url`() {
        val card = ShareCard(ShareCardKind.PROFILE, "u1", "Ana", "https://meeshy.me/u/ana", "msg")
        assertThat(ShareSubject.Card(card).entry()).isEqualTo(ShareEntry.Card(ShareCardKind.PROFILE, "https://meeshy.me/u/ana"))
    }
}
