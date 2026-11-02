package me.meeshy.sdk.model.translation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import org.junit.Test

class DeviceTranslationEligibilityTest {
    private fun message(
        content: String = "Hello there",
        sender: String? = "other",
        lang: String? = "en",
        isEncrypted: Boolean? = null,
        mode: String? = null,
        source: String? = null,
        deletedAt: String? = null,
        viewOnce: Boolean? = null,
        blurred: Boolean? = null,
        expiresAt: String? = null,
        ephemeral: Int? = null,
    ) = ApiMessage(
        id = "m1", conversationId = "c1", senderId = sender, content = content, originalLanguage = lang,
        isEncrypted = isEncrypted, encryptionMode = mode, messageSource = source, deletedAt = deletedAt,
        isViewOnce = viewOnce, isBlurred = blurred, expiresAt = expiresAt, ephemeralDuration = ephemeral,
    )

    private fun disposition(m: ApiMessage, conversation: String?) =
        DeviceTranslationEligibility.disposition(m, viewerUserId = "me", conversationEncryptionMode = conversation)

    @Test
    fun `conversation lisible par le serveur partage`() {
        listOf(null, "", "server", "hybrid", " Server ").forEach {
            assertThat(disposition(message(), it)).isEqualTo(DeviceTranslationDisposition.Shareable)
        }
    }

    @Test
    fun `e2ee et mode inconnu restent ephemeres`() {
        listOf("e2ee", "E2EE", "quantum").forEach {
            assertThat(disposition(message(), it)).isEqualTo(DeviceTranslationDisposition.Ephemeral)
        }
    }

    @Test
    fun `message chiffre sans mode est ephemere meme en conversation claire`() {
        assertThat(disposition(message(isEncrypted = true), null)).isEqualTo(DeviceTranslationDisposition.Ephemeral)
        assertThat(disposition(message(isEncrypted = true, mode = "e2ee"), "server"))
            .isEqualTo(DeviceTranslationDisposition.Ephemeral)
        assertThat(disposition(message(isEncrypted = true, mode = "server"), "server"))
            .isEqualTo(DeviceTranslationDisposition.Shareable)
    }

    @Test
    fun `enveloppe base64 non dechiffree est ignoree`() {
        val envelope = "QUJD".repeat(20)
        assertThat(disposition(message(content = envelope), "e2ee")).isEqualTo(DeviceTranslationDisposition.Skip)
        assertThat(disposition(message(content = envelope), "server")).isEqualTo(DeviceTranslationDisposition.Shareable)
    }

    @Test
    fun `table serverReadsMessage`() {
        val read = DeviceTranslationEligibility::serverReadsMessage
        assertThat(read(null, null, null)).isTrue()
        assertThat(read("server", false, null)).isTrue()
        assertThat(read("e2ee", false, null)).isFalse()
        assertThat(read("quantum", false, "server")).isFalse()
        assertThat(read(null, true, null)).isFalse()
        assertThat(read(null, true, "hybrid")).isTrue()
        assertThat(read(null, false, "e2ee")).isFalse()
        assertThat(read("hybrid", true, " HYBRID ")).isTrue()
    }

    @Test
    fun `rien a traduire`() {
        listOf(
            message(sender = "me"), message(source = "system"), message(deletedAt = "2026-01-01"),
            message(viewOnce = true), message(blurred = true), message(expiresAt = "2026-01-01"),
            message(ephemeral = 30), message(content = "  "), message(lang = null), message(lang = " "),
        ).forEach { assertThat(disposition(it, null)).isEqualTo(DeviceTranslationDisposition.Skip) }
    }
}
