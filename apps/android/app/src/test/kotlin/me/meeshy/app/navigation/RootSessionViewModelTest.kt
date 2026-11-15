package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.model.rootnav.RootRoute
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class RootSessionViewModelTest {

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private class Harness(
        val vm: RootSessionViewModel,
        val resolved: MutableStateFlow<Boolean>,
    )

    private fun harness(storedSession: Boolean = false, resolved: Boolean = false): Harness {
        val resolvedFlow = MutableStateFlow(resolved)
        val session = mockk<SessionRepository>(relaxed = true)
        every { session.hasResolvedStoredSession } returns resolvedFlow
        val auth = mockk<AuthRepository>(relaxed = true)
        every { auth.isAuthenticated } returns storedSession
        return Harness(RootSessionViewModel(session, auth), resolvedFlow)
    }

    @Test
    fun `une session stockee montre l'app connectee des la premiere image sans passer par la connexion`() = runTest {
        val h = harness(storedSession = true)
        assertThat(h.vm.state.value.route).isEqualTo(RootRoute.CONNECTED)
    }

    @Test
    fun `sans session stockee la racine ne montre rien tant que la restauration est en vol`() = runTest {
        val h = harness()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { h.vm.state.collect {} }
        assertThat(h.vm.state.value.route).isEqualTo(RootRoute.NONE)
        h.vm.onEvent(RootSessionEvent.AuthChanged(isAuthenticated = false, isRestoringSession = false))
        assertThat(h.vm.state.value.route).isEqualTo(RootRoute.LOGIN)
    }

    @Test
    fun `la session resolue leve l'attente meme si une restauration reste annoncee`() = runTest {
        val h = harness()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { h.vm.state.collect {} }
        h.resolved.value = true
        assertThat(h.vm.state.value.route).isEqualTo(RootRoute.LOGIN)
    }

    @Test
    fun `le lien en attente n'apparait que sur la connexion`() = runTest {
        val h = harness()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { h.vm.state.collect {} }
        h.vm.onEvent(RootSessionEvent.PendingLinkChanged(true))
        assertThat(h.vm.state.value.showsPendingLinkNotice).isFalse()
        h.vm.onEvent(RootSessionEvent.AuthChanged(isAuthenticated = false, isRestoringSession = false))
        assertThat(h.vm.state.value.showsPendingLinkNotice).isTrue()
        h.vm.onEvent(RootSessionEvent.AuthChanged(isAuthenticated = true, isRestoringSession = false))
        assertThat(h.vm.state.value.showsPendingLinkNotice).isFalse()
    }
}
