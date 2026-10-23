package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class MessageEncryptionGuardTest {

    private fun message(content: String = "", isEncrypted: Boolean? = null) =
        ApiMessage(id = "m1", conversationId = "c1", content = content, isEncrypted = isEncrypted)

    @Test
    fun `un fil chiffre refuse un message en clair`() {
        val verdict = MessageEncryptionGuard.verdict(threadEncrypted = true, message = message("salut"))

        assertThat(verdict).isEqualTo(
            MessageEncryptionGuard.Verdict.Refused(MessageEncryptionGuard.Reason.PLAINTEXT_IN_ENCRYPTED_THREAD),
        )
    }

    @Test
    fun `un fil chiffre refuse un message dont le drapeau chiffre est absent`() {
        val verdict = MessageEncryptionGuard.verdict(true, message("salut", isEncrypted = null))

        assertThat(verdict).isInstanceOf(MessageEncryptionGuard.Verdict.Refused::class.java)
    }

    @Test
    fun `un fil chiffre admet un message chiffre`() {
        assertThat(MessageEncryptionGuard.verdict(true, message("AAEC", isEncrypted = true)))
            .isEqualTo(MessageEncryptionGuard.Verdict.Admitted)
    }

    @Test
    fun `un fil chiffre admet un message sans texte`() {
        assertThat(MessageEncryptionGuard.verdict(true, message("")))
            .isEqualTo(MessageEncryptionGuard.Verdict.Admitted)
    }

    @Test
    fun `un fil en clair admet tout`() {
        assertThat(MessageEncryptionGuard.verdict(false, message("salut")))
            .isEqualTo(MessageEncryptionGuard.Verdict.Admitted)
    }

    @Test
    fun `un message chiffre n'a aucun texte indexable`() {
        assertThat(MessageEncryptionGuard.searchableText(message("AAEC", isEncrypted = true))).isNull()
        assertThat(MessageEncryptionGuard.searchableText(message("salut"))).isEqualTo("salut")
        assertThat(MessageEncryptionGuard.searchableText(message("  "))).isNull()
    }

    @Test
    fun `le cryptogramme et le contour d'avatar de l'auteur survivent a l'aller-retour JSON`() {
        val json = Json { ignoreUnknownKeys = true; explicitNulls = false }
        val decoded = json.decodeFromString<ApiMessage>(
            """{"id":"m1","conversationId":"c1","isEncrypted":true,"encryptionMode":"e2ee","encryptedContent":"AAEC",
              "sender":{"id":"s1","profileDecor":{"avatarRing":{"pack":"p","item":"i","origin":"official"}}}}""",
        )

        val again = json.decodeFromString<ApiMessage>(json.encodeToString(ApiMessage.serializer(), decoded))

        assertThat(again.encryptedContent).isEqualTo("AAEC")
        assertThat(again.encryptionMode).isEqualTo("e2ee")
        assertThat(again.sender?.profileDecor?.avatarRing?.item).isEqualTo("i")
    }

    @Test
    fun `un cryptogramme malforme ne fait pas echouer le message`() {
        val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

        val decoded = json.decodeFromString<ApiMessage>(
            """{"id":"m1","conversationId":"c1","encryptedContent":{"x":1},"sender":{"id":"s1","profileDecor":"junk"}}""",
        )

        assertThat(decoded.encryptedContent).isNull()
        assertThat(decoded.sender?.id).isEqualTo("s1")
    }
}
