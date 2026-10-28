package me.meeshy.sdk.model.share

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.MessageEffectFlags
import org.junit.Test

class ShareOutgoingBuilderTest {
    private fun message(
        id: String = "m1", content: String = "bonjour", viewOnce: Boolean? = null, blurred: Boolean? = null,
        flags: Int? = null, duration: Int? = null, encrypted: Boolean? = null,
    ) = ApiMessage(
        id = id, conversationId = "src", content = content, originalLanguage = "fr", isViewOnce = viewOnce,
        isBlurred = blurred, effectFlags = flags, ephemeralDuration = duration, isEncrypted = encrypted,
    )

    private fun forward(vararg m: ApiMessage, encrypted: Boolean = false, removed: Set<String> = emptySet(), caption: String = "", chosen: Int? = null) =
        ShareOutgoingBuilder.build(ShareSubject.Messages(m.toList(), "src", encrypted), removed, caption, chosen)

    private fun ready(result: ShareOutgoingResult) = (result as ShareOutgoingResult.Ready).messages

    @Test
    fun `messages are re-posted in order with their forward references`() {
        val posts = ready(forward(message("a", "un"), message("b", "deux")))
        assertThat(posts.map { it.content }).containsExactly("un", "deux").inOrder()
        assertThat(posts.map { it.forwardedFromId }).containsExactly("a", "b").inOrder()
        assertThat(posts.map { it.forwardedFromConversationId }.distinct()).containsExactly("src")
        assertThat(posts.first().originalLanguage).isEqualTo("fr")
    }

    @Test
    fun `a view once message does not travel and when nothing remains nothing is sent`() {
        val partial = ready(forward(message("a"), message("secret", viewOnce = true)))
        assertThat(partial.map { it.forwardedFromId }).containsExactly("a")
        val none = forward(message("secret", viewOnce = true))
        assertThat(none).isEqualTo(ShareOutgoingResult.Refused(ShareFailure.NOTHING_TO_SEND))
    }

    @Test
    fun `a message removed from what leaves is not sent`() {
        val posts = ready(forward(message("a"), message("b"), removed = setOf("a")))
        assertThat(posts.map { it.forwardedFromId }).containsExactly("b")
    }

    @Test
    fun `a timed flame copy keeps a duration bounded by its source and a blurred source hands its blur down`() {
        val flame = message(flags = MessageEffectFlags.EPHEMERAL.toInt(), duration = 60)
        val posts = ready(forward(flame, chosen = 600))
        assertThat(posts.single().ephemeralDuration).isEqualTo(60)
        assertThat(posts.single().effectFlags and MessageEffectFlags.EPHEMERAL).isNotEqualTo(0L)
        val shorter = ready(forward(flame, chosen = 30))
        assertThat(shorter.single().ephemeralDuration).isEqualTo(30)
        val blurred = ready(forward(message(blurred = true)))
        assertThat(blurred.single().effectFlags and MessageEffectFlags.BLURRED).isNotEqualTo(0L)
    }

    @Test
    fun `the caption of a forward leaves as a separate message after the copies with their protection`() {
        val flame = message(flags = MessageEffectFlags.EPHEMERAL.toInt(), duration = 60)
        val posts = ready(forward(flame, caption = "  regarde  "))
        assertThat(posts).hasSize(2)
        assertThat(posts[1].content).isEqualTo("regarde")
        assertThat(posts[1].forwardedFromId).isNull()
        assertThat(posts[1].ephemeralDuration).isEqualTo(60)
        assertThat(ready(forward(message(), caption = "salut"))[1].ephemeralDuration).isNull()
    }

    @Test
    fun `an end to end source never leaves as text`() {
        assertThat(forward(message(encrypted = true))).isEqualTo(ShareOutgoingResult.Refused(ShareFailure.SEALED_SOURCE))
        assertThat(forward(message(), encrypted = true)).isEqualTo(ShareOutgoingResult.Refused(ShareFailure.SEALED_SOURCE))
    }

