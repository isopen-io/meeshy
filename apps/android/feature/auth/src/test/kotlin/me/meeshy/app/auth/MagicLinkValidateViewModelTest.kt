package me.meeshy.app.auth

import androidx.lifecycle.SavedStateHandle
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.auth.ProvenSessionOpener
import me.meeshy.sdk.auth.ProvenSessionPort
import me.meeshy.sdk.model.AuthSession
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.auth.LoginOutcome
import me.meeshy.sdk.model.auth.SessionOrigin
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.SessionTransitionFlags
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class MagicLinkValidateViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private class FakePort(override var isAuthenticated: Boolean = false) : ProvenSessionPort {
        override val activeUserId: String? = null
        val installed = mutableListOf<AuthSession>()
        override fun install(session: AuthSession, origin: SessionOrigin) {
            installed += session
        }

        override suspend fun closeServerSession(jwt: String, sessionToken: String?): Boolean = true
    }

    private val session = AuthSession(MeeshyUser(id = "u1", username = "alice"), token = "jwt")

    private fun TestScope.viewModel(
        outcome: NetworkResult<LoginOutcome>,
        port: FakePort = FakePort(),
        flags: SessionTransitionFlags = SessionTransitionFlags(),
        gate: SessionOpeningGate = SessionOpeningGate(),
    ): MagicLinkValidateViewModel {
        val repository = mockk<AuthRepository>(relaxed = true)
        every { repository.isAuthenticated } returns false
        coEvery { repository.verifyMagicLink(any()) } returns outcome
        val opener = ProvenSessionOpener(port, flags, this, System::currentTimeMillis)
        return MagicLinkValidateViewModel(repository, opener, gate, SavedStateHandle(mapOf("token" to "tok")))
    }

    @Test
    fun `le succes passe par l'opener et ouvre la session`() = runTest(dispatcher) {
        val port = FakePort()
        val vm = viewModel(NetworkResult.Success(LoginOutcome.Authenticated(session, adoptWithinSeconds = 300)), port)

        advanceUntilIdle()

        assertThat(port.installed).containsExactly(session)
        assertThat(vm.state.value.isAuthenticated).isTrue()
        assertThat(vm.state.value.isValidating).isFalse()
    }

    @Test
    fun `pendant un changement de compte la session n'est pas posee`() = runTest(dispatcher) {
        val port = FakePort()
        val flags = SessionTransitionFlags().also { it.isSwitchingAccount = true }
        val vm = viewModel(NetworkResult.Success(LoginOutcome.Authenticated(session)), port, flags)

        advanceUntilIdle()

        assertThat(port.installed).isEmpty()
        assertThat(vm.state.value.isAuthenticated).isFalse()
        assertThat(vm.state.value.isValidating).isFalse()
    }

    @Test
    fun `une feuille d'acces affichee retient l'ouverture jusqu'a sa fermeture`() = runTest(dispatcher) {
        val port = FakePort()
        val gate = SessionOpeningGate().apply { presentationBegan() }
        val vm = viewModel(NetworkResult.Success(LoginOutcome.Authenticated(session)), port, gate = gate)

        advanceUntilIdle()
        assertThat(port.installed).isEmpty()
        assertThat(gate.dismissalRequested.value).isTrue()

        gate.presentationEnded()
        assertThat(port.installed).containsExactly(session)
        assertThat(vm.state.value.isAuthenticated).isTrue()
    }

    @Test
    fun `un echec du lien n'ouvre rien`() = runTest(dispatcher) {
        val port = FakePort()
        val vm = viewModel(NetworkResult.Failure(ApiError(message = "expired")), port)

        advanceUntilIdle()

        assertThat(port.installed).isEmpty()
        assertThat(vm.state.value.errorMessage).isEqualTo("expired")
    }

    @Test
    fun `un second facteur requis n'ouvre aucune session`() = runTest(dispatcher) {
        val port = FakePort()
        val vm = viewModel(NetworkResult.Success(LoginOutcome.TwoFactorRequired("t")), port)

        advanceUntilIdle()

        assertThat(port.installed).isEmpty()
        assertThat(vm.state.value.isAuthenticated).isFalse()
        assertThat(vm.state.value.isValidating).isFalse()
    }
}
