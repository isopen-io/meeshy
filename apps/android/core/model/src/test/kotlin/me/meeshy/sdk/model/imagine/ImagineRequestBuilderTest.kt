package me.meeshy.sdk.model.imagine

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiAttachmentTranscription
import me.meeshy.sdk.model.ApiAttachmentTranslation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiMessageReplyPreview
import me.meeshy.sdk.model.ApiMessageSender
import me.meeshy.sdk.model.ApiTextTranslation
import me.meeshy.sdk.model.MessageEffectFlags
import org.junit.Test

class ImagineRequestBuilderTest {

    private val now = 1_800_000_000_000L
    private val viewer = ImagineViewer(id = "me", displayName = "Moi", username = "moi")

    private fun translation(language: String, text: String, encrypted: Boolean? = null) =
        ApiTextTranslation(targetLanguage = language, translatedContent = text, isEncrypted = encrypted)

    private fun message(
        content: String = "Hello",
        original: String? = "en",
        translations: List<ApiTextTranslation> = emptyList(),
        attachments: List<ApiMessageAttachment> = emptyList(),
        senderId: String? = "alice",
        replyTo: ApiMessageReplyPreview? = null,
        flags: Int? = null,
        viewOnce: Boolean? = null,
        blurred: Boolean? = null,
        duration: Int? = null,
        deletedAt: String? = null,
        source: String? = null,
    ) = ApiMessage(
        id = "m1", conversationId = "c1", senderId = senderId, content = content, originalLanguage = original,
        translations = translations, attachments = attachments, replyTo = replyTo, effectFlags = flags,
        isViewOnce = viewOnce, isBlurred = blurred, ephemeralDuration = duration, deletedAt = deletedAt, messageSource = source,
        createdAt = "2026-10-20T10:00:00Z",
        sender = ApiMessageSender(id = senderId, displayName = "Alice", username = "alice"),
    )

    private fun subject(m: ApiMessage, prism: List<String>, language: String? = null, quoted: ApiMessage? = null) =
        ImagineRequestBuilder.subject(m, viewer, prism, now, language, quoted)

    private fun photo(id: String = "p1") = ApiMessageAttachment(id = id, mimeType = "image/jpeg", fileUrl = "https://x/$id.jpg", width = 800, height = 400, isViewOnce = false, isBlurred = false)

    private fun voice(translations: Map<String, ApiAttachmentTranslation>? = null) = ApiMessageAttachment(
        id = "a1", mimeType = "audio/mp4", fileUrl = "https://x/a-en.m4a", duration = 12_000, originalName = "Vocal",
        transcription = ApiAttachmentTranscription(text = "Hello everyone"),
        translations = translations,
    )

    @Test
    fun `the served text is the translation of the first prism rank that has one`() {
        val m = message(translations = listOf(translation("fr", "Bonjour")))
        assertThat(subject(m, listOf("fr", "en"))!!.reply.text).isEqualTo("Bonjour")
    }

    @Test
    fun `a message already written in the primary language stays original`() {
        val m = message(translations = listOf(translation("fr", "Bonjour")))
        assertThat(subject(m, listOf("en", "fr"))!!.reply.text).isEqualTo("Hello")
    }

    @Test
    fun `the original language competes at its own rank - a lower rank translation does not win`() {
        val m = message(translations = listOf(translation("fr", "Bonjour")))
        assertThat(subject(m, listOf("de", "en", "fr"))!!.reply.text).isEqualTo("Hello")
    }

    @Test
    fun `a translation at a lower rank than the first available one is served when the primary is absent`() {
        val m = message(translations = listOf(translation("es", "Hola")))
        assertThat(subject(m, listOf("de", "es", "en"))!!.reply.text).isEqualTo("Hola")
    }

    @Test
    fun `no translation toward the prism serves the original - never the first translation`() {
        val m = message(translations = listOf(translation("es", "Hola")))
        assertThat(subject(m, listOf("fr"))!!.reply.text).isEqualTo("Hello")
    }

    @Test
    fun `a cryptogram translation is never served`() {
        val m = message(translations = listOf(translation("fr", "xxcipherxx", encrypted = true)))
        assertThat(subject(m, listOf("fr"))!!.reply.text).isEqualTo("Hello")
    }

