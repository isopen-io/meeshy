package me.meeshy.app.auth

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.auth.InMemorySavedAccountsStore
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiResponse
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

/** iOS `SettingsView` (voile « Déconnexion en cours… ») et `SessionClosedNoticeView`. */
@OptIn(ExperimentalCoroutinesApi::class)
class AuthViewModelLogoutTest {

    private val dispatcher = StandardTestDispatcher()

    private fun viewModel(api: AuthApi): AuthViewModel {
        val tokens = InMemoryTokenStore(jwt = "jwt", sessionToken = "s")
        return AuthViewModel(
            AuthRepository(api, tokens, SessionRepository(api, tokens), mockk<SessionTeardown>(relaxed = true), SyncSeqTracker()),
            mockk<RealtimeSessionCoordinator>(relaxed = true),
            InMemorySavedAccountsStore(),
            object : CacheClock { override fun nowMillis(): Long = 1L },
            MeeshyConfig(),
            InMemoryServerEnvironmentStore(),
        )
    }

    private fun slowLogoutApi(gate: CompletableDeferred<Unit>): AuthApi = mockk<AuthApi>(relaxed = true).also { api ->
        coEvery { api.logout(any(), any()) } coAnswers { gate.await(); ApiResponse(success = true) }
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
    fun `while the server closes the session the veil holds and a second tap does nothing`() = runTest(dispatcher) {
        val gate = CompletableDeferred<Unit>()
        val api = slowLogoutApi(gate)
        val vm = viewModel(api)

        vm.logout()
        runCurrent()
        assertThat(vm.state.value.isLoggingOut).isTrue()
        vm.logout()
        gate.complete(Unit)
        advanceUntilIdle()

        coVerify(exactly = 1) { api.logout(any(), any()) }
        assertThat(vm.state.value.isLoggingOut).isFalse()
        assertThat(vm.state.value.isAuthenticated).isFalse()
        assertThat(vm.state.value.sessionClosedNotice).isFalse()
    }

    @Test
    fun `a session refused by the server comes back to sign-in with an explanation`() = runTest(dispatcher) {
        val gate = CompletableDeferred(Unit)
        val vm = viewModel(slowLogoutApi(gate))

        vm.logout(closedByServer = true)
        advanceUntilIdle()

        assertThat(vm.state.value.sessionClosedNotice).isTrue()
        vm.dismissSessionClosedNotice()
        assertThat(vm.state.value.sessionClosedNotice).isFalse()
    }

    @Test
    fun `a refusal arriving once already signed out explains nothing`() = runTest(dispatcher) {
        val vm = viewModel(slowLogoutApi(CompletableDeferred(Unit)))
        vm.logout()
        advanceUntilIdle()

        vm.logout(closedByServer = true)
        advanceUntilIdle()

        assertThat(vm.state.value.sessionClosedNotice).isFalse()
    }
}
