package me.meeshy.core.e2ee.render

import com.google.common.truth.Truth.assertThat
import me.meeshy.core.e2ee.content.E2eeContent
import me.meeshy.core.e2ee.store.E2eePlaintextEntry
import me.meeshy.sdk.model.ApiMessage
import org.junit.Test

class EndToEndPlaintextOverlayTest {
    private fun served(id: String = "m1", cid: String? = "cid_1") = ApiMessage(
        id = id, conversationId = "c1", content = "[Encrypted]", isEncrypted = true, encryptionMode = "e2ee", clientMessageId = cid,
    )

    private fun readable(text: String, language: String? = "fr") =
        E2eePlaintextEntry.Readable(E2eeContent.compose(text, language, null, "c1", "cid_1", 1L), "alice")

    @Test
    fun anOpenedMessage_showsItsPlaintext_butStaysEndToEnd() {
        val shown = EndToEndPlaintextOverlay.apply(served(), mapOf("m1" to readable("Bonjour")))

        assertThat(shown.content).isEqualTo("Bonjour")
        assertThat(shown.originalLanguage).isEqualTo("fr")
        assertThat(shown.encryptionMode).isEqualTo("e2ee")
        assertThat(shown.isEndToEndSealed).isFalse()
    }

    @Test
    fun myOwnSend_isFoundUnderItsClientId_beforeTheServerIdIsKnown() {
        val shown = EndToEndPlaintextOverlay.apply(served(id = "cid_1"), mapOf("cid_1" to readable("envoyé")))
        assertThat(shown.content).isEqualTo("envoyé")
    }

    @Test
    fun anUndecryptableOrUnknownMessage_staysSealed() {
        assertThat(EndToEndPlaintextOverlay.apply(served(), mapOf("m1" to E2eePlaintextEntry.Undecryptable)).isEndToEndSealed).isTrue()
        assertThat(EndToEndPlaintextOverlay.apply(served(), emptyMap()).isEndToEndSealed).isTrue()
    }

    @Test
    fun aPlaintextMessage_isNeverRewritten_evenIfTheVaultHoldsItsId() {
        val clear = ApiMessage(id = "m1", conversationId = "c1", content = "en clair")
        assertThat(EndToEndPlaintextOverlay.apply(clear, mapOf("m1" to readable("autre")))).isEqualTo(clear)
    }
}
