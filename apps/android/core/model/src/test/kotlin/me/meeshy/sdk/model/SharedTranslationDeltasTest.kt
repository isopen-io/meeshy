package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.translation.SharedTranslation
import me.meeshy.sdk.model.translation.SharedTranslationBinding
import me.meeshy.sdk.model.translation.SharedTranslationEnvelope
import me.meeshy.sdk.model.translation.SharedTranslationInner
import me.meeshy.sdk.model.translation.SharedTranslationKdf
import me.meeshy.sdk.model.translation.SharedTranslationKeySource
import me.meeshy.sdk.model.translation.SharedTranslationSeal
import org.junit.Test

class SharedTranslationDeltasTest {

    private val conversationId = "64b7f0c2a1b2c3d4e5f60718"
    private val messageId = "64b7f0c2a1b2c3d4e5f60719"
    private val original = "Hello everyone"

    private fun message(
        content: String = original,
        originalLanguage: String? = "en",
        translations: List<ApiTextTranslation> = emptyList(),
        isEncrypted: Boolean? = null,
        encryptionMode: String? = null,
        deletedAt: String? = null,
    ) = ApiMessage(
        id = messageId, conversationId = conversationId, senderId = "author", content = content,
        originalLanguage = originalLanguage, translations = translations,
        isEncrypted = isEncrypted, encryptionMode = encryptionMode, deletedAt = deletedAt,
    )

    private fun shared(
        target: String = "fr",
        text: String = "Bonjour à tous",
        sourceContent: String = original,
        id: String = "t1",
        conversation: String = conversationId,
        message: String = messageId,
        envelope: SharedTranslationEnvelope? = null,
    ): SharedTranslation {
        val sealed = envelope ?: SharedTranslationSeal.seal(
            SharedTranslationBinding(conversationId, messageId, target, sourceContent),
            SharedTranslationKeySource.MessageContent,
            SharedTranslationInner(text = text, sourceLanguage = "en", engine = "apple-translate"),
        )
        return SharedTranslation(id, conversation, message, target, sealed, "u2", "2026-10-29T10:00:00.000Z")
    }

    @Test
    fun `a translation shared by a member opens with the message text and joins its translations`() {
        val merged = SharedTranslationDeltas.merge(message(), shared(), readerLanguages = listOf("fr", "en"))

        val added = merged.translations.single()
        assertThat(added.targetLanguage).isEqualTo("fr")
        assertThat(added.translatedContent).isEqualTo("Bonjour à tous")
        assertThat(added.sourceLanguage).isEqualTo("en")
        assertThat(added.translationModel).isEqualTo("apple-translate")
        assertThat(added.id).isEqualTo("shared:t1")
        assertThat(added.messageId).isEqualTo(messageId)
    }

    @Test
    fun `the Prisme still decides what is shown, the shared translation only joins the others`() {
        val merged = SharedTranslationDeltas.merge(message(), shared(), listOf("fr", "en"))
        val prefs = object : me.meeshy.sdk.lang.LanguageResolver.ContentLanguagePreferences {
            override val systemLanguage: String = "fr"
            override val regionalLanguage: String? = null
            override val customDestinationLanguage: String? = null
        }

        assertThat(merged.displayContent(prefs)).isEqualTo("Bonjour à tous")
        assertThat(merged.content).isEqualTo(original)
    }

    @Test
    fun `a translation already served for that language is never overwritten`() {
        val served = message(translations = listOf(ApiTextTranslation(targetLanguage = "fr", translatedContent = "Salut tout le monde")))

        assertThat(SharedTranslationDeltas.merge(served, shared(), listOf("fr"))).isSameInstanceAs(served)
    }

    @Test
    fun `a lower rank is not worth keeping once a higher rank is served`() {
        val frenchServed = message(translations = listOf(ApiTextTranslation(targetLanguage = "fr", translatedContent = "Salut")))

        assertThat(SharedTranslationDeltas.merge(frenchServed, shared(target = "es", text = "Hola a todos"), listOf("fr", "es"))).isSameInstanceAs(frenchServed)
    }

