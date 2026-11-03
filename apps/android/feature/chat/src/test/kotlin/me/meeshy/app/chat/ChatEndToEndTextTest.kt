package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.composer.ComposerAffordances
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.ui.component.bubble.BubbleContentBuilder
import org.junit.Test

/**
 * #14591 — un appareil chiffré (libsignal) écrit le TEXTE d'un tête-à-tête chiffré de bout en bout, comme iOS ; un
 * groupe chiffré, ou un appareil sans pile, reste fermé ; rien d'autre que du texte ne part ; un message ouvert ici ne
 * se transfère pas.
 */
class ChatEndToEndTextTest {

    private fun state(available: Boolean, peer: String?) =
        ChatUiState(conversationId = "c1", encryptionMode = "e2ee", directPeerUserId = peer, endToEndAvailable = available)

    @Test
    fun `a direct end to end conversation opens the composer to text only on an encrypted device`() {
        val open = state(available = true, peer = "bob")

        assertThat(open.endToEndTextOpen).isTrue()
        assertThat(open.composerClosedForEndToEnd).isFalse()
        assertThat(open.composerAffordances).isEqualTo(ComposerAffordances.TEXT_ONLY)
        assertThat(open.composerAffordances.showsAttachmentLadder).isFalse()
        assertThat(open.viewerMayWrite).isTrue()
    }

    @Test
    fun `an end to end group, or a device without the stack, stays closed`() {
        assertThat(state(available = true, peer = null).composerAffordances).isEqualTo(ComposerAffordances.CLOSED)
        assertThat(state(available = true, peer = null).composerClosedForEndToEnd).isTrue()
        assertThat(state(available = false, peer = "bob").composerAffordances).isEqualTo(ComposerAffordances.CLOSED)
        assertThat(state(available = false, peer = "bob").viewerMayWrite).isFalse()
    }

    @Test
    fun `a clear conversation is untouched by the end to end stack`() {
        val clear = ChatUiState(conversationId = "c1", encryptionMode = null, directPeerUserId = "bob", endToEndAvailable = true)

        assertThat(clear.endToEndTextOpen).isFalse()
        assertThat(clear.composerAffordances.canSendImages).isTrue()
    }

    private val prefs = object : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String? = "fr"
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    @Test
    fun `a message opened on this device shows its text but is never forwarded`() {
        val opened = BubbleContentBuilder.build(
            ApiMessage(id = "m1", conversationId = "c1", senderId = "other", content = "Bonjour", isEncrypted = false, encryptionMode = "e2ee"),
            currentUserId = "me",
            preferences = prefs,
        )

        assertThat(opened.isEndToEndOpened).isTrue()
        assertThat(opened.isEndToEndSealed).isFalse()
        assertThat(MessageActionMenu.actions(opened.actionContext(canWrite = true))).doesNotContain(MessageAction.Forward)
    }
}
