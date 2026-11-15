package me.meeshy.app.auth

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.feature.auth.R
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.auth.InMemorySavedAccountsStore
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.auth.EmailVerificationRequest
import me.meeshy.sdk.model.auth.LoginResponse
import me.meeshy.sdk.model.auth.TwoFactorLoginRequest
import me.meeshy.sdk.net.InMemoryServerEnvironmentStore
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.session.SessionTeardown
import me.meeshy.sdk.socket.RealtimeSessionCoordinator
import me.meeshy.sdk.sync.SyncSeqTracker
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.io.IOException

/**
 * Les issues de la connexion qui ne sont pas une session (iOS `LoginView`) : défi de second
 * facteur, adresse à vérifier, et refus dits dans la langue de l'interface.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class AuthViewModelChallengeTest {

    private val dispatcher = StandardTestDispatcher()
    private val user = MeeshyUser(id = "u1", username = "atabeth")

    private fun opened() = ApiResponse(success = true, data = LoginResponse(user = user, token = "jwt", sessionToken = "s"))

    private fun viewModel(api: AuthApi, tokens: InMemoryTokenStore = InMemoryTokenStore()): AuthViewModel =
        AuthViewModel(
            AuthRepository(api, tokens, SessionRepository(api, tokens), mockk<SessionTeardown>(relaxed = true), SyncSeqTracker()),
            mockk<RealtimeSessionCoordinator>(relaxed = true),
            InMemorySavedAccountsStore(),
            object : CacheClock { override fun nowMillis(): Long = 1L },
            MeeshyConfig(),
            InMemoryServerEnvironmentStore(),
        )

    private fun AuthViewModel.typeCredentials() {
        onUsernameChange("atabeth")
        onPasswordChange("secret")
    }

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `a protected account moves to the code step instead of failing in English`() = runTest(dispatcher) {
        val api = mockk<AuthApi>()
        coEvery { api.login(any()) } returns ApiResponse(success = true, data = LoginResponse(requires2FA = true, twoFactorToken = "challenge"))
        val vm = viewModel(api)

        vm.typeCredentials()
        vm.login()
        advanceUntilIdle()

        val state = vm.state.value
        assertThat(state.twoFactorToken).isEqualTo("challenge")
        assertThat(state.errorMessage).isNull()
        assertThat(state.errorRes).isNull()
        assertThat(state.isAuthenticated).isFalse()
    }

    @Test
    fun `the code step submits only from six characters and opens the session`() = runTest(dispatcher) {
        val api = mockk<AuthApi>()
        coEvery { api.login(any()) } returns ApiResponse(success = true, data = LoginResponse(requires2FA = true, twoFactorToken = "challenge"))
        coEvery { api.completeLoginWith2FA(any()) } returns opened()
        val tokens = InMemoryTokenStore()
        val vm = viewModel(api, tokens)
        vm.typeCredentials()
        vm.login()
        advanceUntilIdle()

        vm.onTwoFactorCodeChange("12345")
        assertThat(vm.state.value.canSubmitTwoFactor).isFalse()
        vm.onTwoFactorCodeChange("123456")
        vm.submitTwoFactor()
        advanceUntilIdle()

        coVerify { api.completeLoginWith2FA(TwoFactorLoginRequest("challenge", "123456")) }
        assertThat(vm.state.value.isAuthenticated).isTrue()
        assertThat(vm.state.value.twoFactorToken).isNull()
        assertThat(tokens.jwt).isEqualTo("jwt")
    }

    @Test
    fun `cancelling the code step returns to the form`() = runTest(dispatcher) {
        val api = mockk<AuthApi>()
        coEvery { api.login(any()) } returns ApiResponse(success = true, data = LoginResponse(requires2FA = true, twoFactorToken = "challenge"))
        val vm = viewModel(api)
        vm.typeCredentials()
        vm.login()
        advanceUntilIdle()
        vm.onTwoFactorCodeChange("123")

        vm.cancelTwoFactor()

        assertThat(vm.state.value.twoFactorToken).isNull()
        assertThat(vm.state.value.twoFactorCode).isEmpty()
    }

    @Test
    fun `an address to verify moves to the verification step, and the code with the password opens the session`() =
        runTest(dispatcher) {
            val api = mockk<AuthApi>()
            coEvery { api.login(any()) } returns ApiResponse(
                success = true,
                data = LoginResponse(status = "verification-required", email = "a@meeshy.me", accountCreated = false),
            )
            coEvery { api.verifyEmail(any()) } returns opened()
            val tokens = InMemoryTokenStore()
            val vm = viewModel(api, tokens)
            vm.typeCredentials()
            vm.login()
            advanceUntilIdle()

            assertThat(vm.state.value.pendingVerification?.email).isEqualTo("a@meeshy.me")
            assertThat(vm.state.value.errorRes).isNull()

            vm.onVerificationCodeChange("12a3456")
            assertThat(vm.state.value.verificationCode).isEqualTo("123456")
            vm.submitVerification()
            advanceUntilIdle()

            coVerify { api.verifyEmail(EmailVerificationRequest(email = "a@meeshy.me", code = "123456", password = "secret")) }
            assertThat(vm.state.value.isAuthenticated).isTrue()
            assertThat(tokens.jwt).isEqualTo("jwt")
        }

    @Test
    fun `resending the code says it was resent`() = runTest(dispatcher) {
        val api = mockk<AuthApi>()
        coEvery { api.login(any()) } returns ApiResponse(
            success = true,
            data = LoginResponse(status = "verification-required", email = "a@meeshy.me"),
        )
        coEvery { api.resendVerification(any()) } returns ApiResponse(success = true)
        val vm = viewModel(api)
        vm.typeCredentials()
        vm.login()
        advanceUntilIdle()

        vm.resendVerification()
        advanceUntilIdle()

        assertThat(vm.state.value.verificationResend).isEqualTo(VerificationResend.SENT)
    }

    @Test
    fun `offline, the refusal is the localized no-connection sentence, never the exception text`() = runTest(dispatcher) {
        val api = mockk<AuthApi>()
        coEvery { api.login(any()) } throws IOException("Unable to resolve host \"gate.meeshy.me\"")
        val vm = viewModel(api)
        vm.typeCredentials()

        vm.login()
        advanceUntilIdle()

        assertThat(vm.state.value.errorMessage).isNull()
        assertThat(vm.state.value.errorRes).isEqualTo(R.string.email_verification_error_offline)
    }

    @Test
    fun `a wrong verification code says the code is invalid`() = runTest(dispatcher) {
        val api = mockk<AuthApi>()
        coEvery { api.login(any()) } returns ApiResponse(
            success = true,
            data = LoginResponse(status = "verification-required", email = "a@meeshy.me"),
        )
        coEvery { api.verifyEmail(any()) } returns ApiResponse(success = false, error = "Code invalide", code = "INVALID_VERIFICATION")
        val vm = viewModel(api)
        vm.typeCredentials()
        vm.login()
        advanceUntilIdle()

        vm.onVerificationCodeChange("000000")
        vm.submitVerification()
        advanceUntilIdle()

        assertThat(vm.state.value.errorRes).isEqualTo(R.string.email_verification_error_invalid_code)
        assertThat(vm.state.value.isAuthenticated).isFalse()
    }
}