    @Test
    fun `a card a link and a text leave as one text message with the caption on top`() {
        val card = ShareCard(ShareCardKind.PROFILE, "u1", "Léa", "https://meeshy.me/u/lea", "https://meeshy.me/u/lea")
        val posts = ready(ShareOutgoingBuilder.build(ShareSubject.Card(card), emptySet(), "mon amie", null))
        assertThat(posts.single().content).isEqualTo("mon amie\nhttps://meeshy.me/u/lea")
        assertThat(posts.single().forwardedFromId).isNull()
        val link = ready(ShareOutgoingBuilder.build(ShareSubject.Link("https://a.org"), emptySet(), "", null))
        assertThat(link.single().content).isEqualTo("https://a.org")
        assertThat(ShareOutgoingBuilder.build(ShareSubject.Text("  "), emptySet(), "", null))
            .isEqualTo(ShareOutgoingResult.Refused(ShareFailure.NOTHING_TO_SEND))
    }

    @Test
    fun `the subject projects its plan entry and widens a piece to its message`() {
        val subject = ShareSubject.Messages(listOf(message("a"), message("b")), "src")
        val entry = subject.entry(removedMessageIds = setOf("a")) as ShareEntry.Messages
        assertThat(entry.messages.map { it.id }).containsExactly("b")
        assertThat(ShareSubject.Piece(message("a"), "att", "src").widenedToWholeMessage)
            .isEqualTo(ShareSubject.Messages(listOf(message("a")), "src", false))
    }
    private fun photo(id: String, blurred: Boolean? = null, viewOnce: Boolean? = null, encrypted: Boolean? = null) =
        ApiMessageAttachment(id = id, mimeType = "image/jpeg", isBlurred = blurred, isViewOnce = viewOnce, isEncrypted = encrypted)

    private fun piece(attachmentId: String, vararg pieces: ApiMessageAttachment, text: String = "le texte du message", encrypted: Boolean = false, caption: String = "") =
        ShareOutgoingBuilder.build(
            ShareSubject.Piece(message().copy(content = text, attachments = pieces.toList()), attachmentId, "src", encrypted),
            emptySet(), caption, null,
        )

    @Test
    fun `a piece leaves as a forward of its message limited to it and without the text of the message`() {
        val posts = ready(piece("b", photo("a"), photo("b")))

        val copy = posts.single()
        assertThat(copy.forwardedFromId).isEqualTo("m1")
        assertThat(copy.forwardedFromConversationId).isEqualTo("src")
        assertThat(copy.forwardedAttachmentIds).containsExactly("b")
        assertThat(copy.content).isEmpty()
    }

    @Test
    fun `the caption of a piece leaves as a separate message after it`() {
        val posts = ready(piece("a", photo("a"), caption = " regarde "))

        assertThat(posts).hasSize(2)
        assertThat(posts[1].content).isEqualTo("regarde")
        assertThat(posts[1].forwardedFromId).isNull()
        assertThat(posts[1].forwardedAttachmentIds).isNull()
    }

    @Test
    fun `a sealed piece never leaves, whatever its message or conversation says`() {
        val sealed = ShareOutgoingResult.Refused(ShareFailure.SEALED_SOURCE)

        assertThat(piece("a", photo("a", encrypted = true))).isEqualTo(sealed)
        assertThat(piece("a", photo("a"), encrypted = true)).isEqualTo(sealed)
        assertThat(piece("a", photo("a"), photo("b", encrypted = true))).isEqualTo(sealed)
    }

    @Test
    fun `a piece unknown to its message or hidden by the exit law is never sent`() {
        val nothing = ShareOutgoingResult.Refused(ShareFailure.NOTHING_TO_SEND)

        assertThat(piece("ghost", photo("a"))).isEqualTo(nothing)
        assertThat(piece("a", photo("a", viewOnce = true))).isEqualTo(nothing)
    }

    @Test
    fun `a blurred piece hands its blur down to the copy`() {
        val copy = ready(piece("a", photo("a", blurred = true))).single()

        assertThat(copy.effectFlags and MessageEffectFlags.BLURRED).isNotEqualTo(0L)
    }
}