    @Test
    fun `each offered language gets its own card - the original first`() {
        val m = message(translations = listOf(translation("fr", "Bonjour"), translation("es", "Hola")))
        val request = ImagineRequestBuilder.request(m, viewer, listOf("fr"), now, "moi", "Groupe", "#6366F1")!!
        assertThat(request.languages.map { it.code }).containsExactly("en", "es", "fr").inOrder()
        assertThat(request.subjectIn("ES").reply.text).isEqualTo("Hola")
        assertThat(request.subjectIn("en").reply.text).isEqualTo("Hello")
        assertThat(request.subjectIn(null).reply.text).isEqualTo("Bonjour")
        assertThat(request.accentColor).isEqualTo("#6366F1")
    }

    @Test
    fun `the viewer is named by his own display name and handle`() {
        val m = message(senderId = "me")
        val reply = subject(m, listOf("en"))!!.reply
        assertThat(reply.author).isEqualTo("Moi")
        assertThat(reply.handle).isEqualTo("moi")
    }

    @Test
    fun `a deleted message a notice and a flame are refused`() {
        assertThat(ImagineRequestBuilder.refusal(message(deletedAt = "2026-10-21T00:00:00Z"), now)).isEqualTo(ImagineRefusal.DELETED)
        assertThat(ImagineRequestBuilder.refusal(message(source = "system"), now)).isEqualTo(ImagineRefusal.NOTICE)
        assertThat(ImagineRequestBuilder.refusal(message(viewOnce = true), now)).isEqualTo(ImagineRefusal.PROTECTED)
        assertThat(ImagineRequestBuilder.refusal(message(blurred = true), now)).isEqualTo(ImagineRefusal.PROTECTED)
        assertThat(ImagineRequestBuilder.refusal(message(duration = 30, flags = MessageEffectFlags.EPHEMERAL.toInt()), now)).isEqualTo(ImagineRefusal.PROTECTED)
        val afterRead = (MessageEffectFlags.EPHEMERAL or MessageEffectFlags.EPHEMERAL_AFTER_READ).toInt()
        assertThat(ImagineRequestBuilder.refusal(message(flags = afterRead), now)).isEqualTo(ImagineRefusal.PROTECTED)
        assertThat(subject(message(viewOnce = true), listOf("en"))).isNull()
    }

    @Test
    fun `a blurred or view once piece makes the whole message unexportable`() {
        val hidden = ApiMessageAttachment(id = "h", mimeType = "image/png", fileUrl = "https://x/h.png", isViewOnce = true)
        assertThat(ImagineRequestBuilder.refusal(message(attachments = listOf(photo(), hidden)), now)).isEqualTo(ImagineRefusal.PROTECTED)
    }

    @Test
    fun `an encrypted piece is not painted and an empty message is refused`() {
        val sealed = ApiMessageAttachment(id = "e", mimeType = "image/png", fileUrl = "https://x/e.png", isEncrypted = true)
        assertThat(ImagineRequestBuilder.paintableMedia(message(attachments = listOf(sealed)))).isEmpty()
        assertThat(ImagineRequestBuilder.refusal(message(content = "  ", attachments = listOf(sealed)), now)).isEqualTo(ImagineRefusal.EMPTY)
    }

    @Test
    fun `a message quoting protected content is refused whole`() {
        val quote = ApiMessageReplyPreview(id = "q", content = "secret", isViewOnce = true)
        assertThat(ImagineRequestBuilder.refusal(message(replyTo = quote), now)).isEqualTo(ImagineRefusal.QUOTES_PROTECTED)
    }

    @Test
    fun `the real quoted message in memory has the last word on the citation`() {
        val quote = ApiMessageReplyPreview(id = "q", content = "ok")
        val real = ApiMessage(id = "q", conversationId = "c1", content = "ok", isViewOnce = true)
        assertThat(ImagineRequestBuilder.refusal(message(replyTo = quote), now, quotedMessage = real)).isEqualTo(ImagineRefusal.QUOTES_PROTECTED)
    }

