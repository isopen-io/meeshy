package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.auth.InMemorySavedAccountsStore
import me.meeshy.sdk.model.auth.SavedAccount
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.settings.LogoutPhase
import me.meeshy.sdk.socket.RealtimeSessionCoordinator
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SignOutViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)

    @After fun tearDown() = Dispatchers.resetMain()

    private fun viewModel(auth: AuthRepository, realtime: RealtimeSessionCoordinator = mockk(relaxed = true)) =
        SignOutViewModel(auth, realtime)

    @Test
    fun `double confirmation n'appelle logout qu'une fois et la navigation attend son retour`() = runTest(dispatcher) {
        val gate = CompletableDeferred<Unit>()
        val auth = mockk<AuthRepository>()
        coEvery { auth.logout() } coAnswers { gate.await() }
        val vm = viewModel(auth)
        val effects = mutableListOf<SignOutEffect>()
        val job = backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { vm.effects.collect { effects += it } }

        vm.onEvent(SignOutEvent.Requested)
        vm.onEvent(SignOutEvent.Confirmed)
        vm.onEvent(SignOutEvent.Confirmed)
        runCurrent()

        assertThat(vm.phase.value).isEqualTo(LogoutPhase.InProgress)
        assertThat(effects).isEmpty()
        coVerify(exactly = 1) { auth.logout() }

        gate.complete(Unit)
        advanceUntilIdle()

        assertThat(vm.phase.value).isEqualTo(LogoutPhase.Done)
        assertThat(effects).containsExactly(SignOutEffect.SignedOut)
        job.cancel()
    }

    @Test
    fun `annuler la confirmation ne ferme rien`() = runTest(dispatcher) {
        val auth = mockk<AuthRepository>(relaxed = true)
        val vm = viewModel(auth)

        vm.onEvent(SignOutEvent.Requested)
        vm.onEvent(SignOutEvent.Cancelled)
        vm.onEvent(SignOutEvent.Confirmed)
        advanceUntilIdle()

        assertThat(vm.phase.value).isEqualTo(LogoutPhase.Idle)
        coVerify(exactly = 0) { auth.logout() }
    }

    @Test
    fun `les sockets sont coupes apres la purge et le compte reste liste`() = runTest(dispatcher) {
        val accounts = InMemorySavedAccountsStore()
        accounts.upsert(SavedAccount(id = "u1", username = "ada", displayName = "Ada", avatarUrl = null, lastActiveAtMillis = 1L))
        val auth = mockk<AuthRepository>(relaxed = true)
        val realtime = mockk<RealtimeSessionCoordinator>(relaxed = true)
        val vm = viewModel(auth, realtime)

        vm.onEvent(SignOutEvent.Requested)
        vm.onEvent(SignOutEvent.Confirmed)
        advanceUntilIdle()

        verify(exactly = 1) { realtime.onAuthenticatedChanged(false) }
        assertThat(accounts.accounts.value.map { it.id }).containsExactly("u1")
    }
}
