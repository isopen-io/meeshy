package me.meeshy.app.auth

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.auth.InMemorySavedAccountsStore
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.AuthSession
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.auth.LoginOutcome
import me.meeshy.sdk.model.auth.SavedAccount
import me.meeshy.sdk.net.InMemoryServerEnvironmentStore
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.socket.RealtimeSessionCoordinator
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AuthViewModelKeepSignedInTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val session = AuthSession(MeeshyUser(id = "u2", username = "bob"), token = "jwt")
    private val dormant = SavedAccount("u1", "alice", null, null, 1L)

    private fun viewModel(
        repository: AuthRepository,
        accounts: InMemorySavedAccountsStore = InMemorySavedAccountsStore(),
    ): AuthViewModel {
        val clock = object : CacheClock {
            override fun nowMillis(): Long = 5L
        }
        return AuthViewModel(
            repository,
            mockk<RealtimeSessionCoordinator>(relaxed = true),
            accounts,
            clock,
            MeeshyConfig(),
            InMemoryServerEnvironmentStore(),
        )
    }

    private fun repository(sleeping: Set<String> = emptySet()): AuthRepository = mockk<AuthRepository>(relaxed = true).also {
        every { it.isAuthenticated } returns false
        every { it.accountsKeepingASession(any()) } returns sleeping
        coEvery { it.loginOutcome(any(), any(), any()) } returns NetworkResult.Success(LoginOutcome.Authenticated(session))
    }

    @Test
    fun `le premier compte est garde sans question et la case n'est pas proposee`() = runTest(dispatcher) {
        val repository = repository()
        val vm = viewModel(repository)

        vm.onUsernameChange("bob")
        vm.onPasswordChange("secret")
        vm.login()
        advanceUntilIdle()

        assertThat(vm.state.value.offersKeepSignedIn).isFalse()
        coVerify(exactly = 1) { repository.loginOutcome("bob", "secret", true) }
    }

    @Test
    fun `la case est proposee quand un autre compte garde sa session et son choix part au serveur`() = runTest(dispatcher) {
        val repository = repository(sleeping = setOf("u1"))
        val vm = viewModel(repository, InMemorySavedAccountsStore(listOf(dormant)))
        advanceUntilIdle()
        assertThat(vm.state.value.offersKeepSignedIn).isTrue()
        assertThat(vm.state.value.keepSignedIn).isTrue()

        vm.onKeepSignedInChange(false)
        vm.onUsernameChange("bob")
        vm.onPasswordChange("secret")
        vm.login()
        advanceUntilIdle()

        coVerify(exactly = 1) { repository.loginOutcome("bob", "secret", false) }
    }

    @Test
    fun `un compte non garde est memorise comme tel`() = runTest(dispatcher) {
        val accounts = InMemorySavedAccountsStore(listOf(dormant))
        val vm = viewModel(repository(sleeping = setOf("u1")), accounts)
        advanceUntilIdle()

        vm.onKeepSignedInChange(false)
        vm.onUsernameChange("bob")
        vm.onPasswordChange("secret")
        vm.login()
        advanceUntilIdle()

        assertThat(accounts.accounts.value.first { it.id == "u2" }.keepsSession).isFalse()
        assertThat(accounts.accounts.value.first { it.id == "u1" }.keepsSession).isTrue()
    }

    @Test
    fun `une case decochee sans autre compte garde ne change rien`() = runTest(dispatcher) {
        val repository = repository()
        val vm = viewModel(repository)

        vm.onKeepSignedInChange(false)
        vm.onUsernameChange("bob")
        vm.onPasswordChange("secret")
        vm.login()
        advanceUntilIdle()

        coVerify(exactly = 1) { repository.loginOutcome("bob", "secret", true) }
    }
}
