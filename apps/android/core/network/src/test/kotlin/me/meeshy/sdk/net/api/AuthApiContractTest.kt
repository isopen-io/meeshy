package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.LoginRequest
import me.meeshy.sdk.model.auth.EmailVerificationRequest
import me.meeshy.sdk.model.auth.LoginOutcome
import me.meeshy.sdk.model.auth.PhoneRecoveryCodeRequest
import me.meeshy.sdk.model.auth.PhoneRecoveryIdentityRequest
import me.meeshy.sdk.model.auth.PhoneRecoveryLookupRequest
import me.meeshy.sdk.model.auth.PhoneRecoveryResendRequest
import me.meeshy.sdk.model.auth.ResendVerificationRequest
import me.meeshy.sdk.model.auth.ResetPasswordRequest
import me.meeshy.sdk.model.auth.ResetTokenVerificationRequest
import me.meeshy.sdk.model.auth.SendPhoneCodeRequest
import me.meeshy.sdk.model.auth.TwoFactorLoginRequest
import me.meeshy.sdk.model.auth.VerificationStatusRequest
import me.meeshy.sdk.model.auth.VerifyPhoneRequest
import org.junit.Test

/**
 * Le contrat d'authentification, route par route, tel qu'il PART : verbe, chemin,
 * corps JSON — et ce que la reponse devient une fois decodee. Complete le garde de
 * litteraux (`ApiPathLiteralGuardTest`) et le manifeste (`AuthRoutesManifestTest`) :
 * ceux-la disent ou on appelle, celui-ci dit CE QU'ON ENVOIE.
 */
class AuthApiContractTest {

    private fun probe(reply: String = """{"success":true}""") = RouteProbe(reply)

    private fun RouteProbe.auth(): AuthApi = api(AuthApi::class.java)

    // --- POST auth/login : quatre formes sous un seul 200 -----------------------------

    @Test
    fun `la connexion envoie username, password et rememberDevice`() = runTest {
        val probe = probe("""{"success":true,"data":{}}""")

        probe.auth().login(LoginRequest("ata", "pw", rememberDevice = true))

        assertThat(probe.call.method).isEqualTo("POST")
        assertThat(probe.call.path).isEqualTo("/api/v1/auth/login")
        assertThat(probe.call.body).isEqualTo("""{"username":"ata","password":"pw","rememberDevice":true}""")
    }

    @Test
    fun `la connexion decode une session complete`() = runTest {
        val probe = probe(
            """{"success":true,"data":{"user":{"id":"u1","username":"ata"},"token":"jwt","sessionToken":"sess","expiresIn":86400,
               "session":{"id":"s1"},"futureField":1}}""",
        )

        val outcome = probe.auth().login(LoginRequest("ata", "pw")).data!!.outcome()

        assertThat(outcome).isInstanceOf(LoginOutcome.Authenticated::class.java)
        assertThat((outcome as LoginOutcome.Authenticated).session.token).isEqualTo("jwt")
    }

    @Test
    fun `la connexion decode le defi de second facteur`() = runTest {
        val probe = probe(
            """{"success":true,"data":{"requires2FA":true,"twoFactorToken":"tmp","user":{"id":"u1","username":"ata"},"message":"Code"}}""",
        )

        val outcome = probe.auth().login(LoginRequest("ata", "pw")).data!!.outcome()

        assertThat(outcome).isEqualTo(LoginOutcome.TwoFactorRequired("tmp"))
    }

    @Test
    fun `la connexion decode l'adresse a prouver`() = runTest {
        val probe = probe(
            """{"success":true,"data":{"status":"verification-required","accountCreated":true,"email":"ata@meeshy.me","pendingSessionToken":"pend"}}""",
        )

        val outcome = probe.auth().login(LoginRequest("ata@meeshy.me", "pw")).data!!.outcome(typedIdentifier = "ata@meeshy.me")

        assertThat(outcome).isInstanceOf(LoginOutcome.VerificationRequired::class.java)
        assertThat((outcome as LoginOutcome.VerificationRequired).pending.pendingSessionToken).isEqualTo("pend")
    }

    @Test
    fun `la connexion decode la confirmation d'un compte`() = runTest {
        val probe = probe(
            """{"success":true,"data":{"requiresConfirmation":true,"account":{"id":"u9","username":"bob"},"intent":"claim-email","maskedEmail":"b***@e***"}}""",
        )

        val outcome = probe.auth().login(LoginRequest("x", "y")).data!!.outcome()

        assertThat(outcome).isInstanceOf(LoginOutcome.LinkConfirmationRequired::class.java)
    }

