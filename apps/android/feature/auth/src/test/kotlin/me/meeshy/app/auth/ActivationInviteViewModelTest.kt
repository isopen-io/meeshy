package me.meeshy.app.auth

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import java.time.ZoneId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.auth.InMemoryActivationInviteDayStore
import me.meeshy.sdk.model.AuthSession
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UserActivation
import me.meeshy.sdk.model.UserActivation.Channel
import me.meeshy.sdk.model.auth.EmailProofError
import me.meeshy.sdk.model.auth.LoginOutcome
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ActivationInviteViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val day = 86_400_000L
    private val noon = 1_793_707_200_000L

    private fun user(
        missing: List<Channel> = listOf(Channel.EMAIL, Channel.PHONE),
        phase: UserActivation.Phase = UserActivation.Phase.INVITE,
        emailVerifiedAt: String? = null,
    ) = MeeshyUser(
        id = "u1", username = "ana", email = "ana@meeshy.me",
        activation = UserActivation(phase, null, missing), emailVerifiedAt = emailVerifiedAt,
    )

    private class Rig(
        val users: MutableStateFlow<MeeshyUser?>,
        val onboarding: MutableStateFlow<Boolean>,
        val auth: AuthRepository,
        val store: InMemoryActivationInviteDayStore,
        var clock: Long,
    ) {
        val viewModel = ActivationInviteViewModel(auth, store, { clock }, users, onboarding)
    }

    private fun rig(user: MeeshyUser? = user(), onboarding: Boolean = false, now: Long = noon) = Rig(
        users = MutableStateFlow(user),
        onboarding = MutableStateFlow(onboarding),
        auth = mockk(relaxed = true),
        store = InMemoryActivationInviteDayStore { ZoneId.of("UTC") },
        clock = now,
    )

    @Test
    fun `la feuille s'ouvre une seule fois par jour civil local`() = runTest(dispatcher) {
        val rig = rig()
        advanceUntilIdle()
        assertThat(rig.viewModel.state.value.isPresented).isTrue()

        rig.viewModel.onEvent(ActivationInviteEvent.Dismiss)
        rig.users.value = user(missing = listOf(Channel.EMAIL))
        advanceUntilIdle()
        assertThat(rig.viewModel.state.value.isPresented).isFalse()

        rig.clock += day
        rig.users.value = user(missing = listOf(Channel.PHONE))
        advanceUntilIdle()
        assertThat(rig.viewModel.state.value.isPresented).isTrue()
    }

    @Test
    fun `jamais pendant l'onboarding, puis elle s'ouvre quand il se retire`() = runTest(dispatcher) {
        val rig = rig(onboarding = true)
        advanceUntilIdle()
        assertThat(rig.viewModel.state.value.isPresented).isFalse()
        assertThat(rig.store.wasShownToday(noon)).isFalse()

        rig.onboarding.value = false
        advanceUntilIdle()
        assertThat(rig.viewModel.state.value.isPresented).isTrue()
    }

    @Test
    fun `hors phase invite rien ne s'ouvre`() = runTest(dispatcher) {
        val rig = rig(user(phase = UserActivation.Phase.QUIET))
        advanceUntilIdle()
        assertThat(rig.viewModel.state.value.isPresented).isFalse()
    }

    @Test
    fun `prouver un canal le retient et l'adresse passe a done`() = runTest(dispatcher) {
        val rig = rig()
        advanceUntilIdle()
        rig.viewModel.onEvent(ActivationInviteEvent.Prove(Channel.EMAIL))
        val invite = rig.viewModel.state.value.invite
        assertThat(invite.proven).containsExactly(Channel.EMAIL)
        assertThat(invite.missing).containsExactly(Channel.PHONE)
    }

    @Test
    fun `ouverte elle absorbe la preuve arrivee par l'utilisateur courant`() = runTest(dispatcher) {
        val rig = rig()
        advanceUntilIdle()
        rig.users.value = user(emailVerifiedAt = "2026-11-03T10:00:00Z")
        advanceUntilIdle()
        assertThat(rig.viewModel.state.value.invite.proven).containsExactly(Channel.EMAIL)
        assertThat(rig.viewModel.state.value.isPresented).isTrue()
    }

    @Test
    fun `la deconnexion ferme la feuille`() = runTest(dispatcher) {
        val rig = rig()
        advanceUntilIdle()
        rig.users.value = null
        advanceUntilIdle()
        assertThat(rig.viewModel.state.value.isPresented).isFalse()
    }

    @Test
    fun `recevoir le code appelle le renvoi puis ouvre la saisie`() = runTest(dispatcher) {
        val rig = rig()
        coEvery { rig.auth.resendEmailVerification("ana@meeshy.me") } returns NetworkResult.Success(Unit)
        advanceUntilIdle()
        rig.viewModel.onEvent(ActivationInviteEvent.SendCode)
        advanceUntilIdle()
        assertThat(rig.viewModel.state.value.emailSent).isTrue()
        coVerify(exactly = 1) { rig.auth.resendEmailVerification("ana@meeshy.me") }
    }

    @Test
    fun `un code juste prouve l'adresse, referme la session de preuve et rafraichit le compte`() = runTest(dispatcher) {
        val rig = rig()
        val proof = AuthSession(user(), token = "proof-jwt", sessionToken = "proof-session")
        coEvery { rig.auth.resendEmailVerification(any()) } returns NetworkResult.Success(Unit)
        coEvery { rig.auth.confirmEmail(any()) } returns NetworkResult.Success(LoginOutcome.Authenticated(proof))
        advanceUntilIdle()
        rig.viewModel.onEvent(ActivationInviteEvent.SendCode)
        advanceUntilIdle()
        rig.viewModel.onEvent(ActivationInviteEvent.CodeChanged("12a3456"))
        assertThat(rig.viewModel.state.value.code).isEqualTo("123456")
        rig.viewModel.onEvent(ActivationInviteEvent.Verify)
        advanceUntilIdle()

        assertThat(rig.viewModel.state.value.invite.proven).containsExactly(Channel.EMAIL)
        coVerify(exactly = 1) { rig.auth.closeProvenServerSession("proof-jwt", "proof-session") }
        coVerify(exactly = 1) { rig.auth.restoreSession() }
    }

    @Test
    fun `un code refuse reste dit sous le champ et ne prouve rien`() = runTest(dispatcher) {
        val rig = rig()
        coEvery { rig.auth.resendEmailVerification(any()) } returns NetworkResult.Success(Unit)
        coEvery { rig.auth.confirmEmail(any()) } returns NetworkResult.Failure(ApiError(message = "bad", httpStatus = 400, code = "INVALID_VERIFICATION"))
        advanceUntilIdle()
        rig.viewModel.onEvent(ActivationInviteEvent.SendCode)
        advanceUntilIdle()
        rig.viewModel.onEvent(ActivationInviteEvent.CodeChanged("123456"))
        rig.viewModel.onEvent(ActivationInviteEvent.Verify)
        advanceUntilIdle()

        assertThat(rig.viewModel.state.value.error).isEqualTo(EmailProofError.INVALID_CODE)
        assertThat(rig.viewModel.state.value.invite.proven).isEmpty()
    }

    @Test
    fun `ajouter mon numero demande Parametres et ferme la feuille`() = runTest(dispatcher) {
        val rig = rig()
        advanceUntilIdle()
        val effect = async { rig.viewModel.effects.first() }
        rig.viewModel.onEvent(ActivationInviteEvent.AddPhone)
        advanceUntilIdle()
        assertThat(effect.await()).isEqualTo(ActivationInviteEffect.OpenPhoneSettings)
        assertThat(rig.viewModel.state.value.isPresented).isFalse()
    }
}
