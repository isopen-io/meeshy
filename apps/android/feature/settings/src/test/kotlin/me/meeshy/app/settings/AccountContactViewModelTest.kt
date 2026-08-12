package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.ChangeEmailResponse
import me.meeshy.sdk.model.ChangePhoneResponse
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.VerifyPhoneChangeResponse
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Behavioural coverage of [AccountContactViewModel] (feature-parity §K "Change email /
 * phone"): the two independent email/phone sub-flows, their local submit gates, the
 * success transitions (email → sent + resend cooldown; phone → code entry → verify →
 * session refresh), and the failure → [AccountContactErrorKind] mapping.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class AccountContactViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun user(
        email: String? = "old@meeshy.me",
        phoneNumber: String? = "+33600000000",
    ) = MeeshyUser(id = "u1", username = "alice", email = email, phoneNumber = phoneNumber)

    private fun vm(
        userRepository: UserRepository = mockk(relaxed = true),
        sessionRepository: SessionRepository = mockk<SessionRepository>(relaxed = true).also {
            every { it.currentUser } returns MutableStateFlow(user())
        },
    ) = AccountContactViewModel(userRepository, sessionRepository)

    private fun sessionWith(flow: MutableStateFlow<MeeshyUser?>): SessionRepository {
        val session = mockk<SessionRepository>(relaxed = true)
        every { session.currentUser } returns flow
        return session
    }

    // ---- session mirroring ----

    @Test
    fun state_mirrorsTheSessionUser() = runTest(dispatcher) {
        val flow = MutableStateFlow<MeeshyUser?>(user(email = "a@b.com", phoneNumber = "+1"))
        val sut = vm(sessionRepository = sessionWith(flow))
        advanceUntilIdle()

        assertThat(sut.state.value.user?.email).isEqualTo("a@b.com")
        assertThat(sut.state.value.user?.phoneNumber).isEqualTo("+1")
    }

    // ---- email: editing ----

    @Test
    fun beginEditEmail_seedsBufferFromCurrentEmail() = runTest(dispatcher) {
        val flow = MutableStateFlow<MeeshyUser?>(user(email = "current@meeshy.me"))
        val sut = vm(sessionRepository = sessionWith(flow))
        advanceUntilIdle()

        sut.beginEditEmail()

        assertThat(sut.state.value.isEditingEmail).isTrue()
        assertThat(sut.state.value.newEmail).isEqualTo("current@meeshy.me")
    }

    @Test
    fun onNewEmailChange_updatesBufferAndClearsEmailErrorOnly() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>()
        coEvery { userRepo.changeEmail(any()) } returns
            NetworkResult.Failure(ApiError(message = "boom", httpStatus = 400))
        val userRepoPhone = mockk<UserRepository>(relaxed = true)
        val sut = vm(userRepository = userRepo)
        sut.beginEditEmail()
        sut.onNewEmailChange("new@meeshy.me")
        sut.submitEmailChange()
        advanceUntilIdle()
        assertThat(sut.state.value.emailError).isEqualTo(AccountContactErrorKind.EMAIL_CHANGE)

        sut.onNewEmailChange("new2@meeshy.me")

        assertThat(sut.state.value.newEmail).isEqualTo("new2@meeshy.me")
        assertThat(sut.state.value.emailError).isNull()
    }

    @Test
    fun cancelEditEmail_resetsBufferAndEditingFlag() = runTest(dispatcher) {
        val sut = vm()
        sut.beginEditEmail()
        sut.onNewEmailChange("new@meeshy.me")

        sut.cancelEditEmail()

        assertThat(sut.state.value.isEditingEmail).isFalse()
        assertThat(sut.state.value.newEmail).isEmpty()
    }

    @Test
    fun canSubmitEmail_falseForLocallyInvalidAddress() = runTest(dispatcher) {
        val sut = vm()
        sut.onNewEmailChange("not-an-email")

        assertThat(sut.state.value.canSubmitEmail).isFalse()
    }

    @Test
    fun submitEmailChange_whenInvalid_doesNothing() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>(relaxed = true)
        val sut = vm(userRepository = userRepo)
        sut.onNewEmailChange("not-an-email")

        sut.submitEmailChange()
        advanceUntilIdle()

        coVerify(exactly = 0) { userRepo.changeEmail(any()) }
    }

    @Test
    fun submitEmailChange_success_flipsSentAndStartsResendCooldown() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>()
        coEvery { userRepo.changeEmail("new@meeshy.me") } returns
            NetworkResult.Success(ChangeEmailResponse(pendingEmail = "new@meeshy.me"))
        val sut = vm(userRepository = userRepo)
        sut.beginEditEmail()
        sut.onNewEmailChange("new@meeshy.me")

        sut.submitEmailChange()
        // runCurrent (not advanceUntilIdle) — the resend cooldown just started launches
        // its own 60-iteration tick loop, which advanceUntilIdle would fully drain.
        runCurrent()

        val state = sut.state.value
        assertThat(state.emailSent).isTrue()
        assertThat(state.isEditingEmail).isFalse()
        assertThat(state.emailLoading).isFalse()
        assertThat(state.resendCooldown?.remaining).isEqualTo(60)
        assertThat(state.canResendEmail).isFalse()
        coVerify(exactly = 1) { userRepo.changeEmail("new@meeshy.me") }
    }

    @Test
    fun submitEmailChange_failure_mapsToEmailChangeError() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>()
        coEvery { userRepo.changeEmail(any()) } returns
            NetworkResult.Failure(ApiError(message = "already in use", httpStatus = 400))
        val sut = vm(userRepository = userRepo)
        sut.onNewEmailChange("taken@meeshy.me")

        sut.submitEmailChange()
        advanceUntilIdle()

        val state = sut.state.value
        assertThat(state.emailError).isEqualTo(AccountContactErrorKind.EMAIL_CHANGE)
        assertThat(state.emailSent).isFalse()
        assertThat(state.emailLoading).isFalse()
    }

    @Test
    fun submitEmailChange_whileInFlight_callsRepositoryOnce() = runTest(dispatcher) {
        val gate = CompletableDeferred<NetworkResult<ChangeEmailResponse>>()
        val userRepo = mockk<UserRepository>()
        coEvery { userRepo.changeEmail(any()) } coAnswers { gate.await() }
        val sut = vm(userRepository = userRepo)
        sut.onNewEmailChange("new@meeshy.me")

        sut.submitEmailChange()
        runCurrent()
        assertThat(sut.state.value.emailLoading).isTrue()
        sut.submitEmailChange()
        runCurrent()

        gate.complete(NetworkResult.Success(ChangeEmailResponse()))
        advanceUntilIdle()

        coVerify(exactly = 1) { userRepo.changeEmail(any()) }
    }

    @Test
    fun resendCooldown_ticksDownAndUnlocksResendOnceExpired() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>()
        coEvery { userRepo.changeEmail(any()) } returns
            NetworkResult.Success(ChangeEmailResponse(pendingEmail = "new@meeshy.me"))
        val sut = vm(userRepository = userRepo)
        sut.onNewEmailChange("new@meeshy.me")
        sut.submitEmailChange()
        runCurrent()
        assertThat(sut.state.value.canResendEmail).isFalse()

        advanceTimeBy(60_500)
        runCurrent()

        assertThat(sut.state.value.resendCooldown?.expired).isTrue()
        assertThat(sut.state.value.canResendEmail).isTrue()
    }

    @Test
    fun resendEmailVerification_whileCooldownActive_doesNothing() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>()
        coEvery { userRepo.changeEmail(any()) } returns
            NetworkResult.Success(ChangeEmailResponse(pendingEmail = "new@meeshy.me"))
        val sut = vm(userRepository = userRepo)
        sut.onNewEmailChange("new@meeshy.me")
        sut.submitEmailChange()
        runCurrent()

        sut.resendEmailVerification()
        advanceUntilIdle()

        coVerify(exactly = 0) { userRepo.resendEmailChangeVerification() }
    }

    @Test
    fun resendEmailVerification_onceUnlocked_success_restartsCooldown() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>()
        coEvery { userRepo.changeEmail(any()) } returns
            NetworkResult.Success(ChangeEmailResponse(pendingEmail = "new@meeshy.me"))
        coEvery { userRepo.resendEmailChangeVerification() } returns
            NetworkResult.Success(ChangeEmailResponse(pendingEmail = "new@meeshy.me"))
        val sut = vm(userRepository = userRepo)
        sut.onNewEmailChange("new@meeshy.me")
        sut.submitEmailChange()
        runCurrent()
        advanceTimeBy(60_500)
        runCurrent()
        assertThat(sut.state.value.canResendEmail).isTrue()

        sut.resendEmailVerification()
        // runCurrent — advanceUntilIdle would fully drain the freshly-restarted cooldown too.
        runCurrent()

        assertThat(sut.state.value.resendCooldown?.remaining).isEqualTo(60)
        coVerify(exactly = 1) { userRepo.resendEmailChangeVerification() }
    }

    @Test
    fun resendEmailVerification_failure_mapsToEmailResendError() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>()
        coEvery { userRepo.changeEmail(any()) } returns
            NetworkResult.Success(ChangeEmailResponse(pendingEmail = "new@meeshy.me"))
        coEvery { userRepo.resendEmailChangeVerification() } returns
            NetworkResult.Failure(ApiError(message = "rate limited", httpStatus = 429))
        val sut = vm(userRepository = userRepo)
        sut.onNewEmailChange("new@meeshy.me")
        sut.submitEmailChange()
        advanceUntilIdle()
        advanceTimeBy(60_500)
        runCurrent()

        sut.resendEmailVerification()
        advanceUntilIdle()

        assertThat(sut.state.value.emailError).isEqualTo(AccountContactErrorKind.EMAIL_RESEND)
    }

    @Test
    fun verifyCurrentEmail_resubmitsTheAlreadySetAddressWithoutOpeningTheEditor() = runTest(dispatcher) {
        val flow = MutableStateFlow<MeeshyUser?>(user(email = "unverified@meeshy.me"))
        val userRepo = mockk<UserRepository>()
        coEvery { userRepo.changeEmail("unverified@meeshy.me") } returns
            NetworkResult.Success(ChangeEmailResponse(pendingEmail = "unverified@meeshy.me"))
        val sut = vm(userRepository = userRepo, sessionRepository = sessionWith(flow))
        advanceUntilIdle()

        sut.verifyCurrentEmail()
        runCurrent()

        assertThat(sut.state.value.emailSent).isTrue()
        assertThat(sut.state.value.isEditingEmail).isFalse()
        coVerify(exactly = 1) { userRepo.changeEmail("unverified@meeshy.me") }
    }

    @Test
    fun verifyCurrentEmail_withNoCurrentEmail_doesNothing() = runTest(dispatcher) {
        val flow = MutableStateFlow<MeeshyUser?>(user(email = null))
        val userRepo = mockk<UserRepository>(relaxed = true)
        val sut = vm(userRepository = userRepo, sessionRepository = sessionWith(flow))
        advanceUntilIdle()

        sut.verifyCurrentEmail()
        advanceUntilIdle()

        coVerify(exactly = 0) { userRepo.changeEmail(any()) }
    }

    // ---- phone: editing ----

    @Test
    fun beginEditPhone_seedsBufferFromCurrentPhone() = runTest(dispatcher) {
        val flow = MutableStateFlow<MeeshyUser?>(user(phoneNumber = "+33612345678"))
        val sut = vm(sessionRepository = sessionWith(flow))
        advanceUntilIdle()

        sut.beginEditPhone()

        assertThat(sut.state.value.isEditingPhone).isTrue()
        assertThat(sut.state.value.newPhone).isEqualTo("+33612345678")
    }

    @Test
    fun canSubmitPhone_falseForTooFewDigits() = runTest(dispatcher) {
        val sut = vm()
        sut.onNewPhoneChange("123")

        assertThat(sut.state.value.canSubmitPhone).isFalse()
    }

    @Test
    fun submitPhoneChange_whenInvalid_doesNothing() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>(relaxed = true)
        val sut = vm(userRepository = userRepo)
        sut.onNewPhoneChange("123")

        sut.submitPhoneChange()
        advanceUntilIdle()

        coVerify(exactly = 0) { userRepo.changePhone(any()) }
    }

    @Test
    fun submitPhoneChange_success_flipsSentAndClosesEditor() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>()
        coEvery { userRepo.changePhone("+33612345678") } returns
            NetworkResult.Success(ChangePhoneResponse(pendingPhoneNumber = "+33612345678"))
        val sut = vm(userRepository = userRepo)
        sut.beginEditPhone()
        sut.onNewPhoneChange("+33612345678")

        sut.submitPhoneChange()
        advanceUntilIdle()

        val state = sut.state.value
        assertThat(state.phoneSent).isTrue()
        assertThat(state.isEditingPhone).isFalse()
        assertThat(state.phoneLoading).isFalse()
        coVerify(exactly = 1) { userRepo.changePhone("+33612345678") }
    }

    @Test
    fun verifyCurrentPhone_resubmitsTheAlreadySetNumberWithoutOpeningTheEditor() = runTest(dispatcher) {
        val flow = MutableStateFlow<MeeshyUser?>(user(phoneNumber = "+33612345678"))
        val userRepo = mockk<UserRepository>()
        coEvery { userRepo.changePhone("+33612345678") } returns
            NetworkResult.Success(ChangePhoneResponse(pendingPhoneNumber = "+33612345678"))
        val sut = vm(userRepository = userRepo, sessionRepository = sessionWith(flow))
        advanceUntilIdle()

        sut.verifyCurrentPhone()
        advanceUntilIdle()

        assertThat(sut.state.value.phoneSent).isTrue()
        assertThat(sut.state.value.isEditingPhone).isFalse()
        coVerify(exactly = 1) { userRepo.changePhone("+33612345678") }
    }

    @Test
    fun verifyCurrentPhone_withNoCurrentPhone_doesNothing() = runTest(dispatcher) {
        val flow = MutableStateFlow<MeeshyUser?>(user(phoneNumber = null))
        val userRepo = mockk<UserRepository>(relaxed = true)
        val sut = vm(userRepository = userRepo, sessionRepository = sessionWith(flow))
        advanceUntilIdle()

        sut.verifyCurrentPhone()
        advanceUntilIdle()

        coVerify(exactly = 0) { userRepo.changePhone(any()) }
    }

    @Test
    fun submitPhoneChange_failure_mapsToPhoneChangeError() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>()
        coEvery { userRepo.changePhone(any()) } returns
            NetworkResult.Failure(ApiError(message = "already in use", httpStatus = 400))
        val sut = vm(userRepository = userRepo)
        sut.onNewPhoneChange("+33612345678")

        sut.submitPhoneChange()
        advanceUntilIdle()

        assertThat(sut.state.value.phoneError).isEqualTo(AccountContactErrorKind.PHONE_CHANGE)
        assertThat(sut.state.value.phoneSent).isFalse()
    }

    @Test
    fun onPhoneCodeChange_filtersNonDigitsAndTruncatesToSix() = runTest(dispatcher) {
        val sut = vm()

        sut.onPhoneCodeChange("1a2b3c4d5e6f7g")

        assertThat(sut.state.value.phoneCode).isEqualTo("123456")
    }

    @Test
    fun canVerifyPhoneCode_falseUntilExactlySixDigits() = runTest(dispatcher) {
        val sut = vm()
        sut.onPhoneCodeChange("12345")
        assertThat(sut.state.value.canVerifyPhoneCode).isFalse()

        sut.onPhoneCodeChange("123456")
        assertThat(sut.state.value.canVerifyPhoneCode).isTrue()
    }

    @Test
    fun verifyPhoneCode_whenInvalid_doesNothing() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>(relaxed = true)
        val sut = vm(userRepository = userRepo)
        sut.onPhoneCodeChange("123")

        sut.verifyPhoneCode()
        advanceUntilIdle()

        coVerify(exactly = 0) { userRepo.verifyPhoneChange(any()) }
    }

    @Test
    fun verifyPhoneCode_success_resetsFlowAndRefreshesSession() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>()
        coEvery { userRepo.verifyPhoneChange("123456") } returns
            NetworkResult.Success(VerifyPhoneChangeResponse(newPhoneNumber = "+33612345678"))
        val session = mockk<SessionRepository>(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(user())
        val sut = vm(userRepository = userRepo, sessionRepository = session)
        sut.onNewPhoneChange("+33612345678")
        sut.onPhoneCodeChange("123456")

        sut.verifyPhoneCode()
        advanceUntilIdle()

        val state = sut.state.value
        assertThat(state.phoneVerifying).isFalse()
        assertThat(state.phoneSent).isFalse()
        assertThat(state.phoneCode).isEmpty()
        assertThat(state.newPhone).isEmpty()
        coVerify(exactly = 1) { session.refresh() }
    }

    @Test
    fun verifyPhoneCode_http400_mapsToInvalidCode() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>()
        coEvery { userRepo.verifyPhoneChange(any()) } returns
            NetworkResult.Failure(ApiError(message = "bad code", httpStatus = 400))
        val sut = vm(userRepository = userRepo)
        sut.onPhoneCodeChange("000000")

        sut.verifyPhoneCode()
        advanceUntilIdle()

        assertThat(sut.state.value.phoneError).isEqualTo(AccountContactErrorKind.PHONE_VERIFY_INVALID)
        // the entered code is retained so the user can correct/retry it
        assertThat(sut.state.value.phoneCode).isEqualTo("000000")
    }

    @Test
    fun verifyPhoneCode_otherFailure_mapsToGenericError() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>()
        coEvery { userRepo.verifyPhoneChange(any()) } returns
            NetworkResult.Failure(ApiError(message = "offline", code = "NETWORK"))
        val sut = vm(userRepository = userRepo)
        sut.onPhoneCodeChange("000000")

        sut.verifyPhoneCode()
        advanceUntilIdle()

        assertThat(sut.state.value.phoneError).isEqualTo(AccountContactErrorKind.PHONE_VERIFY_GENERIC)
    }

    @Test
    fun cancelPhoneVerification_resetsWholePhoneFlow() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>()
        coEvery { userRepo.changePhone(any()) } returns
            NetworkResult.Success(ChangePhoneResponse(pendingPhoneNumber = "+33612345678"))
        val sut = vm(userRepository = userRepo)
        sut.onNewPhoneChange("+33612345678")
        sut.submitPhoneChange()
        advanceUntilIdle()
        sut.onPhoneCodeChange("123456")

        sut.cancelPhoneVerification()

        val state = sut.state.value
        assertThat(state.phoneSent).isFalse()
        assertThat(state.isEditingPhone).isFalse()
        assertThat(state.phoneCode).isEmpty()
        assertThat(state.newPhone).isEmpty()
    }

    @Test
    fun onNewPhoneChange_doesNotClearEmailError() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>()
        coEvery { userRepo.changeEmail(any()) } returns
            NetworkResult.Failure(ApiError(message = "boom", httpStatus = 400))
        val sut = vm(userRepository = userRepo)
        sut.onNewEmailChange("new@meeshy.me")
        sut.submitEmailChange()
        advanceUntilIdle()
        assertThat(sut.state.value.emailError).isEqualTo(AccountContactErrorKind.EMAIL_CHANGE)

        sut.onNewPhoneChange("+33612345678")

        assertThat(sut.state.value.emailError).isEqualTo(AccountContactErrorKind.EMAIL_CHANGE)
    }

    @Test
    fun verifyPhoneCode_whileInFlight_callsRepositoryOnce() = runTest(dispatcher) {
        val gate = CompletableDeferred<NetworkResult<VerifyPhoneChangeResponse>>()
        val userRepo = mockk<UserRepository>()
        coEvery { userRepo.verifyPhoneChange(any()) } coAnswers { gate.await() }
        val sut = vm(userRepository = userRepo)
        sut.onPhoneCodeChange("123456")

        sut.verifyPhoneCode()
        runCurrent()
        assertThat(sut.state.value.phoneVerifying).isTrue()
        sut.verifyPhoneCode()
        runCurrent()

        gate.complete(NetworkResult.Success(VerifyPhoneChangeResponse()))
        advanceUntilIdle()

        coVerify(exactly = 1) { userRepo.verifyPhoneChange(any()) }
    }
}
