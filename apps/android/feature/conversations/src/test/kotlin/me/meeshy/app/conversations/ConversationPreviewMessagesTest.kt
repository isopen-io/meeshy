package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.conversation.LocalSendState
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageSender
import me.meeshy.sdk.model.ApiTextTranslation
import org.junit.Test

class ConversationPreviewMessagesTest {

    private val labels = LastMessagePreviewLabels(
        photo = "📷 Photo",
        video = "🎬 Vidéo",
        voice = "🎵 Message vocal",
        file = "📎 Fichier",
        location = "📍 Localisation",
        none = "Aucun message",
        you = "Vous",
        senderFormat = "%1\$s : %2\$s",
        draftPrefix = "Brouillon : ",
    )

    private fun local(
        id: String = "m1",
        content: String = "Salut !",
        senderId: String? = "other",
        senderName: String? = "Alice",
        messageType: String = "text",
        translations: List<ApiTextTranslation> = emptyList(),
        sendState: LocalSendState = LocalSendState.SYNCED,
    ) = LocalMessage(
        message = ApiMessage(
            id = id,
            conversationId = "c1",
            senderId = senderId,
            content = content,
            messageType = messageType,
            sender = senderName?.let { ApiMessageSender(displayName = it) },
            translations = translations,
        ),
        sendState = sendState,
    )

    private fun prefs(system: String? = null) = object : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String? = system
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    @Test
    fun `an empty list of messages yields an empty list of lines`() {
        assertThat(previewLines(emptyList(), currentUserId = "me", showSender = false, prefs = null, labels = labels))
            .isEmpty()
    }

    @Test
    fun `each message becomes one formatted line, in the same order`() {
        val lines = previewLines(
            listOf(local(id = "m1", content = "Salut"), local(id = "m2", content = "Ça va ?")),
            currentUserId = "me",
            showSender = false,
            prefs = null,
            labels = labels,
        )

        assertThat(lines).containsExactly("Salut", "Ça va ?").inOrder()
    }

    @Test
    fun `showSender true prefixes the sender name, mirroring the row preview`() {
        val lines = previewLines(
            listOf(local(senderId = "other", senderName = "Alice", content = "Salut")),
            currentUserId = "me",
            showSender = true,
            prefs = null,
            labels = labels,
        )

        assertThat(lines).containsExactly("Alice : Salut")
    }

    @Test
    fun `my own message is prefixed with the you label`() {
        val lines = previewLines(
            listOf(local(senderId = "me", senderName = "Me", content = "Salut")),
            currentUserId = "me",
            showSender = true,
            prefs = null,
            labels = labels,
        )

        assertThat(lines).containsExactly("Vous : Salut")
    }

    @Test
    fun `a media message with no caption falls back to its type label`() {
        val lines = previewLines(
            listOf(local(content = "", messageType = "audio")),
            currentUserId = "me",
            showSender = false,
            prefs = null,
            labels = labels,
        )

        assertThat(lines).containsExactly("🎵 Message vocal")
    }

    @Test
    fun `the Prisme preferred translation wins over the original content`() {
        val lines = previewLines(
            listOf(
                local(
                    content = "Hello",
                    translations = listOf(ApiTextTranslation(targetLanguage = "fr", translatedContent = "Bonjour")),
                ),
            ),
            currentUserId = "me",
            showSender = false,
            prefs = prefs(system = "fr"),
            labels = labels,
        )

        assertThat(lines).containsExactly("Bonjour")
    }

    @Test
    fun `no matching translation shows the original content, never a mismatched one`() {
        val lines = previewLines(
            listOf(
                local(
                    content = "Hello",
                    translations = listOf(ApiTextTranslation(targetLanguage = "es", translatedContent = "Hola")),
                ),
            ),
            currentUserId = "me",
            showSender = false,
            prefs = prefs(system = "fr"),
            labels = labels,
        )

        assertThat(lines).containsExactly("Hello")
    }

    @Test
    fun `a null preferences argument resolves as no in-app preference configured`() {
        val lines = previewLines(
            listOf(
                local(
                    content = "Hello",
                    translations = listOf(ApiTextTranslation(targetLanguage = "fr", translatedContent = "Bonjour")),
                ),
            ),
            currentUserId = "me",
            showSender = false,
            prefs = null,
            labels = labels,
        )

        // No system/regional/custom language configured and no device locale supplied →
        // the Prisme fallback ("fr") still matches this fixture's french translation.
        assertThat(lines).containsExactly("Bonjour")
    }
}
