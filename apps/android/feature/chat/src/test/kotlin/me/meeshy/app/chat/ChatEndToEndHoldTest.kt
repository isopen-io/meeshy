package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.composer.ComposerAffordances
import me.meeshy.ui.component.bubble.BubbleContent
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
}
