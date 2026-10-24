package me.meeshy.app.settings

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
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ActiveSessionInfo
import me.meeshy.sdk.net.api.SessionsListData
import org.junit.After
import org.junit.Before
import org.junit.Test

/** iOS `ActiveSessionsView` : déconnecter un appareil, ou tous les autres, passe par une confirmation. */
@OptIn(ExperimentalCoroutinesApi::class)
class ActiveSessionsConfirmationTest {

    private val dispatcher = StandardTestDispatcher()
    private val current = ActiveSessionInfo(id = "me", isCurrentSession = true)
    private val tablet = ActiveSessionInfo(id = "tablet", isCurrentSession = false)

    private fun repository(): AuthRepository = mockk<AuthRepository>().also { repo ->
        coEvery { repo.listSessions() } returns NetworkResult.Success(SessionsListData(sessions = listOf(current, tablet)))
        coEvery { repo.revokeSession(any()) } returns NetworkResult.Success(Unit)
        coEvery { repo.revokeOtherSessions() } returns NetworkResult.Success(Unit)
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
    fun `tapping disconnect only asks, and nothing leaves until confirmed`() = runTest(dispatcher) {
        val repo = repository()
        val vm = ActiveSessionsViewModel(repo)
        advanceUntilIdle()

        vm.requestRevoke(tablet)
        advanceUntilIdle()

        assertThat(vm.state.value.pendingRevocation).isEqualTo(tablet)
        coVerify(exactly = 0) { repo.revokeSession(any()) }

        vm.confirmRevoke()
        advanceUntilIdle()

        coVerify(exactly = 1) { repo.revokeSession("tablet") }
        assertThat(vm.state.value.pendingRevocation).isNull()
        assertThat(vm.state.value.sessions.map { it.id }).containsExactly("me")
    }

    @Test
    fun `cancelling keeps every device connected`() = runTest(dispatcher) {
        val repo = repository()
        val vm = ActiveSessionsViewModel(repo)
        advanceUntilIdle()

        vm.requestRevoke(tablet)
        vm.cancelConfirmation()
        vm.confirmRevoke()
        advanceUntilIdle()

        coVerify(exactly = 0) { repo.revokeSession(any()) }
        assertThat(vm.state.value.sessions).hasSize(2)
    }

    @Test
    fun `disconnecting all other devices asks first`() = runTest(dispatcher) {
        val repo = repository()
        val vm = ActiveSessionsViewModel(repo)
        advanceUntilIdle()

        vm.requestRevokeOthers()
        assertThat(vm.state.value.confirmingRevokeOthers).isTrue()
        coVerify(exactly = 0) { repo.revokeOtherSessions() }

        vm.confirmRevokeOthers()
        advanceUntilIdle()

        coVerify(exactly = 1) { repo.revokeOtherSessions() }
        assertThat(vm.state.value.sessions.map { it.id }).containsExactly("me")
    }
}
