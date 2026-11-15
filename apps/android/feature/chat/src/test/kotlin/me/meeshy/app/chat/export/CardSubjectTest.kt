package me.meeshy.app.chat.export

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ContentExitLaw
import me.meeshy.sdk.model.MessageExitOffer
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.LanguageChip
import org.junit.Test

class CardSubjectTest {

    private val now = 1_800_000_000_000L
    private val viewer = CardViewer(id = "me", displayName = "Moi Même", username = "moi")

    private fun bubble(
        text: String = "Bonjour tout le monde",
        isOutgoing: Boolean = false,
        senderName: String? = "Awa",
        senderUsername: String? = "awa",
        replyToText: String? = null,
        replyToSenderName: String? = null,
        replyToIsMe: Boolean = false,
        isTranslated: Boolean = false,
        isShowingOriginal: Boolean = false,
        originalText: String? = null,
        languageStrip: List<LanguageChip> = emptyList(),
        isDeleted: Boolean = false,
        isSystem: Boolean = false,
        isViewOnce: Boolean = false,
        isBlurred: Boolean = false,
        expiresAtIso: String? = null,
        isEndToEndSealed: Boolean = false,
        exitOffer: MessageExitOffer = MessageExitOffer.Unrestricted,
        replyToDeleted: Boolean = false,
    ) = BubbleContent(
        messageId = "507f1f77bcf86cd799439011", text = text, isOutgoing = isOutgoing, isTranslated = isTranslated,
        isShowingOriginal = isShowingOriginal, originalText = originalText, languageStrip = languageStrip,
        senderName = senderName, showSenderName = true, senderUsername = senderUsername,
        isEdited = false, isDeleted = isDeleted, createdAtIso = "2026-10-27T10:00:00.000Z",
        replyToText = replyToText, replyToSenderName = replyToSenderName, replyToIsMe = replyToIsMe,
        replyToDeleted = replyToDeleted, expiresAtIso = expiresAtIso, isSystem = isSystem, isViewOnce = isViewOnce,
        isBlurred = isBlurred, exitOffer = exitOffer, isEndToEndSealed = isEndToEndSealed,
    )

    @Test
    fun `an ordinary message becomes a card signed by its sender`() {
        val subject = CardSubjects.of(bubble(), viewer, now)!!
        assertThat(subject.reply.text).isEqualTo("Bonjour tout le monde")
        assertThat(subject.reply.author).isEqualTo("Awa")
        assertThat(subject.reply.handle).isEqualTo("awa")
        assertThat(subject.quoted).isNull()
        assertThat(subject.sentAtMillis).isGreaterThan(0L)
    }

    @Test
    fun `my own message is signed with my display name and my handle`() {
        val subject = CardSubjects.of(bubble(isOutgoing = true, senderName = "x", senderUsername = null), viewer, now)!!
        assertThat(subject.reply.author).isEqualTo("Moi Même")
        assertThat(subject.reply.handle).isEqualTo("moi")
    }

    @Test
    fun `a message with no author name is signed Meeshy`() {
        val subject = CardSubjects.of(bubble(senderName = " ", senderUsername = null), viewer, now)!!
        assertThat(subject.reply.author).isEqualTo("Meeshy")
    }

    @Test
    fun `the quotation is the one the bubble already shows`() {
        val subject = CardSubjects.of(bubble(replyToText = "Tu viens ?", replyToSenderName = "Koffi"), viewer, now)!!
        assertThat(subject.quoted?.text).isEqualTo("Tu viens ?")
        assertThat(subject.quoted?.author).isEqualTo("Koffi")
    }

    @Test
    fun `a quotation of my own message names me, and a deleted or blank quotation shows nothing`() {
        assertThat(CardSubjects.of(bubble(replyToText = "Salut", replyToIsMe = true), viewer, now)!!.quoted?.author).isEqualTo("Moi Même")
        assertThat(CardSubjects.of(bubble(replyToText = "Salut", replyToDeleted = true), viewer, now)!!.quoted).isNull()
        assertThat(CardSubjects.of(bubble(replyToText = "  "), viewer, now)!!.quoted).isNull()
    }

