package me.meeshy.sdk.auth

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.auth.EmailCodeDispatch
import me.meeshy.sdk.model.auth.EmailVerificationRequest
import me.meeshy.sdk.model.auth.LinkSignInAccount
import me.meeshy.sdk.model.auth.LoginResponse
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.net.api.MagicLinkRequestBody
import me.meeshy.sdk.net.api.MagicLinkRequestData
import me.meeshy.sdk.net.api.MagicLinkValidateRequest
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.session.SessionTeardown
import me.meeshy.sdk.sync.SyncSeqTracker
import org.junit.Test

/** Le lien de connexion lié à l'appareil demandeur : l'empreinte part, le secret reste, puis s'oublie une fois réglé. */
class AuthRepositoryLinkDeviceTest {

    private class Scenario(val api: AuthApi, val binding: LinkDeviceBinding, val repository: AuthRepository)

    private fun scenario(): Scenario {
        val api = mockk<AuthApi>()
        val store = InMemoryTokenStore()
        val binding = LinkDeviceBinding(InMemoryLinkDeviceSecretStore()) { ByteArray(32) { it.toByte() } }
        val repository = AuthRepository(
            api,
            store,
            SessionRepository(api, store),
            object : SessionTeardown { override suspend fun wipe() = Unit },
            SyncSeqTracker(),
            linkDevice = binding,
        )
        return Scenario(api, binding, repository)
    }

    private fun session() = LoginResponse(
        user = MeeshyUser(id = "u1", username = "ada"),
        token = "jwt",
        sessionToken = "sess",
        expiresIn = 86_400,
    )

    private fun confirmation() = LoginResponse(requiresConfirmation = true, account = LinkSignInAccount("u9", "bob"))

    @Test
    fun `requesting the email code sends the hash of a secret that stays on the device`() = runTest {
        val s = scenario()
        val sent = mutableListOf<MagicLinkRequestBody>()
        coEvery { s.api.requestMagicLink(capture(sent)) } returns
            ApiResponse(success = true, data = MagicLinkRequestData(expiresInSeconds = 600, pendingSessionToken = "pending"))

        val dispatch = s.repository.requestEmailCode("ada@example.com").getOrNull()

        assertThat(dispatch).isEqualTo(EmailCodeDispatch(expiresInSeconds = 600, pendingSessionToken = "pending"))
        val secret = s.binding.presentedSecret()!!
        assertThat(sent.single().email).isEqualTo("ada@example.com")
        assertThat(sent.single().linkDeviceHash).isEqualTo(LinkDeviceBinding.hash(secret))
        assertThat(sent.single().linkDeviceHash).isNotEqualTo(secret)
    }

    @Test
    fun `a gateway that serves no duration falls back to five minutes`() = runTest {
        val s = scenario()
        coEvery { s.api.requestMagicLink(any()) } returns ApiResponse(success = true, data = MagicLinkRequestData())

        assertThat(s.repository.requestEmailCode("ada@example.com").getOrNull())
            .isEqualTo(EmailCodeDispatch(expiresInSeconds = 300, pendingSessionToken = null))
    }

    @Test
    fun `opening the link on the requesting device presents the secret, which is then forgotten`() = runTest {
        val s = scenario()
        coEvery { s.api.requestMagicLink(any()) } returns ApiResponse(success = true, data = MagicLinkRequestData())
        coEvery { s.api.validateMagicLink(any()) } returns ApiResponse(success = true, data = session())
        s.repository.requestEmailCode("ada@example.com")
        val secret = s.binding.presentedSecret()

        s.repository.verifyMagicLink("tok")

        coVerify { s.api.validateMagicLink(MagicLinkValidateRequest(token = "tok", linkDeviceSecret = secret)) }
        assertThat(s.binding.presentedSecret()).isNull()
    }

    @Test
    fun `a confirmation request keeps the secret for the answer`() = runTest {
        val s = scenario()
        coEvery { s.api.requestMagicLink(any()) } returns ApiResponse(success = true, data = MagicLinkRequestData())
        coEvery { s.api.validateMagicLink(any()) } returns ApiResponse(success = true, data = confirmation())
        s.repository.requestEmailCode("ada@example.com")
        val secret = s.binding.presentedSecret()

        s.repository.verifyMagicLink("tok")

        assertThat(s.binding.presentedSecret()).isEqualTo(secret)
    }

    @Test
    fun `a verification link carries the secret, a typed code never does`() = runTest {
        val s = scenario()
        coEvery { s.api.requestMagicLink(any()) } returns ApiResponse(success = true, data = MagicLinkRequestData())
        val sent = mutableListOf<EmailVerificationRequest>()
        coEvery { s.api.verifyEmail(capture(sent)) } returns ApiResponse(success = true, data = session())
        s.repository.requestEmailCode("ada@example.com")
        val secret = s.binding.presentedSecret()

        s.repository.confirmEmail(EmailVerificationRequest.code("123456", "ada@example.com"))
        s.repository.confirmEmail(EmailVerificationRequest.link("tok", "ada@example.com"))

        assertThat(sent[0].linkDeviceSecret).isNull()
        assertThat(sent[1].linkDeviceSecret).isEqualTo(secret)
    }
}