    @Test
    fun `un statut inconnu ne fait pas echouer le decodage`() = runTest {
        val probe = probe("""{"success":true,"data":{"status":"device-check-required","something":{"new":true}}}""")

        val response = probe.auth().login(LoginRequest("x", "y"))

        assertThat(response.success).isTrue()
        assertThat(response.data!!.outcome()).isNull()
    }

    // --- seconde etape, preuve d'adresse ---------------------------------------------------

    @Test
    fun `la seconde etape envoie le defi et le code`() = runTest {
        val probe = probe("""{"success":true,"data":{"user":{"id":"u1","username":"ata"},"token":"jwt"}}""")

        probe.auth().completeLoginWith2FA(TwoFactorLoginRequest("tmp", "123456"))

        assertThat(probe.call.method).isEqualTo("POST")
        assertThat(probe.call.path).isEqualTo("/api/v1/auth/login/2fa")
        assertThat(probe.call.body).isEqualTo("""{"twoFactorToken":"tmp","code":"123456"}""")
    }

    @Test
    fun `la preuve d'adresse par le code envoie l'adresse, le code et le mot de passe`() = runTest {
        val probe = probe("""{"success":true,"data":{}}""")

        probe.auth().verifyEmail(EmailVerificationRequest.code("123456", email = "a@b.co", password = "Neuf#2026x"))

        assertThat(probe.call.method).isEqualTo("POST")
        assertThat(probe.call.path).isEqualTo("/api/v1/auth/verify-email")
        assertThat(probe.call.body).isEqualTo("""{"email":"a@b.co","code":"123456","password":"Neuf#2026x"}""")
    }

    @Test
    fun `la preuve d'adresse par le lien envoie le jeton, le secret de l'appareil et le oui`() = runTest {
        val probe = probe("""{"success":true,"data":{}}""")

        probe.auth().verifyEmail(
            EmailVerificationRequest.link("tok", email = "a@b.co", confirmed = true).presenting("secret-appareil-0123456789"),
        )

        assertThat(probe.call.body).isEqualTo(
            """{"email":"a@b.co","token":"tok","linkDeviceSecret":"secret-appareil-0123456789","confirm":true}""",
        )
    }

    @Test
    fun `le renvoi de verification envoie l'adresse`() = runTest {
        val probe = probe("""{"success":true,"data":{"message":"ok"}}""")

        val response = probe.auth().resendVerification(ResendVerificationRequest("a@b.co"))

        assertThat(probe.call.path).isEqualTo("/api/v1/auth/resend-verification")
        assertThat(probe.call.body).isEqualTo("""{"email":"a@b.co"}""")
        assertThat(response.success).isTrue()
    }

    @Test
    fun `l'etat d'une attente envoie le jeton d'attente et decode le statut`() = runTest {
        val probe = probe("""{"success":true,"data":{"status":"proven"}}""")

        val response = probe.auth().verificationStatus(VerificationStatusRequest("pend"))

        assertThat(probe.call.method).isEqualTo("POST")
        assertThat(probe.call.path).isEqualTo("/api/v1/auth/verification/status")
        assertThat(probe.call.body).isEqualTo("""{"pendingSessionToken":"pend"}""")
        assertThat(response.data!!.status).isEqualTo("proven")
    }

    // --- reinitialisation ---------------------------------------------------------------

    @Test
    fun `la verification d'un jeton de reinitialisation le met dans le corps`() = runTest {
        val probe = probe("""{"success":true,"data":{"valid":true,"requires2FA":true,"expiresAt":"2026-10-22T12:00:00.000Z"}}""")

        val response = probe.auth().verifyResetToken(ResetTokenVerificationRequest("reset-1"))

        assertThat(probe.call.method).isEqualTo("POST")
        assertThat(probe.call.path).isEqualTo("/api/v1/auth/reset-password/verify-token")
        assertThat(probe.call.query).isNull()
        assertThat(probe.call.body).isEqualTo("""{"token":"reset-1"}""")
        assertThat(response.data!!.requires2FA).isTrue()
    }