    @Test
    fun `a language the reader does not read is left alone`() {
        val plain = message()

        assertThat(SharedTranslationDeltas.merge(plain, shared(target = "de", text = "Hallo zusammen"), listOf("fr", "en"))).isSameInstanceAs(plain)
        assertThat(SharedTranslationDeltas.merge(plain, shared(), readerLanguages = emptyList())).isSameInstanceAs(plain)
    }

    @Test
    fun `a message already written in the reader language needs no translation`() {
        val english = message(originalLanguage = "en")

        assertThat(SharedTranslationDeltas.merge(english, shared(target = "en", text = "Hello all"), listOf("en", "fr"))).isSameInstanceAs(english)
    }

    @Test
    fun `without a known original language nothing is merged`() {
        val unknown = message(originalLanguage = null)

        assertThat(SharedTranslationDeltas.merge(unknown, shared(), listOf("fr"))).isSameInstanceAs(unknown)
    }

    @Test
    fun `regional spellings match the language the gateway keys by`() {
        val merged = SharedTranslationDeltas.merge(message(), shared(), listOf("fr-FR"))

        assertThat(merged.translations.single().targetLanguage).isEqualTo("fr")
    }

    @Test
    fun `an envelope sealed over another text or another message does not open`() {
        val plain = message()

        assertThat(SharedTranslationDeltas.merge(plain, shared(sourceContent = "Another text"), listOf("fr"))).isSameInstanceAs(plain)

        val edited = message(content = "edited since")
        assertThat(SharedTranslationDeltas.merge(edited, shared(), listOf("fr"))).isSameInstanceAs(edited)
    }

    @Test
    fun `a translation for another message or conversation is refused`() {
        val plain = message()

        assertThat(SharedTranslationDeltas.merge(plain, shared(message = "64b7f0c2a1b2c3d4e5f60700"), listOf("fr"))).isSameInstanceAs(plain)
        assertThat(SharedTranslationDeltas.merge(plain, shared(conversation = "64b7f0c2a1b2c3d4e5f60700"), listOf("fr"))).isSameInstanceAs(plain)
    }

    @Test
    fun `a malformed envelope or a message-secret envelope is dropped without a throw`() {
        val plain = message()
        val garbage = SharedTranslationEnvelope(1, "A256GCM", SharedTranslationKdf.MESSAGE_CONTENT, "pas-du-base64")
        val secret = SharedTranslationEnvelope(1, "A256GCM", SharedTranslationKdf.MESSAGE_SECRET, "AAAA")

        assertThat(SharedTranslationDeltas.merge(plain, shared(envelope = garbage), listOf("fr"))).isSameInstanceAs(plain)
        assertThat(SharedTranslationDeltas.merge(plain, shared(envelope = secret), listOf("fr"))).isSameInstanceAs(plain)
    }

    @Test
    fun `a sealed or deleted message takes nothing in clear`() {
        val sealed = message(content = "[Encrypted]", isEncrypted = true, encryptionMode = "e2ee")
        val tomb = message(deletedAt = "2026-10-29T09:00:00Z")
        val ciphertextOnly = message(isEncrypted = true)

        assertThat(SharedTranslationDeltas.merge(sealed, shared(sourceContent = "[Encrypted]"), listOf("fr"))).isSameInstanceAs(sealed)
        assertThat(SharedTranslationDeltas.merge(tomb, shared(), listOf("fr"))).isSameInstanceAs(tomb)
        assertThat(SharedTranslationDeltas.merge(ciphertextOnly, shared(), listOf("fr"))).isSameInstanceAs(ciphertextOnly)
    }

    @Test
    fun `a replayed share is the same instance`() {
        val once = SharedTranslationDeltas.merge(message(), shared(), listOf("fr"))

        assertThat(SharedTranslationDeltas.merge(once, shared(), listOf("fr"))).isSameInstanceAs(once)
    }
}
