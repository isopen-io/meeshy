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
import me.meeshy.sdk.model.auth.LoginFlow
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

/** L'étape du second facteur d'un compte protégé — code TOTP ou code de secours (iOS `LoginView.twoFactorSection`). */
@OptIn(ExperimentalCoroutinesApi::class)
class AuthViewModelTwoFactorTest {

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

    private fun failing(error: String, code: String = "TWO_FACTOR_FAILED") =
        ApiResponse<LoginResponse>(success = false, error = error, code = code)

    private fun AuthViewModel.atCodeStep(api: AuthApi) {
        coEvery { api.login(any()) } returns ApiResponse(success = true, data = LoginResponse(requires2FA = true, twoFactorToken = "challenge"))
        typeCredentials()
        login()
        dispatcher.scheduler.advanceUntilIdle()
    }

    @Test
    fun `a six digit code can be submitted`() = runTest(dispatcher) {
        val api = mockk<AuthApi>()
        val vm = viewModel(api)
        vm.atCodeStep(api)
        coEvery { api.completeLoginWith2FA(any()) } returns opened()

        vm.onTwoFactorCodeChange("123 456")
        assertThat(vm.state.value.canSubmitTwoFactor).isTrue()
        vm.submitTwoFactor()
        advanceUntilIdle()

        coVerify { api.completeLoginWith2FA(TwoFactorLoginRequest("challenge", "123456")) }
    }

    @Test
    fun `a backup code can be submitted`() = runTest(dispatcher) {
        val api = mockk<AuthApi>()
        val vm = viewModel(api)
        vm.atCodeStep(api)
        coEvery { api.completeLoginWith2FA(any()) } returns opened()

        vm.onTwoFactorCodeChange("k7mp-q2rx")
        assertThat(vm.state.value.twoFactorCode).isEqualTo("K7MP-Q2RX")
        assertThat(vm.state.value.canSubmitTwoFactor).isTrue()
        vm.submitTwoFactor()
        advanceUntilIdle()

        coVerify { api.completeLoginWith2FA(TwoFactorLoginRequest("challenge", "K7MP-Q2RX")) }
        assertThat(vm.state.value.loginFlow).isEqualTo(LoginFlow.Authenticated)
    }

    @Test
    fun `a partial code of either form cannot be submitted`() = runTest(dispatcher) {
        val api = mockk<AuthApi>()
        val vm = viewModel(api)
        vm.atCodeStep(api)

        vm.onTwoFactorCodeChange("12345")
        assertThat(vm.state.value.canSubmitTwoFactor).isFalse()
        vm.onTwoFactorCodeChange("K7MP-Q2R")
        assertThat(vm.state.value.canSubmitTwoFactor).isFalse()
        vm.submitTwoFactor()
        advanceUntilIdle()

        coVerify(exactly = 0) { api.completeLoginWith2FA(any()) }
    }

    @Test
    fun `the password is forgotten as soon as the code step opens`() = runTest(dispatcher) {
        val api = mockk<AuthApi>()
        val vm = viewModel(api)

        vm.atCodeStep(api)

        assertThat(vm.state.value.loginFlow).isEqualTo(LoginFlow.TwoFactor("challenge"))
        assertThat(vm.state.value.password).isEmpty()
        assertThat(vm.state.value.username).isEqualTo("atabeth")
    }

    @Test
    fun `cancelling keeps the identifier and clears the password and the token`() = runTest(dispatcher) {
        val api = mockk<AuthApi>()
        val vm = viewModel(api)
        vm.atCodeStep(api)
        vm.onTwoFactorCodeChange("123")

        vm.cancelTwoFactor()

        val state = vm.state.value
        assertThat(state.twoFactorToken).isNull()
        assertThat(state.twoFactorCode).isEmpty()
        assertThat(state.username).isEqualTo("atabeth")
        assertThat(state.password).isEmpty()
        assertThat(state.loginFlow).isEqualTo(LoginFlow.Form)
    }

    @Test
    fun `a wrong code is told under the field and keeps the step`() = runTest(dispatcher) {
        val api = mockk<AuthApi>()
        val vm = viewModel(api)
        vm.atCodeStep(api)
        coEvery { api.completeLoginWith2FA(any()) } returns failing("Code invalide")
        vm.onTwoFactorCodeChange("123456")

        vm.submitTwoFactor()
        advanceUntilIdle()

        val state = vm.state.value
        assertThat(state.errorRes).isEqualTo(R.string.login_two_factor_error_invalid_code)
        assertThat(state.loginFlow).isEqualTo(LoginFlow.TwoFactor("challenge"))
        assertThat(state.isSubmitting).isFalse()
    }

    @Test
    fun `too many attempts has its own label and keeps the step`() = runTest(dispatcher) {
        val api = mockk<AuthApi>()
        val vm = viewModel(api)
        vm.atCodeStep(api)
        coEvery { api.completeLoginWith2FA(any()) } returns
            failing("Compte temporairement verrouillé après trop de tentatives. Réessayez plus tard.")
        vm.onTwoFactorCodeChange("123456")

        vm.submitTwoFactor()
        advanceUntilIdle()

        assertThat(vm.state.value.errorRes).isEqualTo(R.string.login_two_factor_error_too_many_attempts)
        assertThat(vm.state.value.twoFactorToken).isEqualTo("challenge")
    }

    @Test
    fun `an expired token returns to the form with the identifier kept and says why`() = runTest(dispatcher) {
        val api = mockk<AuthApi>()
        val vm = viewModel(api)
        vm.atCodeStep(api)
        coEvery { api.completeLoginWith2FA(any()) } returns
            failing("Token 2FA invalide ou expiré. Veuillez vous reconnecter.")
        vm.onTwoFactorCodeChange("123456")

        vm.submitTwoFactor()
        advanceUntilIdle()

        val state = vm.state.value
        assertThat(state.loginFlow).isEqualTo(LoginFlow.Form)
        assertThat(state.errorRes).isEqualTo(R.string.login_two_factor_error_token_expired)
        assertThat(state.username).isEqualTo("atabeth")
        assertThat(state.password).isEmpty()
        assertThat(state.twoFactorCode).isEmpty()
    }

    @Test
    fun `success opens the session and forgets the code and the token`() = runTest(dispatcher) {
        val api = mockk<AuthApi>()
        val vm = viewModel(api)
        vm.atCodeStep(api)
        coEvery { api.completeLoginWith2FA(any()) } returns opened()
        vm.onTwoFactorCodeChange("123456")

        vm.submitTwoFactor()
        advanceUntilIdle()

        val state = vm.state.value
        assertThat(state.loginFlow).isEqualTo(LoginFlow.Authenticated)
        assertThat(state.twoFactorToken).isNull()
        assertThat(state.twoFactorCode).isEmpty()
    }
}
