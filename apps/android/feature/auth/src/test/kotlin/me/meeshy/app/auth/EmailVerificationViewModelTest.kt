package me.meeshy.app.auth

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.auth.EmailVerificationStatusSource
import me.meeshy.sdk.auth.EmailVerificationWatcher
import me.meeshy.sdk.model.AuthSession
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.auth.EmailProofError
import me.meeshy.sdk.model.auth.EmailVerificationLead
import me.meeshy.sdk.model.auth.EmailVerificationRequest
import me.meeshy.sdk.model.auth.EmailVerificationWatchStatus
import me.meeshy.sdk.model.auth.LoginOutcome
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class EmailVerificationViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val session = AuthSession(MeeshyUser(id = "u1", username = "alice"), token = "jwt")
    private val authenticated = LoginOutcome.Authenticated(session)

    private fun viewModel(
        repository: AuthRepository,
        status: () -> NetworkResult<EmailVerificationWatchStatus> = { NetworkResult.Success(EmailVerificationWatchStatus.PENDING) },
    ) = EmailVerificationViewModel(repository, EmailVerificationWatcher(EmailVerificationStatusSource { status() })).also {
        it.begin("a@mail.com", password = "secret", accountCreated = false, pendingSessionToken = "tok")
    }

    private fun repository(verify: NetworkResult<LoginOutcome> = NetworkResult.Success(authenticated)) =
        mockk<AuthRepository>(relaxed = true).also {
            coEvery { it.confirmEmail(any()) } returns verify
            coEvery { it.resendEmailVerification(any()) } returns NetworkResult.Success(Unit)
        }

    @Test
    fun `l'accroche vient du mot de passe tape et du compte cree`() {
        val vm = viewModel(repository())
        assertThat(vm.state.value.lead).isEqualTo(EmailVerificationLead.ACTIVATION_REQUIRED)
        vm.begin("b@mail.com", password = null, accountCreated = true, pendingSessionToken = null)
        assertThat(vm.state.value.lead).isEqualTo(EmailVerificationLead.ACCOUNT_CREATED)
    }

    @Test
    fun `six chiffres verifient le code avec le mot de passe et la coche precede l'ouverture de session`() = runTest(dispatcher) {
        val repo = repository()
        val request = slot<EmailVerificationRequest>()
        coEvery { repo.confirmEmail(capture(request)) } returns NetworkResult.Success(authenticated)
        val vm = viewModel(repo)

        vm.effect.test {
            vm.onEvent(EmailVerificationEvent.CodeChanged("12-34 56x"))
            advanceTimeBy(100)
            assertThat(vm.state.value.verified).isTrue()
            expectNoEvents()
            advanceUntilIdle()
            assertThat(awaitItem()).isEqualTo(EmailVerificationEffect.Verified(authenticated))
        }
        assertThat(request.captured.code).isEqualTo("123456")
        assertThat(request.captured.password).isEqualTo("secret")
    }

    @Test
    fun `sous six chiffres rien ne part`() = runTest(dispatcher) {
        val repo = repository()
        val vm = viewModel(repo)
        vm.onEvent(EmailVerificationEvent.CodeChanged("12345"))
        vm.onEvent(EmailVerificationEvent.Verify)
        advanceUntilIdle()
        coVerify(exactly = 0) { repo.confirmEmail(any()) }
    }

    @Test
    fun `chaque refus a son erreur typee et le champ reste editable`() = runTest(dispatcher) {
        val cases = mapOf(
            ("INVALID_VERIFICATION" to 400) to EmailProofError.INVALID_CODE,
            ("VERIFICATION_EXPIRED" to 400) to EmailProofError.EXPIRED_CODE,
            ("WEAK_PASSWORD" to 400) to EmailProofError.WEAK_PASSWORD,
            ("RATE_LIMITED" to 429) to EmailProofError.TOO_MANY_ATTEMPTS,
            ("NETWORK" to null) to EmailProofError.OFFLINE,
        )
        cases.forEach { (wire, expected) ->
            val vm = viewModel(repository(NetworkResult.Failure(ApiError("x", code = wire.first, httpStatus = wire.second))))
            vm.onEvent(EmailVerificationEvent.CodeChanged("123456"))
            advanceUntilIdle()
            assertThat(vm.state.value.error).isEqualTo(expected)
            assertThat(vm.state.value.isVerifying).isFalse()
            assertThat(vm.state.value.gate.isCodeEditable).isTrue()
        }
    }

    @Test
    fun `retaper le code efface l'erreur`() = runTest(dispatcher) {
        val vm = viewModel(repository(NetworkResult.Failure(ApiError("x", code = "INVALID_VERIFICATION", httpStatus = 400))))
        vm.onEvent(EmailVerificationEvent.CodeChanged("123456"))
        advanceUntilIdle()
        vm.onEvent(EmailVerificationEvent.CodeChanged("12345"))
        assertThat(vm.state.value.error).isNull()
    }

    @Test
    fun `renvoyer confirme pendant 3 secondes puis redevient actif`() = runTest(dispatcher) {
        val vm = viewModel(repository())
        vm.onEvent(EmailVerificationEvent.Resend)
        advanceTimeBy(100)
        assertThat(vm.state.value.resendConfirmed).isTrue()
        assertThat(vm.state.value.gate.canResend).isFalse()
        advanceTimeBy(3_000)
        assertThat(vm.state.value.resendConfirmed).isFalse()
        assertThat(vm.state.value.gate.canResend).isTrue()
    }

    @Test
    fun `un renvoi impossible est dit sous le champ`() = runTest(dispatcher) {
        val repo = repository()
        coEvery { repo.resendEmailVerification(any()) } returns NetworkResult.Failure(ApiError("x", code = "BOOM", httpStatus = 500))
        val vm = viewModel(repo)
        vm.onEvent(EmailVerificationEvent.Resend)
        advanceUntilIdle()
        assertThat(vm.state.value.error).isEqualTo(EmailProofError.RESEND_FAILED)
    }

    @Test
    fun `une adresse prouvee ailleurs affiche le bandeau sans ouvrir de session`() = runTest(dispatcher) {
        val repo = repository()
        val vm = viewModel(repo, status = { NetworkResult.Success(EmailVerificationWatchStatus.PROVEN) })
        vm.onEvent(EmailVerificationEvent.WatchStarted)
        advanceUntilIdle()
        assertThat(vm.state.value.provenElsewhere).isTrue()
        assertThat(vm.state.value.verified).isFalse()
        coVerify(exactly = 0) { repo.confirmEmail(any()) }
    }

    @Test
    fun `un defi de second facteur est remis a l'hote sans coche`() = runTest(dispatcher) {
        val challenge = LoginOutcome.TwoFactorRequired("2fa")
        val vm = viewModel(repository(NetworkResult.Success(challenge)))
        vm.effect.test {
            vm.onEvent(EmailVerificationEvent.CodeChanged("123456"))
            advanceUntilIdle()
            assertThat(awaitItem()).isEqualTo(EmailVerificationEffect.Verified(challenge))
        }
        assertThat(vm.state.value.verified).isFalse()
    }
}
