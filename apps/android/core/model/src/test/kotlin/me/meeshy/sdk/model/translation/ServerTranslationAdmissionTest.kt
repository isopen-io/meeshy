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

    @Test
    fun `le refus se publie sur la ligne de la langue demandee`() {
        val refusal = ServerTranslationAdmission.refusalOrNull(
            message(mode = "e2ee"), "e2ee", false, "de", TranslationRequestFailure.Kind.AUDIO,
        )
        assertThat(refusal).isEqualTo(
            TranslationRequestFailure.serverRefused("m", "de", TranslationRequestFailure.Kind.AUDIO),
        )
        assertThat(refusal?.rowKey).isEqualTo("m|de")
    }

    @Test
    fun `un fil qui montre un message scelle refuse meme servi sans mode`() {
        assertThat(
            ServerTranslationAdmission.refusalOrNull(message(), null, true, "de", TranslationRequestFailure.Kind.TEXT),
        ).isNotNull()
        assertThat(
            ServerTranslationAdmission.refusalOrNull(message(), null, false, "de", TranslationRequestFailure.Kind.TEXT),
        ).isNull()
    }

    @Test
    fun `un message inconnu dans une conversation chiffree est refuse`() {
        assertThat(
            ServerTranslationAdmission.refusalOrNull(null, "e2ee", false, "fr", TranslationRequestFailure.Kind.TEXT),
        ).isNotNull()
    }
}