    @Test
    fun `la reinitialisation envoie la confirmation et le code de second facteur`() = runTest {
        val probe = probe("""{"success":true,"data":{"message":"ok"}}""")

        probe.auth().resetPassword(ResetPasswordRequest("reset-1", "Neuf#2026x", "Neuf#2026x", twoFactorCode = "123456"))

        assertThat(probe.call.path).isEqualTo("/api/v1/auth/reset-password")
        assertThat(probe.call.body).isEqualTo(
            """{"token":"reset-1","newPassword":"Neuf#2026x","confirmPassword":"Neuf#2026x","twoFactorCode":"123456"}""",
        )
    }

    // --- recuperation par telephone ------------------------------------------------------

    @Test
    fun `la recuperation par telephone parcourt ses quatre routes`() = runTest {
        val lookup = probe(
            """{"success":true,"data":{"tokenId":"t-1","maskedUserInfo":{"displayName":"Ata","username":"a**h","email":"a...h@m***"}}}""",
        )
        val found = lookup.auth().phoneRecoveryLookup(PhoneRecoveryLookupRequest("+33612345678", "FR"))
        assertThat(lookup.call.path).isEqualTo("/api/v1/auth/forgot-password/phone/lookup")
        assertThat(lookup.call.body).isEqualTo("""{"phoneNumber":"+33612345678","countryCode":"FR"}""")
        assertThat(found.data!!.tokenId).isEqualTo("t-1")

        val identity = probe("""{"success":true,"data":{"codeSent":true}}""")
        val sent = identity.auth().phoneRecoveryVerifyIdentity(PhoneRecoveryIdentityRequest("t-1", "atabeth", "ata@meeshy.me"))
        assertThat(identity.call.path).isEqualTo("/api/v1/auth/forgot-password/phone/verify-identity")
        assertThat(identity.call.body).isEqualTo("""{"tokenId":"t-1","fullUsername":"atabeth","fullEmail":"ata@meeshy.me"}""")
        assertThat(sent.data!!.codeSent).isTrue()

        val code = probe("""{"success":true,"data":{"resetToken":"reset-9"}}""")
        val verified = code.auth().phoneRecoveryVerifyCode(PhoneRecoveryCodeRequest("t-1", "123456"))
        assertThat(code.call.path).isEqualTo("/api/v1/auth/forgot-password/phone/verify-code")
        assertThat(code.call.body).isEqualTo("""{"tokenId":"t-1","code":"123456"}""")
        assertThat(verified.data!!.resetToken).isEqualTo("reset-9")

        val resend = probe()
        resend.auth().phoneRecoveryResend(PhoneRecoveryResendRequest("t-1"))
        assertThat(resend.call.path).isEqualTo("/api/v1/auth/forgot-password/phone/resend")
        assertThat(resend.call.body).isEqualTo("""{"tokenId":"t-1"}""")
    }

    @Test
    fun `la verification du telephone parcourt ses deux routes`() = runTest {
        val send = probe("""{"success":true,"data":{"message":"envoye"}}""")
        send.auth().sendPhoneCode(SendPhoneCodeRequest("+33612345678"))
        assertThat(send.call.path).isEqualTo("/api/v1/auth/send-phone-code")
        assertThat(send.call.body).isEqualTo("""{"phoneNumber":"+33612345678"}""")

        val verify = probe("""{"success":true,"data":{"message":"ok"}}""")
        verify.auth().verifyPhone(VerifyPhoneRequest("+33612345678", "123456"))
        assertThat(verify.call.path).isEqualTo("/api/v1/auth/verify-phone")
        assertThat(verify.call.body).isEqualTo("""{"phoneNumber":"+33612345678","code":"123456"}""")
    }

    // --- deconnexion, second facteur, resume de securite --------------------------------

    @Test
    fun `la deconnexion porte les jetons figes dans ses en-tetes`() = runTest {
        val probe = probe("""{"success":true,"data":{"message":"ok"}}""")

        probe.auth().logout(authorization = "Bearer jwt-fige", sessionToken = "sess-fige")

        assertThat(probe.call.method).isEqualTo("POST")
        assertThat(probe.call.path).isEqualTo("/api/v1/auth/logout")
        assertThat(probe.call.header("Authorization")).isEqualTo("Bearer jwt-fige")
        assertThat(probe.call.header("X-Session-Token")).isEqualTo("sess-fige")
    }

    @Test
    fun `la deconnexion omet l'en-tete du jeton qu'elle n'a pas`() = runTest {
        val probe = probe()

        probe.auth().logout(authorization = null, sessionToken = "sess-fige")

        assertThat(probe.call.header("Authorization")).isNull()
        assertThat(probe.call.header("X-Session-Token")).isEqualTo("sess-fige")
    }

