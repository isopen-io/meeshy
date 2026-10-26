package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** L'Android natif ne lit pas encore l'e2ee (#13110, #13015) : ce qu'il ne peut pas ouvrir est scellé. */
class EndToEndSealedMessageTest {

    private fun message(content: String, isEncrypted: Boolean?, encryptionMode: String?) = ApiMessage(
        id = "m1",
        conversationId = "c1",
        content = content,
        isEncrypted = isEncrypted,
        encryptionMode = encryptionMode,
    )

    @Test
    fun `the gateway's e2ee literal is sealed`() {
        assertThat(message("[Encrypted]", isEncrypted = true, encryptionMode = "e2ee").isEndToEndSealed).isTrue()
    }

    @Test
    fun `an e2ee ciphertext is sealed whatever its served content`() {
        assertThat(message("", isEncrypted = true, encryptionMode = "E2EE").isEndToEndSealed).isTrue()
    }

    @Test
    fun `a server-mode message served in clear is readable`() {
        assertThat(message("Bonjour", isEncrypted = false, encryptionMode = "server").isEndToEndSealed).isFalse()
    }

    @Test
    fun `a clear message of an e2ee conversation that is not served encrypted is not sealed here`() {
        assertThat(message("Activation du chiffrement", isEncrypted = false, encryptionMode = "e2ee").isEndToEndSealed).isFalse()
    }

    @Test
    fun `the regime reads e2ee whatever its case and spaces`() {
        assertThat(EndToEndRegime.isEndToEnd(" E2ee ")).isTrue()
        assertThat(EndToEndRegime.isEndToEnd("hybrid")).isFalse()
        assertThat(EndToEndRegime.isEndToEnd(null)).isFalse()
    }
}
