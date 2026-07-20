package me.meeshy.app.auth

import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.AuthSession
import me.meeshy.sdk.model.LoginRequest
import me.meeshy.sdk.model.MeEnvelope
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.RefreshTokenRequest
import me.meeshy.sdk.model.RegisterRequest
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.RealtimeSessionCoordinator
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AuthViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    private class FakeAuthApi(var response: ApiResponse<AuthSession>) : AuthApi {
        override suspend fun login(body: LoginRequest) = response
        override suspend fun register(body: RegisterRequest) = response
        override suspend fun refresh(body: RefreshTokenRequest) = response
        override suspend fun me() = ApiResponse<MeEnvelope>(success = false)
    }

    private fun viewModel(
        response: ApiResponse<AuthSession>,
        store: InMemoryTokenStore = InMemoryTokenStore(),
        coordinator: RealtimeSessionCoordinator = mockk(relaxed = true),
    ): AuthViewModel {
        val api = FakeAuthApi(response)
        return AuthViewModel(AuthRepository(api, store, SessionRepository(api, store)), coordinator)
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
    fun login_withBlankFields_showsValidationError() {
        val vm = viewModel(ApiResponse(success = false))
        vm.login()
        assertThat(vm.state.value.errorRes).isNotNull()
        assertThat(vm.state.value.isAuthenticated).isFalse()
    }

    @Test
    fun login_success_marksAuthenticated() = runTest(dispatcher) {
        val session = AuthSession(MeeshyUser(id = "u1", username = "atabeth"), token = "jwt")
        val vm = viewModel(ApiResponse(success = true, data = session))

        vm.onUsernameChange("atabeth")
        vm.onPasswordChange("secret")
        vm.login()
        advanceUntilIdle()

        assertThat(vm.state.value.isAuthenticated).isTrue()
        assertThat(vm.state.value.isSubmitting).isFalse()
    }

    @Test
    fun login_failure_surfacesErrorMessage() = runTest(dispatcher) {
        val vm = viewModel(ApiResponse(success = false, error = "Invalid credentials"))

        vm.onUsernameChange("atabeth")
        vm.onPasswordChange("wrong")
        vm.login()
        advanceUntilIdle()

        assertThat(vm.state.value.isAuthenticated).isFalse()
        assertThat(vm.state.value.errorMessage).isEqualTo("Invalid credentials")
    }

    @Test
    fun init_withRestoredToken_bindsRealtimeToTheSession() {
        val coordinator = mockk<RealtimeSessionCoordinator>(relaxed = true)

        viewModel(ApiResponse(success = false), store = InMemoryTokenStore(jwt = "jwt"), coordinator = coordinator)

        verify { coordinator.onAuthenticatedChanged(true) }
    }

    @Test
    fun init_withoutToken_reportsUnauthenticatedToRealtime() {
        val coordinator = mockk<RealtimeSessionCoordinator>(relaxed = true)

        viewModel(ApiResponse(success = false), coordinator = coordinator)

        verify { coordinator.onAuthenticatedChanged(false) }
    }

    @Test
    fun login_success_bindsRealtimeToTheSession() = runTest(dispatcher) {
        val coordinator = mockk<RealtimeSessionCoordinator>(relaxed = true)
        val session = AuthSession(MeeshyUser(id = "u1", username = "atabeth"), token = "jwt")
        val vm = viewModel(ApiResponse(success = true, data = session), coordinator = coordinator)

        vm.onUsernameChange("atabeth")
        vm.onPasswordChange("secret")
        vm.login()
        advanceUntilIdle()

        verify { coordinator.onAuthenticatedChanged(true) }
    }

    @Test
    fun login_failure_doesNotBindRealtime() = runTest(dispatcher) {
        val coordinator = mockk<RealtimeSessionCoordinator>(relaxed = true)
        val vm = viewModel(ApiResponse(success = false, error = "nope"), coordinator = coordinator)

        vm.onUsernameChange("atabeth")
        vm.onPasswordChange("wrong")
        vm.login()
        advanceUntilIdle()

        verify(exactly = 0) { coordinator.onAuthenticatedChanged(true) }
    }

    @Test
    fun logout_unbindsRealtimeFromTheSession() {
        val coordinator = mockk<RealtimeSessionCoordinator>(relaxed = true)
        val vm = viewModel(ApiResponse(success = false), store = InMemoryTokenStore(jwt = "jwt"), coordinator = coordinator)

        vm.logout()

        verify { coordinator.onAuthenticatedChanged(false) }
    }
}
