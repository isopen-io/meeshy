package me.meeshy.app.auth

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.auth.ArrivalCelebrating
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.auth.LoginHandoffs
import me.meeshy.sdk.auth.ProvenSessionOpener
import me.meeshy.sdk.auth.ProvenSessionPort
import me.meeshy.sdk.model.AuthSession
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.auth.EmailCodeDispatch
import me.meeshy.sdk.model.auth.LoginOutcome
import me.meeshy.sdk.model.auth.SentEmailCode
import me.meeshy.sdk.model.auth.SessionOrigin
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.SessionTransitionFlags
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class MagicLinkViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private class FakePort : ProvenSessionPort {
        override val isAuthenticated: Boolean = false
        override val activeUserId: String? = null
        val installed = mutableListOf<AuthSession>()
        override fun install(session: AuthSession, origin: SessionOrigin) {
            installed += session
        }

        override suspend fun closeServerSession(jwt: String, sessionToken: String?): Boolean = true
    }

    private class Harness(
        val viewModel: MagicLinkViewModel,
        val repository: AuthRepository,
        val gate: SessionOpeningGate,
        val port: FakePort,
        val arrival: ArrivalCelebrating,
    )

    private fun TestScope.harness(
        dispatch: NetworkResult<EmailCodeDispatch> = NetworkResult.Success(EmailCodeDispatch(60, "pending-1")),
        handoffs: LoginHandoffs = LoginHandoffs(),
    ): Harness {
        val repository = mockk<AuthRepository>(relaxed = true)
        coEvery { repository.requestEmailCode(any()) } returns dispatch
        val port = FakePort()
        val gate = SessionOpeningGate()
        val arrival = mockk<ArrivalCelebrating>(relaxed = true)
        val opener = ProvenSessionOpener(port, SessionTransitionFlags(), this, System::currentTimeMillis)
        return Harness(MagicLinkViewModel(repository, handoffs, opener, gate, arrival), repository, gate, port, arrival)
    }

    private val session = AuthSession(MeeshyUser(id = "u1", username = "ada"), token = "jwt")

    private fun Harness.type(email: String) = viewModel.onEvent(MagicLinkEvent.EmailChanged(email))

    @Test
    fun `sending asks for a code and a link and the screen waits on the address they went to`() = runTest(dispatcher) {
        val h = harness()
        h.type("ada@example.com")

        h.viewModel.onEvent(MagicLinkEvent.Send)
        runCurrent()

        val state = h.viewModel.state.value
        assertThat(state.sentTo).isEqualTo("ada@example.com")
        assertThat(state.pendingSessionToken).isEqualTo("pending-1")
        assertThat(state.countdown?.remaining).isEqualTo(60)
        assertThat(state.isSubmitting).isFalse()
        coVerify(exactly = 1) { h.repository.requestEmailCode("ada@example.com") }
    }

    @Test
    fun `an invalid address sends nothing`() = runTest(dispatcher) {
        val h = harness()
        h.type("not-an-address")

        h.viewModel.onEvent(MagicLinkEvent.Send)
        runCurrent()

        assertThat(h.viewModel.state.value.sentTo).isNull()
        coVerify(exactly = 0) { h.repository.requestEmailCode(any()) }
    }

    @Test
    fun `a network error stays on the address step with its message`() = runTest(dispatcher) {
        val h = harness(dispatch = NetworkResult.Failure(ApiError(message = "offline")))
        h.type("ada@example.com")

        h.viewModel.onEvent(MagicLinkEvent.Send)
        runCurrent()

        val state = h.viewModel.state.value
        assertThat(state.sentTo).isNull()
        assertThat(state.isSubmitting).isFalse()
        assertThat(state.errorMessage).isNotNull()
    }

    @Test
    fun `the address typed at sign-in prefills the field`() = runTest(dispatcher) {
        val handoffs = LoginHandoffs().apply { recoveryEmail.hold("ada@example.com") }

        val h = harness(handoffs = handoffs)

        assertThat(h.viewModel.state.value.email).isEqualTo("ada@example.com")
    }

    @Test
    fun `a request already sent from sign-up opens on its wait, countdown included`() = runTest(dispatcher) {
        val handoffs = LoginHandoffs().apply {
            sentEmailCode.hold(SentEmailCode("ada@example.com", EmailCodeDispatch(120, "pending-9")))
        }

        val h = harness(handoffs = handoffs)

        val state = h.viewModel.state.value
        assertThat(state.isWaiting).isTrue()
        assertThat(state.sentTo).isEqualTo("ada@example.com")
        assertThat(state.pendingSessionToken).isEqualTo("pending-9")
        assertThat(state.countdown?.remaining).isEqualTo(120)
        coVerify(exactly = 0) { h.repository.requestEmailCode(any()) }
    }

    @Test
    fun `resend stays blocked while the link lives and unlocks once the countdown has drained`() = runTest(dispatcher) {
        val h = harness(dispatch = NetworkResult.Success(EmailCodeDispatch(3, "p")))
        h.type("ada@example.com")
        h.viewModel.onEvent(MagicLinkEvent.Send)
        runCurrent()

        h.viewModel.onEvent(MagicLinkEvent.Send)
        runCurrent()
        coVerify(exactly = 1) { h.repository.requestEmailCode(any()) }
        assertThat(h.viewModel.state.value.canResend).isFalse()

        advanceTimeBy(3_100)
        runCurrent()
        assertThat(h.viewModel.state.value.countdown?.showExpiredWarning).isTrue()
        assertThat(h.viewModel.state.value.canResend).isTrue()

        h.viewModel.onEvent(MagicLinkEvent.Send)
        h.viewModel.onEvent(MagicLinkEvent.Send)
        runCurrent()
        coVerify(exactly = 2) { h.repository.requestEmailCode("ada@example.com") }
        assertThat(h.viewModel.state.value.countdown?.remaining).isEqualTo(3)
        assertThat(h.viewModel.state.value.dispatchCount).isEqualTo(2)
    }

    @Test
    fun `cancelling the wait returns to the address step and stops the countdown`() = runTest(dispatcher) {
        val h = harness()
        h.type("ada@example.com")
        h.viewModel.onEvent(MagicLinkEvent.Send)
        runCurrent()

        h.viewModel.onEvent(MagicLinkEvent.Cancel)
        advanceTimeBy(5_000)
        runCurrent()

        val state = h.viewModel.state.value
        assertThat(state.isWaiting).isFalse()
        assertThat(state.countdown).isNull()
        assertThat(state.email).isEqualTo("ada@example.com")
    }

    @Test
    fun `a right code opens the session once the sheet is closed, like the link`() = runTest(dispatcher) {
        val h = harness()
        h.gate.presentationBegan()
        var opened = 0

        h.viewModel.effect.test {
            h.viewModel.onEvent(MagicLinkEvent.CodeVerified(LoginOutcome.Authenticated(session)) { opened += 1 })
            assertThat(awaitItem()).isEqualTo(MagicLinkEffect.Close)
            assertThat(h.port.installed).isEmpty()

            h.gate.presentationEnded()

            assertThat(h.port.installed).containsExactly(session)
            assertThat(opened).isEqualTo(1)
            verify { h.arrival.prepare("u1") }
        }
    }

    @Test
    fun `a code that opens a second-factor challenge hands it to the sign-in`() = runTest(dispatcher) {
        val h = harness()
        val challenge = LoginOutcome.TwoFactorRequired("tmp", adoptWithinSeconds = 300)

        h.viewModel.effect.test {
            h.viewModel.onEvent(MagicLinkEvent.CodeVerified(challenge) {})

            assertThat(awaitItem()).isEqualTo(MagicLinkEffect.SecondFactor(challenge))
        }
        assertThat(h.port.installed).isEmpty()
    }
}
