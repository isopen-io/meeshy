package me.meeshy.sdk.model.translation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import org.junit.Test

class ServerTranslationAdmissionTest {
    private fun message(isEncrypted: Boolean? = null, mode: String? = null) =
        ApiMessage(id = "m", conversationId = "c", isEncrypted = isEncrypted, encryptionMode = mode)

    @Test
    fun `une conversation claire admet`() {
        assertThat(ServerTranslationAdmission.admits(message(), null)).isTrue()
        assertThat(ServerTranslationAdmission.admits(null, "hybrid")).isTrue()
    }

    @Test
    fun `fail-closed sur e2ee, mode inconnu et message chiffre sans mode`() {
        assertThat(ServerTranslationAdmission.admits(message(), "e2ee")).isFalse()
        assertThat(ServerTranslationAdmission.admits(null, "e2ee")).isFalse()
        assertThat(ServerTranslationAdmission.admits(message(), "mystere")).isFalse()
        assertThat(ServerTranslationAdmission.admits(message(isEncrypted = true), null)).isFalse()
        assertThat(ServerTranslationAdmission.admits(message(mode = "e2ee"), "server")).isFalse()
    }

    @Test
    fun `hors conversation la piece chiffree compte`() {
        assertThat(ServerTranslationAdmission.admitsOutsideConversation(message())).isTrue()
        assertThat(ServerTranslationAdmission.admitsOutsideConversation(message(isEncrypted = true))).isFalse()
    }
}
