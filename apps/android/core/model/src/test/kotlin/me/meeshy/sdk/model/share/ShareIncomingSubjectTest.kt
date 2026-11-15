package me.meeshy.sdk.model.share

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ShareIncomingSubjectTest {
    private val photo = ShareMedia(id = "m1", mimeType = "image/jpeg", bytes = 1_000L)

    @Test
    fun `files received from another app plan as media and carry the received text`() {
        val subject = ShareSubject.Incoming(text = "regarde", media = listOf(photo))
        assertThat(subject.entry()).isEqualTo(ShareEntry.Media(listOf(photo), "regarde"))
        assertThat(subject.sourceConversationId).isNull()
        assertThat(subject.sourceMessages).isEmpty()
    }

    @Test
    fun `a received web address alone plans as a link, other text as text`() {
        assertThat(ShareSubject.Incoming("https://meeshy.me/x", emptyList()).entry()).isEqualTo(ShareEntry.Link("https://meeshy.me/x"))
        assertThat(ShareSubject.Incoming("bonjour à tous", emptyList()).entry()).isEqualTo(ShareEntry.Text("bonjour à tous"))
    }

    @Test
    fun `the caption joins the received text and the text still leaves when files accompany it`() {
        val subject = ShareSubject.Incoming(text = "regarde", media = listOf(photo))
        val built = ShareOutgoingBuilder.build(subject, emptySet(), caption = "vite", chosenDurationSeconds = null)
        assertThat((built as ShareOutgoingResult.Ready).messages.map { it.content }).containsExactly("vite\nregarde")
    }

    @Test
    fun `files without any text leave no text message but are not an empty share`() {
        val built = ShareOutgoingBuilder.build(ShareSubject.Incoming(null, listOf(photo)), emptySet(), "", null)
        assertThat((built as ShareOutgoingResult.Ready).messages).isEmpty()
    }

    @Test
    fun `nothing received is nothing to send`() {
        val built = ShareOutgoingBuilder.build(ShareSubject.Incoming(null, emptyList()), emptySet(), "", null)
        assertThat((built as ShareOutgoingResult.Refused).failure).isEqualTo(ShareFailure.NOTHING_TO_SEND)
    }
}
