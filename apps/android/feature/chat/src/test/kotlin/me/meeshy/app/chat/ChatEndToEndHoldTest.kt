package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.composer.ComposerAffordances
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.BubbleContentBuilder
import org.junit.Test

/**
 * #12956 × #13099 — un fil qui MONTRE un message scellé (e2ee, chiffré sans mode, pièce chiffrée)
 * ferme le composeur tant qu'il le montre, même si la conversation est servie sans mode : aucun
 * clair ne part d'un fil qui affiche du bout en bout.
 */
class ChatEndToEndHoldTest {

    private fun bubble(id: String, sealed: Boolean) = BubbleContent(
        messageId = id,
        text = "",
        isOutgoing = false,
        isTranslated = false,
        originalText = null,
        senderName = null,
        showSenderName = false,
        isEdited = false,
        isDeleted = false,
        createdAtIso = null,
        isEndToEndSealed = sealed,
    )

    @Test
    fun `un message scellé affiché ferme le composeur d'une conversation servie sans mode`() {
        val state = ChatUiState(conversationId = "c1", encryptionMode = null, messages = listOf(bubble("m1", sealed = false), bubble("m2", sealed = true)))

        assertThat(state.isEndToEnd).isTrue()
        assertThat(state.composerAffordances).isEqualTo(ComposerAffordances.CLOSED)
        assertThat(state.viewerMayWrite).isFalse()
    }

    @Test
    fun `un fil en clair laisse écrire`() {
        val state = ChatUiState(conversationId = "c1", encryptionMode = null, messages = listOf(bubble("m1", sealed = false)))

        assertThat(state.isEndToEnd).isFalse()
    }

    private val prefs = object : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String? = "fr"
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    private fun served(isEncrypted: Boolean?, mode: String?) = BubbleContentBuilder.build(
        ApiMessage(id = "m1", conversationId = "c1", senderId = "other", content = "U2FsdGVkX1+opaque", isEncrypted = isEncrypted, encryptionMode = mode),
        currentUserId = "me",
        preferences = prefs,
    )

    @Test
    fun `un chiffré servi sans mode ou d'un mode inconnu retient l'envoi d'une conversation servie sans mode`() {
        listOf(served(isEncrypted = true, mode = null), served(isEncrypted = true, mode = "signal_v4")).forEach { bubble ->
            val state = ChatUiState(conversationId = "c1", encryptionMode = null, messages = listOf(bubble))

            assertThat(state.isEndToEnd).isTrue()
            assertThat(state.composerAffordances).isEqualTo(ComposerAffordances.CLOSED)
        }
    }

    @Test
    fun `un message e2ee servi sans drapeau de chiffrement retient l'envoi`() {
        val state = ChatUiState(conversationId = "c1", encryptionMode = null, messages = listOf(served(isEncrypted = null, mode = "e2ee")))

        assertThat(state.isEndToEnd).isTrue()
    }

    @Test
    fun `un chiffré lisible par le serveur laisse écrire`() {
        val state = ChatUiState(conversationId = "c1", encryptionMode = null, messages = listOf(served(isEncrypted = true, mode = "server"), served(isEncrypted = true, mode = "hybrid")))

        assertThat(state.isEndToEnd).isFalse()
    }
}
