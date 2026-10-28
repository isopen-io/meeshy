package me.meeshy.app.auth

import androidx.lifecycle.SavedStateHandle
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
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
import me.meeshy.sdk.model.auth.EmailVerificationRequest
import me.meeshy.sdk.model.auth.LoginOutcome
import me.meeshy.sdk.model.auth.SessionOrigin
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.SessionTransitionFlags
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/** Le lien de l'e-mail « code + lien » prouve l'adresse (#13465) ; iOS `SignInLinkOpener`, `.emailVerification`. */
@OptIn(ExperimentalCoroutinesApi::class)
class EmailVerificationLinkViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private class FakePort : ProvenSessionPort {
        override var isAuthenticated: Boolean = false
        override var activeUserId: String? = null
        val installed = mutableListOf<AuthSession>()
        val closed = mutableListOf<String>()
        override fun install(session: AuthSession, origin: SessionOrigin) {
            installed += session
        }

        override suspend fun closeServerSession(jwt: String, sessionToken: String?): Boolean {
            closed += jwt
            return true
        }
    }

    private val alice = MeeshyUser(id = "u1", username = "alice", displayName = "Alice")
    private val session = AuthSession(alice, token = "jwt-alice")
    private val link = EmailVerificationRequest.link(token = "tok", email = "a@b.co")

    private fun TestScope.viewModel(
        repository: AuthRepository,
        port: FakePort = FakePort(),
        signedIn: MeeshyUser? = null,
        handle: SavedStateHandle = SavedStateHandle(mapOf("token" to "tok", "email" to "a@b.co")),
    ): MagicLinkValidateViewModel {
        val opener = ProvenSessionOpener(port, SessionTransitionFlags(), this, System::currentTimeMillis)
        val sessions = mockk<SessionRepository>(relaxed = true)
        every { sessions.currentUser } returns MutableStateFlow(signedIn)
        return MagicLinkValidateViewModel(repository, opener, SessionOpeningGate(), sessions, handle)
    }

    private fun repository(proof: NetworkResult<LoginOutcome>, signedIn: Boolean = false) =
        mockk<AuthRepository>(relaxed = true).also {
            every { it.isAuthenticated } returns signedIn
            coEvery { it.confirmEmail(any()) } returns proof
        }

    @Test
    fun `le lien prouve l'adresse par l'adresse et le jeton, jamais par la connexion magique`() = runTest(dispatcher) {
        val repository = repository(NetworkResult.Success(LoginOutcome.Authenticated(session)))
        val port = FakePort()
        val vm = viewModel(repository, port)
        advanceUntilIdle()

        coVerify(exactly = 1) { repository.confirmEmail(link) }
        coVerify(exactly = 0) { repository.verifyMagicLink(any(), any(), any()) }
        assertThat(port.installed).containsExactly(session)
        assertThat(vm.state.value.isAuthenticated).isTrue()
    }

    @Test
    fun `un jeton ou une adresse retires de l'etat sauvegarde ne se rejouent pas`() = runTest(dispatcher) {
        val handle = SavedStateHandle(mapOf("token" to "tok", "email" to "a@b.co"))
        viewModel(repository(NetworkResult.Success(LoginOutcome.Authenticated(session))), handle = handle)
        assertThat(handle.contains("token")).isFalse()
        assertThat(handle.contains("email")).isFalse()
    }

    @Test
    fun `une route de verification sans adresse n'appelle rien`() = runTest(dispatcher) {
        val repository = repository(NetworkResult.Success(LoginOutcome.Authenticated(session)))
        val vm = viewModel(repository, handle = SavedStateHandle(mapOf("token" to "tok", "email" to null)))
        advanceUntilIdle()

        coVerify(exactly = 0) { repository.confirmEmail(any()) }
        coVerify(exactly = 0) { repository.verifyMagicLink(any(), any(), any()) }
        assertThat(vm.state.value.isAuthenticated).isFalse()
        assertThat(vm.state.value.isValidating).isFalse()
    }

    @Test
    fun `un lien expire ou deja utilise est un etat, pas un plantage`() = runTest(dispatcher) {
        val port = FakePort()
        val vm = viewModel(repository(NetworkResult.Failure(ApiError(message = "", httpStatus = 400))), port)
        advanceUntilIdle()

        assertThat(port.installed).isEmpty()
        assertThat(vm.state.value.isValidating).isFalse()
        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun `un autre compte ouvert pose la question et rien n'est touche avant la reponse`() = runTest(dispatcher) {
        val repository = repository(NetworkResult.Success(LoginOutcome.Authenticated(session)), signedIn = true)
        val port = FakePort()
        val vm = viewModel(repository, port, signedIn = MeeshyUser(id = "u9", username = "carol"))
        advanceUntilIdle()

        val asked = vm.state.value.replacement
        assertThat(asked?.incomingLabel).isEqualTo("Alice (@alice)")
        assertThat(asked?.currentLabel).isEqualTo("@carol")
        assertThat(port.installed).isEmpty()
        coVerify(exactly = 0) { repository.logout() }
    }

    @Test
    fun `refuser referme la session prouvee cote passerelle et ne deconnecte personne`() = runTest(dispatcher) {
        val repository = repository(NetworkResult.Success(LoginOutcome.Authenticated(session)), signedIn = true)
        val port = FakePort()
        val vm = viewModel(repository, port, signedIn = MeeshyUser(id = "u9", username = "carol"))
        advanceUntilIdle()

        vm.answerReplacement(false)
        advanceUntilIdle()

        assertThat(port.closed).containsExactly("jwt-alice")
        assertThat(port.installed).isEmpty()
        assertThat(vm.state.value.declined).isTrue()
        assertThat(vm.state.value.replacement).isNull()
        coVerify(exactly = 0) { repository.logout() }
    }

    @Test
    fun `accepter ferme le compte ouvert puis pose la session prouvee`() = runTest(dispatcher) {
        val repository = repository(NetworkResult.Success(LoginOutcome.Authenticated(session)), signedIn = true)
        val port = FakePort()
        val vm = viewModel(repository, port, signedIn = MeeshyUser(id = "u9", username = "carol"))
        advanceUntilIdle()

        vm.answerReplacement(true)
        advanceUntilIdle()

        coVerify(exactly = 1) { repository.logout() }
        assertThat(port.installed).containsExactly(session)
        assertThat(vm.state.value.isAuthenticated).isTrue()
    }

    @Test
    fun `une seconde reponse a la question est sans effet`() = runTest(dispatcher) {
        val repository = repository(NetworkResult.Success(LoginOutcome.Authenticated(session)), signedIn = true)
        val port = FakePort()
        val vm = viewModel(repository, port, signedIn = MeeshyUser(id = "u9", username = "carol"))
        advanceUntilIdle()

        vm.answerReplacement(true)
        vm.answerReplacement(true)
        advanceUntilIdle()

        coVerify(exactly = 1) { repository.logout() }
        assertThat(port.installed).hasSize(1)
    }

    @Test
    fun `le meme compte que celui qui est ouvert ne demande rien`() = runTest(dispatcher) {
        val repository = repository(NetworkResult.Success(LoginOutcome.Authenticated(session)), signedIn = true)
        val port = FakePort()
        val vm = viewModel(repository, port, signedIn = alice)
        advanceUntilIdle()

        assertThat(vm.state.value.replacement).isNull()
        coVerify(exactly = 0) { repository.logout() }
        assertThat(port.installed).containsExactly(session)
    }
}
