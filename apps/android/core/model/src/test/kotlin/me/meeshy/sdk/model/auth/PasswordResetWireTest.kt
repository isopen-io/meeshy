package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * Le contrat de la réinitialisation (#10866, #10867) : le verdict d'un jeton sans le
 * consommer, et le corps de la soumission avec ou sans code de second facteur.
 */
class PasswordResetWireTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private fun verification(raw: String): ResetTokenVerification =
        json.decodeFromString(ResetTokenVerification.serializer(), raw)

    @Test
    fun `un jeton valide d'un compte ordinaire`() {
        val result = verification("""{"valid":true,"requires2FA":false,"expiresAt":"2026-10-22T12:00:00.000Z"}""")

        assertThat(result).isEqualTo(ResetTokenVerification(valid = true, requires2FA = false))
    }

    @Test
    fun `un jeton valide d'un compte protege demande le code de second facteur`() {
        assertThat(verification("""{"valid":true,"requires2FA":true}""").requires2FA).isTrue()
    }

    @Test
    fun `requires2FA absent se lit faux`() {
        assertThat(verification("""{"valid":true}""").requires2FA).isFalse()
    }

    @Test
    fun `un jeton refuse n'est pas valide`() {
        assertThat(verification("""{"valid":false}""").valid).isFalse()
    }

    @Test
    fun `une charge sans verdict ne presume pas un lien valide`() {
        assertThat(verification("{}").valid).isFalse()
    }

    @Test
    fun `le jeton voyage dans le corps de la verification`() {
        val raw = json.encodeToString(ResetTokenVerificationRequest.serializer(), ResetTokenVerificationRequest("reset-1"))

        assertThat(raw).isEqualTo("""{"token":"reset-1"}""")
    }

    @Test
    fun `la soumission sans second facteur omet le code`() {
        val request = ResetPasswordRequest(token = "reset-1", newPassword = "Neuf#2026x", confirmPassword = "Neuf#2026x")

        assertThat(json.encodeToString(ResetPasswordRequest.serializer(), request)).isEqualTo(
            """{"token":"reset-1","newPassword":"Neuf#2026x","confirmPassword":"Neuf#2026x"}""",
        )
    }

    @Test
    fun `la soumission d'un compte protege porte le code`() {
        val request = ResetPasswordRequest(
            token = "reset-1",
            newPassword = "Neuf#2026x",
            confirmPassword = "Neuf#2026x",
            twoFactorCode = "123456",
        )

        assertThat(json.encodeToString(ResetPasswordRequest.serializer(), request)).isEqualTo(
            """{"token":"reset-1","newPassword":"Neuf#2026x","confirmPassword":"Neuf#2026x","twoFactorCode":"123456"}""",
        )
    }

    @Test
    fun `la confirmation part toujours, la passerelle la refuse absente`() {
        val request = ResetPasswordRequest(token = "t", newPassword = "p", confirmPassword = "p")

        assertThat(json.encodeToString(ResetPasswordRequest.serializer(), request)).contains("confirmPassword")
    }
}