    @Test
    fun `a deleted message, a notice and an empty text are refused`() {
        assertThat(CardSubjects.refusal(bubble(isDeleted = true), now)).isEqualTo(CardRefusal.DELETED)
        assertThat(CardSubjects.refusal(bubble(isSystem = true), now)).isEqualTo(CardRefusal.NOTICE)
        assertThat(CardSubjects.refusal(bubble(text = "   "), now)).isEqualTo(CardRefusal.EMPTY)
    }

    @Test
    fun `view once, blurred and ephemeral messages never become an image`() {
        assertThat(CardSubjects.refusal(bubble(isViewOnce = true), now)).isEqualTo(CardRefusal.PROTECTED)
        assertThat(CardSubjects.refusal(bubble(isBlurred = true), now)).isEqualTo(CardRefusal.PROTECTED)
        assertThat(CardSubjects.refusal(bubble(expiresAtIso = "2999-01-01T00:00:00.000Z"), now)).isEqualTo(CardRefusal.PROTECTED)
        assertThat(CardSubjects.of(bubble(isViewOnce = true), viewer, now)).isNull()
    }

    @Test
    fun `a message the exit law refuses to imagine is refused, as is one that quotes protected content`() {
        val refusing = MessageExitOffer(ContentExitLaw.Ordinary, holdsBlur = true, isEncrypted = false)
        assertThat(CardSubjects.refusal(bubble(exitOffer = refusing), now)).isEqualTo(CardRefusal.PROTECTED)
        val quoting = MessageExitOffer(ContentExitLaw.Ordinary, holdsBlur = false, isEncrypted = false, quotesProtectedContent = true)
        assertThat(CardSubjects.refusal(bubble(exitOffer = quoting), now)).isEqualTo(CardRefusal.QUOTES_PROTECTED)
    }

    @Test
    fun `an end to end message this device cannot open is refused, an opened one is exported from the clear text`() {
        assertThat(CardSubjects.refusal(bubble(isEndToEndSealed = true), now)).isEqualTo(CardRefusal.SEALED)
        val opened = MessageExitOffer(ContentExitLaw.Ordinary, holdsBlur = false, isEncrypted = true)
        assertThat(CardSubjects.refusal(bubble(exitOffer = opened), now)).isNull()
    }

    @Test
    fun `an expired message is refused as protected whatever the law says`() {
        assertThat(CardSubjects.refusal(bubble(expiresAtIso = "2001-01-01T00:00:00.000Z"), now)).isEqualTo(CardRefusal.PROTECTED)
    }

    private val strip = listOf(
        LanguageChip(code = "fr", info = null, isOriginal = true, isActive = false),
        LanguageChip(code = "en", info = null, isOriginal = false, isActive = true),
    )

    @Test
    fun `a translated message exists in its original language and in the one served`() {
        val translated = bubble(text = "Hello", isTranslated = true, originalText = "Bonjour", languageStrip = strip)
        assertThat(CardSubjects.languages(translated).map { it.code }).containsExactly("fr", "en").inOrder()
        assertThat(CardSubjects.languages(bubble())).isEmpty()
    }

    @Test
    fun `the export language picks its own text and without one the card shows what the reader reads`() {
        val translated = bubble(text = "Hello", isTranslated = true, originalText = "Bonjour", languageStrip = strip)
        assertThat(CardSubjects.of(translated, viewer, now)!!.reply.text).isEqualTo("Hello")
        assertThat(CardSubjects.of(translated, viewer, now, language = "fr")!!.reply.text).isEqualTo("Bonjour")
        assertThat(CardSubjects.of(translated, viewer, now, language = "en")!!.reply.text).isEqualTo("Hello")
        assertThat(CardSubjects.of(translated, viewer, now, language = "de")!!.reply.text).isEqualTo("Hello")
    }

    @Test
    fun `the file name carries the date and time and nothing of the content`() {
        val name = CardSubjects.fileName(epochMillis = 1_800_000_000_000L, zoneOffsetSeconds = 0)
        assertThat(name).matches("meeshy-\\d{8}-\\d{6}\\.png")
        assertThat(name).isEqualTo("meeshy-20270115-080000.png")
    }
}
