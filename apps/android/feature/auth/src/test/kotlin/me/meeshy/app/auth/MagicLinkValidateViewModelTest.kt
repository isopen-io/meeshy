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
import me.meeshy.sdk.session.SessionRepository
import kotlinx.coroutines.flow.MutableStateFlow
import me.meeshy.sdk.model.auth.LinkSignInAccount
import me.meeshy.sdk.model.auth.LinkSignInIntent
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
        repository: AuthRepository = mockk<AuthRepository>(relaxed = true).also {
            every { it.isAuthenticated } returns false
            coEvery { it.verifyMagicLink(any()) } returns outcome
        },
        signedIn: MeeshyUser? = null,
    ): MagicLinkValidateViewModel {
        val opener = ProvenSessionOpener(port, flags, this, System::currentTimeMillis)
        val sessionRepository = mockk<SessionRepository>(relaxed = true)
        every { sessionRepository.currentUser } returns MutableStateFlow(signedIn)
        return MagicLinkValidateViewModel(repository, opener, gate, sessionRepository, SavedStateHandle(mapOf("token" to "tok")))
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

    private val question = LoginOutcome.LinkConfirmationRequired(
        account = LinkSignInAccount(id = "u1", username = "alice", displayName = "Alice"),
        intent = LinkSignInIntent.CLAIM_EMAIL,
        maskedEmail = "a***@mail.com",
    )

    private fun askingRepository(signedIn: Boolean = false, onConfirmed: NetworkResult<LoginOutcome>): AuthRepository =
        mockk<AuthRepository>(relaxed = true).also {
            every { it.isAuthenticated } returns signedIn
            coEvery { it.verifyMagicLink("tok", confirmed = false) } returns NetworkResult.Success(question)
            coEvery { it.verifyMagicLink("tok", confirmed = true) } returns onConfirmed
        }

    @Test
    fun `un lien non demande pose la question et n'ouvre rien tant qu'il n'y a pas de oui`() = runTest(dispatcher) {
        val port = FakePort()
        val repository = askingRepository(onConfirmed = NetworkResult.Success(LoginOutcome.Authenticated(session)))
        val vm = viewModel(NetworkResult.Success(question), port, repository = repository)

        advanceUntilIdle()

        val asked = vm.state.value.confirmation
        assertThat(asked?.handle).isEqualTo("@alice")
        assertThat(asked?.claimsEmail).isTrue()
        assertThat(asked?.maskedEmail).isEqualTo("a***@mail.com")
        assertThat(vm.state.value.isValidating).isFalse()
        assertThat(port.installed).isEmpty()
        coVerify(exactly = 0) { repository.verifyMagicLink("tok", confirmed = true) }
    }

    @Test
    fun `le oui rejoue la preuve confirmee une seule fois puis ouvre la session`() = runTest(dispatcher) {
        val port = FakePort()
        val repository = askingRepository(onConfirmed = NetworkResult.Success(LoginOutcome.Authenticated(session)))
        val vm = viewModel(NetworkResult.Success(question), port, repository = repository)
        advanceUntilIdle()

        vm.answerConfirmation(true)
        vm.answerConfirmation(true)
        advanceUntilIdle()

        coVerify(exactly = 1) { repository.verifyMagicLink("tok", confirmed = true) }
        assertThat(port.installed).containsExactly(session)
        assertThat(vm.state.value.isAuthenticated).isTrue()
        assertThat(vm.state.value.confirmation).isNull()
    }

    @Test
    fun `le non ne consomme pas le jeton et ne deconnecte personne`() = runTest(dispatcher) {
        val port = FakePort()
        val repository = askingRepository(signedIn = true, onConfirmed = NetworkResult.Success(LoginOutcome.Authenticated(session)))
        val vm = viewModel(
            NetworkResult.Success(question),
            port,
            repository = repository,
            signedIn = MeeshyUser(id = "u9", username = "carol"),
        )
        advanceUntilIdle()
        assertThat(vm.state.value.confirmation?.currentLabel).isEqualTo("@carol")

        vm.answerConfirmation(false)
        advanceUntilIdle()

        assertThat(vm.state.value.declined).isTrue()
        assertThat(vm.state.value.confirmation).isNull()
        coVerify(exactly = 0) { repository.verifyMagicLink("tok", confirmed = true) }
        coVerify(exactly = 0) { repository.logout() }
        assertThat(port.installed).isEmpty()
    }

    @Test
    fun `le meme compte que celui qui est ouvert se confirme seul`() = runTest(dispatcher) {
        val port = FakePort()
        val repository = askingRepository(signedIn = true, onConfirmed = NetworkResult.Success(LoginOutcome.Authenticated(session)))
        val vm = viewModel(
            NetworkResult.Success(question),
            port,
            repository = repository,
            signedIn = MeeshyUser(id = "u1", username = "alice"),
        )

        advanceUntilIdle()

        assertThat(vm.state.value.confirmation).isNull()
        coVerify(exactly = 1) { repository.verifyMagicLink("tok", confirmed = true) }
    }

    @Test
    fun `un autre compte ouvert n'est referme qu'apres la preuve du lien`() = runTest(dispatcher) {
        val repository = askingRepository(signedIn = true, onConfirmed = NetworkResult.Success(LoginOutcome.Authenticated(session)))
        val vm = viewModel(
            NetworkResult.Success(question),
            repository = repository,
            signedIn = MeeshyUser(id = "u9", username = "carol"),
        )
        advanceUntilIdle()
        coVerify(exactly = 0) { repository.logout() }

        vm.answerConfirmation(true)
        advanceUntilIdle()

        coVerify(exactly = 1) { repository.logout() }
    }

    @Test
    fun `une confirmation qui revient apres un oui est un echec et non une boucle`() = runTest(dispatcher) {
        val repository = askingRepository(onConfirmed = NetworkResult.Success(question))
        val vm = viewModel(NetworkResult.Success(question), repository = repository)
        advanceUntilIdle()

        vm.answerConfirmation(true)
        advanceUntilIdle()

        assertThat(vm.state.value.confirmation).isNull()
        assertThat(vm.state.value.isConfirming).isFalse()
        assertThat(vm.state.value.isAuthenticated).isFalse()
    }
}