    @Test
    fun `la verification d'un code de second facteur decode son verdict`() = runTest {
        val probe = probe("""{"success":true,"data":{"valid":true,"usedBackupCode":true}}""")

        val response = probe.auth().verifyTwoFactor(TwoFactorCodeRequest("ABCD-EFGH"))

        assertThat(probe.call.path).isEqualTo("/api/v1/auth/2fa/verify")
        assertThat(probe.call.body).isEqualTo("""{"code":"ABCD-EFGH"}""")
        assertThat(response.data!!.usedBackupCode).isTrue()
    }

    @Test
    fun `l'annulation d'un enrolement est un POST sans corps`() = runTest {
        val probe = probe("""{"success":true,"data":{"message":"annule"}}""")

        probe.auth().cancelTwoFactorSetup()

        assertThat(probe.call.method).isEqualTo("POST")
        assertThat(probe.call.path).isEqualTo("/api/v1/auth/2fa/cancel")
    }

    @Test
    fun `hasPassword se lit sur auth-me avec expand security`() = runTest {
        val probe = probe("""{"success":true,"data":{"user":{"id":"u1","security":{"hasPassword":false}}}}""")

        val response = probe.auth().meSecurity()

        assertThat(probe.call.method).isEqualTo("GET")
        assertThat(probe.call.path).isEqualTo("/api/v1/auth/me")
        assertThat(probe.call.query).isEqualTo("fields=id&expand=security")
        assertThat(response.data!!.user.security!!.hasPassword).isFalse()
    }

    // --- lien magique et inscription ---------------------------------------------------

    @Test
    fun `la demande de lien magique lie le lien a l'appareil`() = runTest {
        val probe = probe("""{"success":true,"data":{"expiresInSeconds":300,"pendingSessionToken":"pend"}}""")

        val response = probe.auth().requestMagicLink(
            MagicLinkRequestBody(email = "a@b.co", deviceFingerprint = "fp", linkDeviceHash = "abc123"),
        )

        assertThat(probe.call.path).isEqualTo("/api/v1/auth/magic-link/request")
        assertThat(probe.call.body).isEqualTo("""{"email":"a@b.co","deviceFingerprint":"fp","linkDeviceHash":"abc123"}""")
        assertThat(response.data!!.pendingSessionToken).isEqualTo("pend")
    }

    @Test
    fun `la demande de lien magique omet les champs de liaison nuls`() = runTest {
        val probe = probe("""{"success":true,"data":{}}""")

        probe.auth().requestMagicLink(MagicLinkRequestBody(email = "a@b.co"))

        assertThat(probe.call.body).isEqualTo("""{"email":"a@b.co"}""")
    }

    @Test
    fun `la validation du lien presente le secret et le oui`() = runTest {
        val probe = probe("""{"success":true,"data":{"requiresConfirmation":true,"account":{"id":"u9","username":"bob"}}}""")

        val response = probe.auth().validateMagicLink(
            MagicLinkValidateRequest(token = "tok", linkDeviceSecret = "secret", confirm = true),
        )

        assertThat(probe.call.path).isEqualTo("/api/v1/auth/magic-link/validate")
        assertThat(probe.call.body).isEqualTo("""{"token":"tok","linkDeviceSecret":"secret","confirm":true}""")
        assertThat(response.data!!.outcome()).isInstanceOf(LoginOutcome.LinkConfirmationRequired::class.java)
    }

    @Test
    fun `la validation du lien omet le secret et le oui quand ils manquent`() = runTest {
        val probe = probe("""{"success":true,"data":{}}""")

        probe.auth().validateMagicLink(MagicLinkValidateRequest(token = "tok"))

        assertThat(probe.call.body).isEqualTo("""{"token":"tok"}""")
    }

    @Test
    fun `l'inscription par parrainage porte le code, la cle et la revendication`() = runTest {
        val probe = probe("""{"success":true,"data":{}}""")

        probe.auth().register(
            me.meeshy.sdk.model.RegisterRequest(
                email = "a@b.co",
                password = "pw",
                affiliateToken = "ABC123",
                affiliateSessionKey = "visite-1",
                claimEmail = true,
            ),
        )

        assertThat(probe.call.path).isEqualTo("/api/v1/auth/register")
        assertThat(probe.call.body).contains(""""affiliateToken":"ABC123"""")
        assertThat(probe.call.body).contains(""""affiliateSessionKey":"visite-1"""")
        assertThat(probe.call.body).contains(""""claimEmail":true""")
    }
}
