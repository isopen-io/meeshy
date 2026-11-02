package me.meeshy.app.auth

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.auth.EmailVerificationGateController
import me.meeshy.sdk.model.AuthSession
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.auth.LoginOutcome
import me.meeshy.sdk.net.EmailGateReason
import me.meeshy.sdk.net.EmailVerificationGateRegistry
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class EmailVerificationGateViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val alice = MeeshyUser(id = "u1", username = "alice", email = "a@mail.com")

    private fun controller(): EmailVerificationGateController {
        val sessions = mockk<SessionRepository>()
        every { sessions.currentUser } returns MutableStateFlow(alice)
        return EmailVerificationGateController(sessions, EmailVerificationGateRegistry())
    }

    @Test
    fun `la session que rend la preuve d'adresse est refermee cote passerelle et le verdict rendu`() = runTest(dispatcher) {
        val proof = AuthSession(alice, token = "proof-jwt", sessionToken = "proof-session")
        val repository = mockk<AuthRepository>(relaxed = true)
        coEvery { repository.resendEmailVerification(any()) } returns NetworkResult.Success(Unit)
        coEvery { repository.confirmEmail(any()) } returns NetworkResult.Success(LoginOutcome.Authenticated(proof))
        val gate = controller()
        var verdict: Boolean? = null
        launch { verdict = gate.verifyEmail(EmailGateReason.PUBLISH) }
        advanceUntilIdle()
        val viewModel = EmailVerificationGateViewModel(repository, gate)

        viewModel.begin(gate.request.value!!)
        advanceUntilIdle()
        viewModel.onCodeChange("123456")
        viewModel.verify()
        advanceUntilIdle()

        coVerify(exactly = 1) { repository.closeProvenServerSession("proof-jwt", "proof-session") }
        assertThat(verdict).isTrue()
    }
}
