package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * `POST /auth/verify-email` accepte deux preuves et refuse tout mélange
 * (`AuthSchemas.verifyEmail`) : le code porte le mot de passe optionnel, le lien
 * porte le secret de l'appareil et le « oui » — jamais l'inverse. Le JSON est
 * mesuré avec le réglage de `MeeshyApi.json` (`encodeDefaults = false`,
 * `explicitNulls = false`), celui qui part réellement.
 */
class EmailVerificationWireTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private fun wire(request: EmailVerificationRequest): String =
        json.encodeToString(EmailVerificationRequest.serializer(), request)

    @Test
    fun `le code porte l'adresse et le code, sans rien d'autre`() {
        val request = EmailVerificationRequest.code("123456", email = "ata@meeshy.me")

        assertThat(wire(request)).isEqualTo("""{"email":"ata@meeshy.me","code":"123456"}""")
    }

    @Test
    fun `le code porte le mot de passe quand il est saisi`() {
        val request = EmailVerificationRequest.code("123456", email = "ata@meeshy.me", password = "Secret#2026")

        assertThat(wire(request)).isEqualTo(
            """{"email":"ata@meeshy.me","code":"123456","password":"Secret#2026"}""",
        )
    }

    @Test
    fun `un mot de passe vide n'en est pas un`() {
        val request = EmailVerificationRequest.code("123456", email = "ata@meeshy.me", password = "")

        assertThat(request.password).isNull()
        assertThat(wire(request)).doesNotContain("password")
    }

    @Test
    fun `le lien porte le jeton et jamais de mot de passe`() {
        val request = EmailVerificationRequest.link(token = "tok-1", email = "ata@meeshy.me")

        assertThat(request.password).isNull()
        assertThat(wire(request)).isEqualTo("""{"email":"ata@meeshy.me","token":"tok-1"}""")
    }

    @Test
    fun `le lien ne porte confirm que lorsqu'il est confirme`() {
        val declined = EmailVerificationRequest.link("tok-1", email = "a@b.co", confirmed = false)
        val confirmed = EmailVerificationRequest.link("tok-1", email = "a@b.co", confirmed = true)

        assertThat(wire(declined)).doesNotContain("confirm")
        assertThat(wire(confirmed)).isEqualTo("""{"email":"a@b.co","token":"tok-1","confirm":true}""")
    }

    @Test
    fun `le secret de l'appareil accompagne le lien`() {
        val request = EmailVerificationRequest.link("tok-1", email = "a@b.co").presenting("secret-appareil-0123456789")

        assertThat(wire(request)).isEqualTo(
            """{"email":"a@b.co","token":"tok-1","linkDeviceSecret":"secret-appareil-0123456789"}""",
        )
    }

    @Test
    fun `le secret de l'appareil n'accompagne jamais un code`() {
        val request = EmailVerificationRequest.code("123456", email = "a@b.co").presenting("secret-appareil-0123456789")

        assertThat(request.linkDeviceSecret).isNull()
        assertThat(wire(request)).doesNotContain("linkDeviceSecret")
    }

    @Test
    fun `un secret blanc se lit absent`() {
        val request = EmailVerificationRequest.link("tok-1", email = "a@b.co").presenting("   ")

        assertThat(request.linkDeviceSecret).isNull()
    }

    @Test
    fun `l'attente d'une preuve lit pending tant que rien n'est prouve`() {
        assertThat(EmailVerificationWatchStatus.served("pending")).isEqualTo(EmailVerificationWatchStatus.PENDING)
        assertThat(EmailVerificationWatchStatus.served(null)).isEqualTo(EmailVerificationWatchStatus.PENDING)
        assertThat(EmailVerificationWatchStatus.served("quelque-chose-de-neuf")).isEqualTo(EmailVerificationWatchStatus.PENDING)
    }

    @Test
    fun `l'attente d'une preuve lit proven quand la passerelle le dit`() {
        assertThat(EmailVerificationWatchStatus.served("proven")).isEqualTo(EmailVerificationWatchStatus.PROVEN)
    }

    @Test
    fun `un jeton d'attente inconnu ou expire finit l'attente, une panne non`() {
        assertThat(EmailVerificationWatchStatus.ending(401)).isEqualTo(EmailVerificationWatchStatus.ENDED)
        assertThat(EmailVerificationWatchStatus.ending(410)).isEqualTo(EmailVerificationWatchStatus.ENDED)
        assertThat(EmailVerificationWatchStatus.ending(500)).isNull()
        assertThat(EmailVerificationWatchStatus.ending(null)).isNull()
    }

    @Test
    fun `le statut servi se decode meme mal type`() {
        val ok = json.decodeFromString(VerificationStatusData.serializer(), """{"status":"proven"}""")
        val mauvais = json.decodeFromString(VerificationStatusData.serializer(), """{"status":{"x":1}}""")

        assertThat(ok.status).isEqualTo("proven")
        assertThat(mauvais.status).isNull()
    }
}
