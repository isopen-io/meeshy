package me.meeshy.app.auth

import com.google.common.truth.Truth.assertThat
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
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.RefreshTokenRequest
import me.meeshy.sdk.model.RegisterRequest
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.session.SessionRepository
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
        override suspend fun me() = ApiResponse<MeeshyUser>(success = false)
    }

    private fun viewModel(response: ApiResponse<AuthSession>): AuthViewModel {
        val api = FakeAuthApi(response)
        val store = InMemoryTokenStore()
        return AuthViewModel(AuthRepository(api, store, SessionRepository(api, store)))
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
}