    @Test
    fun `an ordinary quote is painted with its media after the reply media`() {
        val quote = ApiMessageReplyPreview(id = "q", content = "Look", senderDisplayName = "Bob", attachments = listOf(photo("q1")))
        val s = subject(message(replyTo = quote, attachments = listOf(photo("p1"))), listOf("en"))!!
        assertThat(s.quoted!!.text).isEqualTo("Look")
        assertThat(s.media.map { it.id }).containsExactly("p1", "q1").inOrder()
        assertThat(s.media[0].author!!.isQuoted).isFalse()
        assertThat(s.media[1].author!!.isQuoted).isTrue()
        assertThat(s.hasMediaAuthors).isTrue()
    }

    @Test
    fun `a story reply quotes nothing`() {
        val quote = ApiMessageReplyPreview(id = "q", content = "story")
        val m = message(replyTo = quote).copy(storyReplyToId = "s1")
        assertThat(subject(m, listOf("en"))!!.quoted).isNull()
    }

    @Test
    fun `a sound leaves in the track of the served language with its own transcript`() {
        val tracks = mapOf("fr" to ApiAttachmentTranslation(url = "https://x/a-fr.m4a", durationMs = 13_000, transcription = "Bonjour à tous"))
        val m = message(translations = listOf(translation("fr", "Bonjour")), attachments = listOf(voice(tracks)))
        val sound = subject(m, listOf("fr"))!!.media.single()
        assertThat(sound.fileUrl).isEqualTo("https://x/a-fr.m4a")
        assertThat(sound.transcript).isEqualTo("Bonjour à tous")
        assertThat(sound.durationSeconds).isEqualTo(13.0)
    }

    @Test
    fun `a served track without text shows nothing - never the original transcript`() {
        val tracks = mapOf("fr" to ApiAttachmentTranslation(url = "https://x/a-fr.m4a"))
        val m = message(translations = listOf(translation("fr", "Bonjour")), attachments = listOf(voice(tracks)))
        val sound = subject(m, listOf("fr"))!!.media.single()
        assertThat(sound.fileUrl).isEqualTo("https://x/a-fr.m4a")
        assertThat(sound.transcript).isNull()
    }

    @Test
    fun `a sound in the original language keeps its own file duration and transcript`() {
        val m = message(attachments = listOf(voice(mapOf("fr" to ApiAttachmentTranslation(url = "https://x/a-fr.m4a")))))
        val sound = subject(m, listOf("en"))!!.media.single()
        assertThat(sound.fileUrl).isEqualTo("https://x/a-en.m4a")
        assertThat(sound.transcript).isEqualTo("Hello everyone")
        assertThat(sound.durationSeconds).isEqualTo(12.0)
    }

    @Test
    fun `the export language chooses the track as well as the text`() {
        val tracks = mapOf("es" to ApiAttachmentTranslation(url = "https://x/a-es.m4a", transcription = "Hola a todos"))
        val m = message(translations = listOf(translation("es", "Hola")), attachments = listOf(voice(tracks)))
        val s = subject(m, listOf("en"), language = "es")!!
        assertThat(s.reply.text).isEqualTo("Hola")
        assertThat(s.media.single().fileUrl).isEqualTo("https://x/a-es.m4a")
    }

    @Test
    fun `a photo declares its aspect and a small transparent image is a sticker`() {
        val sticker = ApiMessageAttachment(id = "s", mimeType = "image/webp", fileUrl = "https://x/s.webp", width = 256, height = 256)
        val media = ImagineRequestBuilder.paintableMedia(message(attachments = listOf(photo(), sticker)))
        assertThat(media[0].aspect).isEqualTo(2.0)
        assertThat(media[0].aspectKnown).isTrue()
        assertThat(media[0].isSticker).isFalse()
        assertThat(media[1].isSticker).isTrue()
    }

    @Test
    fun `the file name is readable and carries the output extension`() {
        assertThat(ImagineRequestBuilder.fileName(0L, 0)).isEqualTo("meeshy-19700101-000000.png")
        assertThat(ImagineRequestBuilder.fileName(0L, 3600, ImagineOutput.VIDEO)).isEqualTo("meeshy-19700101-010000.mp4")
    }
}
