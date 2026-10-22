package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.auth.AnonymousRefreshRequest
import me.meeshy.sdk.model.auth.EmailInvitationRequest
import me.meeshy.sdk.model.auth.PhoneOwnershipCheckRequest
import me.meeshy.sdk.model.auth.PhoneTransferInitiateRegistrationRequest
import me.meeshy.sdk.model.auth.PhoneTransferInitiateRequest
import me.meeshy.sdk.model.auth.PhoneTransferSessionRequest
import me.meeshy.sdk.model.auth.PhoneTransferVerifyRequest
import org.junit.Test

/**
 * Les routes d'authentification qui n'ont pas leur place dans [AuthApi] : le
 * transfert de numero (sept routes), le renouvellement d'une session d'invite et
 * l'invitation par e-mail — verbe, chemin et corps tels qu'ils PARTENT.
 */
class AuthApiRoutesTest {

    private fun transfer(reply: String = """{"success":true}"""): Pair<RouteProbe, PhoneTransferApi> =
        RouteProbe(reply).let { it to it.api(PhoneTransferApi::class.java) }

    // --- le transfert de numero ----------------------------------------------------------

    @Test
    fun `la verification du titulaire envoie l'identite declaree et decode le resultat`() = runTest {
        val (probe, api) = transfer(
            """{"success":true,"data":{"maskedInfo":{"displayName":"Ata","username":"a**h","email":"a...h@m***"},"recoverySuggested":true}}""",
        )

        val response = api.check(PhoneOwnershipCheckRequest("+33612345678", countryCode = "FR", firstName = "Ata", lastName = "Beth"))

        assertThat(probe.call.method).isEqualTo("POST")
        assertThat(probe.call.path).isEqualTo("/api/v1/auth/phone-transfer/check")
        assertThat(probe.call.body).isEqualTo(
            """{"phoneNumber":"+33612345678","countryCode":"FR","firstName":"Ata","lastName":"Beth"}""",
        )
        assertThat(response.data!!.recoverySuggested).isTrue()
        assertThat(response.data!!.maskedInfo!!.username).isEqualTo("a**h")
    }

    @Test
    fun `un numero libre ne rend aucune identite`() = runTest {
        val (_, api) = transfer("""{"success":true,"data":{"maskedInfo":null,"recoverySuggested":false}}""")

        val response = api.check(PhoneOwnershipCheckRequest("+33612345678"))

        assertThat(response.data!!.maskedInfo).isNull()
        assertThat(response.data!!.recoverySuggested).isFalse()
    }

    @Test
    fun `le transfert d'un compte cree envoie le numero et le compte`() = runTest {
        val (probe, api) = transfer(
            """{"success":true,"data":{"transferId":"tr-1","maskedOwnerInfo":{"displayName":"Ata","username":"a**h","email":"a...h@m***"}}}""",
        )

        val response = api.initiate(PhoneTransferInitiateRequest("+33612345678", phoneCountryCode = "FR", newUserId = "u2"))

        assertThat(probe.call.path).isEqualTo("/api/v1/auth/phone-transfer/initiate")
        assertThat(probe.call.body).isEqualTo("""{"phoneNumber":"+33612345678","phoneCountryCode":"FR","newUserId":"u2"}""")
        assertThat(response.data!!.transferId).isEqualTo("tr-1")
    }

    @Test
    fun `le code du titulaire acheve le transfert`() = runTest {
        val (probe, api) = transfer("""{"success":true,"data":{"transferred":true}}""")

        val response = api.verify(PhoneTransferVerifyRequest("tr-1", "123456"))

        assertThat(probe.call.path).isEqualTo("/api/v1/auth/phone-transfer/verify")
        assertThat(probe.call.body).isEqualTo("""{"transferId":"tr-1","code":"123456"}""")
        assertThat(response.data!!.transferred).isTrue()
    }

    @Test
    fun `le renvoi et l'annulation n'envoient que la session de transfert`() = runTest {
        val (resend, resendApi) = transfer()
        resendApi.resend(PhoneTransferSessionRequest("tr-1"))
        assertThat(resend.call.path).isEqualTo("/api/v1/auth/phone-transfer/resend")
        assertThat(resend.call.body).isEqualTo("""{"transferId":"tr-1"}""")

        val (cancel, cancelApi) = transfer()
        cancelApi.cancel(PhoneTransferSessionRequest("tr-1"))
        assertThat(cancel.call.path).isEqualTo("/api/v1/auth/phone-transfer/cancel")
        assertThat(cancel.call.body).isEqualTo("""{"transferId":"tr-1"}""")
    }

    @Test
    fun `le transfert pendant l'inscription envoie le pseudo et l'adresse en attente`() = runTest {
        val (probe, api) = transfer("""{"success":true,"data":{"transferId":"tr-2"}}""")

        val response = api.initiateRegistration(
            PhoneTransferInitiateRegistrationRequest("0612345678", phoneCountryCode = "FR", pendingUsername = "ata", pendingEmail = "a@b.co"),
        )

        assertThat(probe.call.path).isEqualTo("/api/v1/auth/phone-transfer/initiate-registration")
        assertThat(probe.call.body).isEqualTo(
            """{"phoneNumber":"0612345678","phoneCountryCode":"FR","pendingUsername":"ata","pendingEmail":"a@b.co"}""",
        )
        assertThat(response.data!!.transferId).isEqualTo("tr-2")
    }

    @Test
    fun `la verification pendant l'inscription rend le jeton de transfert`() = runTest {
        val (probe, api) = transfer("""{"success":true,"data":{"verified":true,"transferToken":"xfer-1"}}""")

        val response = api.verifyRegistration(PhoneTransferVerifyRequest("tr-2", "123456"))

        assertThat(probe.call.path).isEqualTo("/api/v1/auth/phone-transfer/verify-registration")
        assertThat(response.data!!.transferToken).isEqualTo("xfer-1")
    }

    // --- l'invite et l'invitation ----------------------------------------------------------

    @Test
    fun `le renouvellement d'une session d'invite n'envoie que son jeton`() = runTest {
        val probe = RouteProbe(
            """{"success":true,"data":{"participant":{"id":"p1","canSendMessages":true},"conversation":{"id":"c1","title":"Salon"}}}""",
        )

        val response = probe.api(AnonymousApi::class.java).refresh(AnonymousRefreshRequest("guest-token"))

        assertThat(probe.call.method).isEqualTo("POST")
        assertThat(probe.call.path).isEqualTo("/api/v1/anonymous/refresh")
        assertThat(probe.call.body).isEqualTo("""{"sessionToken":"guest-token"}""")
        assertThat(response.data!!.participant!!.canSendMessages).isTrue()
        assertThat(response.data!!.conversation!!.id).isEqualTo("c1")
    }

    @Test
    fun `l'invitation par e-mail envoie l'adresse et decode le lien`() = runTest {
        val probe = RouteProbe(
            """{"success":true,"data":{"email":"ami@exemple.fr","sentAt":"2026-10-22T10:00:00.000Z","invitationUrl":"https://meeshy.me/signup/affiliate/tok"}}""",
        )

        val response = probe.api(InvitationApi::class.java).inviteByEmail(EmailInvitationRequest("ami@exemple.fr"))

        assertThat(probe.call.method).isEqualTo("POST")
        assertThat(probe.call.path).isEqualTo("/api/v1/invitations/email")
        assertThat(probe.call.body).isEqualTo("""{"email":"ami@exemple.fr"}""")
        assertThat(response.data!!.invitationUrl).isEqualTo("https://meeshy.me/signup/affiliate/tok")
    }
}
