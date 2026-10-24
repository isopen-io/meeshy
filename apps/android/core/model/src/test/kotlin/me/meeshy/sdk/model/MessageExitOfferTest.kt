package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MessageExitOfferTest {

    private fun offer(
        law: ContentExitLaw = ContentExitLaw.Ordinary,
        blur: Boolean = false,
        encrypted: Boolean = false,
        quotes: Boolean = false,
    ) = MessageExitOffer(law, blur, encrypted, quotes)

    private fun exits(offer: MessageExitOffer) = MessageExit.entries.filter(offer::offers).toSet()

    @Test
    fun `an ordinary message offers every exit`() {
        assertThat(exits(offer())).containsExactlyElementsIn(MessageExit.entries)
    }

    @Test
    fun `a timed flame only forwards`() {
        assertThat(exits(offer(ContentExitLaw.timedFlame(60)))).containsExactly(MessageExit.FORWARD)
    }

    @Test
    fun `after read flame and view once offer nothing`() {
        assertThat(exits(offer(ContentExitLaw.AfterReadFlame))).isEmpty()
        assertThat(exits(offer(ContentExitLaw.ViewOnce))).isEmpty()
    }

    @Test
    fun `a blurred message forwards with inherited blur and nothing else leaves`() {
        assertThat(exits(offer(blur = true))).containsExactly(MessageExit.FORWARD)
    }

    @Test
    fun `an encrypted message is not published - nor forwarded from the device clear text`() {
        val encrypted = exits(offer(encrypted = true))
        assertThat(encrypted).doesNotContain(MessageExit.PUBLISH)
        assertThat(encrypted).doesNotContain(MessageExit.FORWARD)
        assertThat(encrypted).containsAtLeast(MessageExit.COPY, MessageExit.SAVE, MessageExit.SHARE, MessageExit.IMAGINE)
    }

    @Test
    fun `a message quoting protected content is not imagined but may still be copied`() {
        val quoting = exits(offer(quotes = true))
        assertThat(quoting).doesNotContain(MessageExit.IMAGINE)
        assertThat(quoting).contains(MessageExit.COPY)
        assertThat(quoting).contains(MessageExit.FORWARD)
    }

    @Test
    fun `selection offers forward as soon as one message leaves and an empty selection does not block`() {
        val viewOnce = offer(ContentExitLaw.ViewOnce)
        assertThat(MessageExitOffer.selectionOffersForward(listOf(viewOnce, viewOnce))).isFalse()
        assertThat(MessageExitOffer.selectionOffersForward(listOf(viewOnce, offer()))).isTrue()
        assertThat(MessageExitOffer.selectionOffersForward(emptyList())).isTrue()
    }

    @Test
    fun `savable pieces are those of messages that offer saving`() {
        val ids = MessageExitOffer.savablePieceIds(
            listOf(offer() to listOf("a"), offer(ContentExitLaw.ViewOnce) to listOf("b"), offer(blur = true) to listOf("c")),
        )
        assertThat(ids).containsExactly("a")
    }

    @Test
    fun `refusal reason is read locally from the law and from the gateway code`() {
        assertThat(ForwardRefusalReason.local(offer())).isNull()
        assertThat(ForwardRefusalReason.local(offer(blur = true))).isNull()
        assertThat(ForwardRefusalReason.local(offer(ContentExitLaw.timedFlame(30)))).isNull()
        assertThat(ForwardRefusalReason.local(offer(ContentExitLaw.ViewOnce))).isEqualTo(ForwardRefusalReason.VIEW_ONCE)
        assertThat(ForwardRefusalReason.local(offer(ContentExitLaw.AfterReadFlame))).isEqualTo(ForwardRefusalReason.AFTER_READ)
        assertThat(ForwardRefusalReason.local(offer(encrypted = true))).isEqualTo(ForwardRefusalReason.ENCRYPTED_SOURCE)
        assertThat(ForwardRefusalReason.fromCode("view-once-not-forwardable")).isEqualTo(ForwardRefusalReason.VIEW_ONCE)
        assertThat(ForwardRefusalReason.fromCode("ephemeral-not-forwardable")).isEqualTo(ForwardRefusalReason.AFTER_READ)
        assertThat(ForwardRefusalReason.fromCode("forward-source-unavailable")).isEqualTo(ForwardRefusalReason.SOURCE_UNAVAILABLE)
        assertThat(ForwardRefusalReason.fromCode("encrypted-source-not-server-copyable")).isEqualTo(ForwardRefusalReason.ENCRYPTED_SOURCE)
        assertThat(ForwardRefusalReason.fromCode("forwarded-attachment-not-in-source")).isEqualTo(ForwardRefusalReason.ATTACHMENT_NOT_IN_SOURCE)
        assertThat(ForwardRefusalReason.fromCode("nope")).isNull()
        assertThat(ForwardRefusalReason.fromCode(null)).isNull()
    }

    private fun message(
        viewOnce: Boolean? = null,
        blurred: Boolean? = null,
        flags: Int? = null,
        duration: Int? = null,
        expires: String? = null,
        encrypted: Boolean? = null,
        attachments: List<ApiMessageAttachment> = emptyList(),
        replyTo: ApiMessageReplyPreview? = null,
    ) = ApiMessage(
        id = "m", conversationId = "c", isViewOnce = viewOnce, isBlurred = blurred, effectFlags = flags,
        ephemeralDuration = duration, expiresAt = expires, isEncrypted = encrypted,
        attachments = attachments, replyTo = replyTo,
    )

    @Test
    fun `message projection - plain message is unrestricted`() {
        val result = message().exitOffer()
        assertThat(result.law).isEqualTo(ContentExitLaw.Ordinary)
        assertThat(result.holdsBlur).isFalse()
        assertThat(result.isEncrypted).isFalse()
        assertThat(result.quotesProtectedContent).isFalse()
    }

    @Test
    fun `message projection - ordinary message with a view once piece takes the most restrictive nature`() {
        val piece = ApiMessageAttachment(id = "a", isViewOnce = true)
        assertThat(message(attachments = listOf(piece)).exitOffer().nature).isEqualTo(ContentExitLaw.Nature.VIEW_ONCE)
    }

    @Test
    fun `message projection - after read bit and timed flame come from the wire fields`() {
        val bits = (MessageEffectFlags.EPHEMERAL or MessageEffectFlags.EPHEMERAL_AFTER_READ).toInt()
        assertThat(message(flags = bits).exitOffer().nature).isEqualTo(ContentExitLaw.Nature.AFTER_READ_FLAME)
        val timed = message(flags = MessageEffectFlags.EPHEMERAL.toInt(), duration = 60, expires = "2026-10-23T10:00:00Z")
        assertThat(message(flags = timed.effectFlags, duration = 60, expires = timed.expiresAt).exitOffer().law.forward)
            .isEqualTo(ContentExitLaw.ForwardVerdict.Allowed(60))
        assertThat(message(expires = "2026-10-23T10:00:00Z").exitOffer().nature)
            .isEqualTo(ContentExitLaw.Nature.AFTER_READ_FLAME)
    }

    @Test
    fun `message projection - a view once already opened by this reader stays view once`() {
        val opened = message().copy(consumedByMe = true)
        assertThat(opened.exitOffer().nature).isEqualTo(ContentExitLaw.Nature.VIEW_ONCE)
    }

    @Test
    fun `message projection - blur on the message or on a piece is held`() {
        assertThat(message(blurred = true).exitOffer().holdsBlur).isTrue()
        assertThat(message(attachments = listOf(ApiMessageAttachment(id = "a", isBlurred = true))).exitOffer().holdsBlur).isTrue()
        assertThat(message(flags = MessageEffectFlags.BLURRED.toInt()).exitOffer().holdsBlur).isTrue()
    }

    @Test
    fun `message projection - encryption of the message, a piece or the conversation`() {
        assertThat(message(encrypted = true).exitOffer().isEncrypted).isTrue()
        assertThat(message(attachments = listOf(ApiMessageAttachment(id = "a", isEncrypted = true))).exitOffer().isEncrypted).isTrue()
        assertThat(message().exitOffer(conversationIsEncrypted = true).isEncrypted).isTrue()
    }

    @Test
    fun `message projection - quoting a protected message is detected and an ordinary quote is not`() {
        val ordinary = ApiMessageReplyPreview(id = "q", attachments = null, isViewOnce = false, isBlurred = false, effectFlags = 0L)
        assertThat(message(replyTo = ordinary).quotesProtectedContent).isFalse()
        assertThat(message(replyTo = ordinary.copy(isViewOnce = true)).quotesProtectedContent).isTrue()
        assertThat(message(replyTo = ordinary.copy(isBlurred = true)).quotesProtectedContent).isTrue()
        assertThat(message(replyTo = ordinary.copy(expiresAt = "2026-10-23T10:00:00Z")).quotesProtectedContent).isTrue()
        assertThat(message(replyTo = ordinary.copy(deletedAt = "2026-10-23T10:00:00Z", isViewOnce = true)).quotesProtectedContent).isFalse()
        assertThat(message().quotesProtectedContent).isFalse()
    }
}
