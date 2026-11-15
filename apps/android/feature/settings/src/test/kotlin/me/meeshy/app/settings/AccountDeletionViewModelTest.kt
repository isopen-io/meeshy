package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.AccountDeletionConfirmation
import me.meeshy.sdk.model.AccountDeletionPhase
import me.meeshy.sdk.model.AccountDeletionStatus
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.AccountDeletionApi
import me.meeshy.sdk.net.api.AccountDeletionOpenedResponse
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Behavioural coverage of [AccountDeletionViewModel]: the typed-phrase + password gate,
 * the double-tap in-flight guard, the success → email-confirmation transition (no logout —
 * the gateway starts a 90-day grace period and mails a confirmation link), and the
 * failure → [AccountDeletionError] mapping (401 = wrong password, 409 = already pending,
 * transport = network, else generic). The wire always carries the canonical
 * [AccountDeletionConfirmation.REQUIRED_PHRASE], never the raw buffer.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class AccountDeletionViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun vm(api: AccountDeletionApi = mockk(relaxed = true)) =
        AccountDeletionViewModel(api)

    /**
     * A strict fake for the deletion route: every [AccountDeletionApi.open] answer must be
     * stubbed by the test, while the status read the VM performs on init answers as
     * unreadable — it asserts nothing, so the open-path assertions stand on their own.
     */
    private fun strictApi(): AccountDeletionApi = mockk<AccountDeletionApi>().also { api ->
        coEvery { api.status() } returns NetworkResult.Failure(ApiError(message = "offline", code = "NETWORK"))
    }

    private fun AccountDeletionViewModel.submitConfirmed() {
        requestDeletion()
        confirmDeletion()
    }

    @Test
    fun initialState_isNotConfirmedAndCannotSubmit() {
        val sut = vm()
        assertThat(sut.state.value.confirmationText).isEmpty()
        assertThat(sut.state.value.currentPassword).isEmpty()
        assertThat(sut.state.value.isConfirmed).isFalse()
        assertThat(sut.state.value.canSubmit).isFalse()
    }

    @Test
    fun onConfirmationTextChange_exactPhraseWithoutPassword_keepsSubmitDisabled() {
        val sut = vm()
        sut.onConfirmationTextChange(AccountDeletionConfirmation.REQUIRED_PHRASE)

        assertThat(sut.state.value.isConfirmed).isTrue()
        assertThat(sut.state.value.canSubmit).isFalse()
    }

    @Test
    fun onConfirmationTextChangeAndPassword_exactPhrase_enablesSubmit() {
        val sut = vm()
        sut.onConfirmationTextChange(AccountDeletionConfirmation.REQUIRED_PHRASE)
        sut.onCurrentPasswordChange("motdepasse")

        assertThat(sut.state.value.isConfirmed).isTrue()
        assertThat(sut.state.value.canSubmit).isTrue()
    }

    @Test
    fun onConfirmationTextChange_nearMiss_keepsSubmitDisabled() {
        val sut = vm()
        sut.onConfirmationTextChange("supprimer mon compte")
        sut.onCurrentPasswordChange("motdepasse")

        assertThat(sut.state.value.isConfirmed).isFalse()
        assertThat(sut.state.value.canSubmit).isFalse()
    }

    @Test
    fun submit_whenNotConfirmed_doesNothing() {
        val api = mockk<AccountDeletionApi>(relaxed = true)
        val sut = vm(api)
        sut.onConfirmationTextChange("SUPPRIMER") // partial
        sut.onCurrentPasswordChange("motdepasse")

        sut.submitConfirmed()

        coVerify(exactly = 0) { api.open(any(), any()) }
    }

    @Test
    fun submit_whenPasswordBlank_doesNothing() {
        val api = mockk<AccountDeletionApi>(relaxed = true)
        val sut = vm(api)
        sut.onConfirmationTextChange(AccountDeletionConfirmation.REQUIRED_PHRASE)

        sut.submitConfirmed()

        coVerify(exactly = 0) { api.open(any(), any()) }
    }

    @Test
    fun submit_success_flipsEmailSentAndSendsCanonicalPhraseAndPassword() = runTest(dispatcher) {
        val api = strictApi()
        coEvery { api.open(any(), any()) } returns
            NetworkResult.Success(AccountDeletionOpenedResponse(message = "email sent"))
        val sut = vm(api)
        // Even if the buffer somehow differed, the wire must carry the canonical literal.
        sut.onConfirmationTextChange(AccountDeletionConfirmation.REQUIRED_PHRASE)
        sut.onCurrentPasswordChange("motdepasse")

        sut.submitConfirmed()
        advanceUntilIdle()

        val state = sut.state.value
        assertThat(state.isEmailSent).isTrue()
        assertThat(state.isDeleting).isFalse()
        assertThat(state.error).isNull()
        coVerify(exactly = 1) {
            api.open(AccountDeletionConfirmation.REQUIRED_PHRASE, "motdepasse")
        }
    }

    // A submitted password has no further consumer once the request succeeded — it
    // must not linger in the ViewModel's state past that point.
    @Test
    fun submit_success_clearsThePasswordBuffer() = runTest(dispatcher) {
        val api = strictApi()
        coEvery { api.open(any(), any()) } returns
            NetworkResult.Success(AccountDeletionOpenedResponse(message = "email sent"))
        val sut = vm(api)
        sut.onConfirmationTextChange(AccountDeletionConfirmation.REQUIRED_PHRASE)
        sut.onCurrentPasswordChange("motdepasse")

        sut.submitConfirmed()
        advanceUntilIdle()

        assertThat(sut.state.value.currentPassword).isEmpty()
    }

    @Test
    fun submit_http401_mapsToInvalidPassword() = runTest(dispatcher) {
        val api = strictApi()
        coEvery { api.open(any(), any()) } returns
            NetworkResult.Failure(ApiError(message = "wrong password", code = "HTTP_401", httpStatus = 401))
        val sut = vm(api)
        sut.onConfirmationTextChange(AccountDeletionConfirmation.REQUIRED_PHRASE)
        sut.onCurrentPasswordChange("wrong")

        sut.submitConfirmed()
        advanceUntilIdle()

        val state = sut.state.value
        assertThat(state.error).isEqualTo(AccountDeletionError.INVALID_PASSWORD)
        assertThat(state.isDeleting).isFalse()
        assertThat(state.isEmailSent).isFalse()
        // A rejected password should not linger in memory — force a fresh keystroke.
        assertThat(state.currentPassword).isEmpty()
    }

    // The gateway answers 409 for TWO unrelated reasons on this route — an already-
    // pending deletion request, and a missing/unverified email precondition (`NO_EMAIL`)
    // — so the mapping must discriminate on the gateway's own `code`, not the bare
    // HTTP status, or a NO_EMAIL response is silently reported as ALREADY_PENDING.
    @Test
    fun submit_http409NoEmail_mapsToNoEmail() = runTest(dispatcher) {
        val api = strictApi()
        coEvery { api.open(any(), any()) } returns
            NetworkResult.Failure(ApiError(message = "no email", code = "NO_EMAIL", httpStatus = 409))
        val sut = vm(api)
        sut.onConfirmationTextChange(AccountDeletionConfirmation.REQUIRED_PHRASE)
        sut.onCurrentPasswordChange("motdepasse")

        sut.submitConfirmed()
        advanceUntilIdle()

        val state = sut.state.value
        assertThat(state.error).isEqualTo(AccountDeletionError.NO_EMAIL)
        assertThat(state.isDeleting).isFalse()
        assertThat(state.isEmailSent).isFalse()
    }

    @Test
    fun submit_http409_mapsToAlreadyPending() = runTest(dispatcher) {
        val api = strictApi()
        coEvery { api.open(any(), any()) } returns
            NetworkResult.Failure(ApiError(message = "already", code = "HTTP_409", httpStatus = 409))
        val sut = vm(api)
        sut.onConfirmationTextChange(AccountDeletionConfirmation.REQUIRED_PHRASE)
        sut.onCurrentPasswordChange("motdepasse")

        sut.submitConfirmed()
        advanceUntilIdle()

        val state = sut.state.value
        assertThat(state.error).isEqualTo(AccountDeletionError.ALREADY_PENDING)
        assertThat(state.isDeleting).isFalse()
        assertThat(state.isEmailSent).isFalse()
    }

    @Test
    fun submit_networkFailure_mapsToNetwork() = runTest(dispatcher) {
        val api = strictApi()
        coEvery { api.open(any(), any()) } returns
            NetworkResult.Failure(ApiError(message = "offline", code = "NETWORK"))
        val sut = vm(api)
        sut.onConfirmationTextChange(AccountDeletionConfirmation.REQUIRED_PHRASE)
        sut.onCurrentPasswordChange("motdepasse")

        sut.submitConfirmed()
        advanceUntilIdle()

        assertThat(sut.state.value.error).isEqualTo(AccountDeletionError.NETWORK)
    }

    @Test
    fun submit_otherFailure_mapsToGeneric() = runTest(dispatcher) {
        val api = strictApi()
        coEvery { api.open(any(), any()) } returns
            NetworkResult.Failure(ApiError(message = "boom", code = "HTTP_500", httpStatus = 500))
        val sut = vm(api)
        sut.onConfirmationTextChange(AccountDeletionConfirmation.REQUIRED_PHRASE)
        sut.onCurrentPasswordChange("motdepasse")

        sut.submitConfirmed()
        advanceUntilIdle()

        assertThat(sut.state.value.error).isEqualTo(AccountDeletionError.GENERIC)
    }

    @Test
    fun editingConfirmation_clearsAPriorError() = runTest(dispatcher) {
        val api = strictApi()
        coEvery { api.open(any(), any()) } returns
            NetworkResult.Failure(ApiError(message = "boom", code = "HTTP_500", httpStatus = 500))
        val sut = vm(api)
        sut.onConfirmationTextChange(AccountDeletionConfirmation.REQUIRED_PHRASE)
        sut.onCurrentPasswordChange("motdepasse")
        sut.submitConfirmed()
        advanceUntilIdle()
        assertThat(sut.state.value.error).isEqualTo(AccountDeletionError.GENERIC)

        sut.onConfirmationTextChange("SUPPRIMER MON COMPT")

        assertThat(sut.state.value.error).isNull()
    }

    @Test
    fun editingPassword_clearsAPriorError() = runTest(dispatcher) {
        val api = strictApi()
        coEvery { api.open(any(), any()) } returns
            NetworkResult.Failure(ApiError(message = "wrong password", code = "HTTP_401", httpStatus = 401))
        val sut = vm(api)
        sut.onConfirmationTextChange(AccountDeletionConfirmation.REQUIRED_PHRASE)
        sut.onCurrentPasswordChange("wrong")
        sut.submitConfirmed()
        advanceUntilIdle()
        assertThat(sut.state.value.error).isEqualTo(AccountDeletionError.INVALID_PASSWORD)

        sut.onCurrentPasswordChange("wrong2")

        assertThat(sut.state.value.error).isNull()
    }

    @Test
    fun submit_whileInFlight_callsApiOnce() = runTest(dispatcher) {
        val gate = CompletableDeferred<NetworkResult<AccountDeletionOpenedResponse>>()
        val api = strictApi()
        coEvery { api.open(any(), any()) } coAnswers { gate.await() }
        val sut = vm(api)
        sut.onConfirmationTextChange(AccountDeletionConfirmation.REQUIRED_PHRASE)
        sut.onCurrentPasswordChange("motdepasse")

        sut.submitConfirmed()
        runCurrent()
        assertThat(sut.state.value.isDeleting).isTrue()
        // a second tap while the first request is in flight must be ignored
        sut.submitConfirmed()
        runCurrent()

        gate.complete(NetworkResult.Success(AccountDeletionOpenedResponse()))
        advanceUntilIdle()

        coVerify(exactly = 1) { api.open(any(), any()) }
    }

    private fun readyVm(api: AccountDeletionApi): AccountDeletionViewModel = vm(api).also {
        it.onConfirmationTextChange(AccountDeletionConfirmation.REQUIRED_PHRASE)
        it.onCurrentPasswordChange("motdepasse")
    }

    @Test
    fun requestDeletion_raisesTheFinalAlertWithAHeavyHapticAndNoNetworkCall() = runTest(dispatcher) {
        val api = mockk<AccountDeletionApi>(relaxed = true)
        val sut = readyVm(api)

        sut.requestDeletion()
        advanceUntilIdle()

        assertThat(sut.state.value.showFinalConfirmation).isTrue()
        assertThat(sut.effects.first()).isEqualTo(AccountDeletionEffect.HAPTIC_HEAVY)
        coVerify(exactly = 0) { api.open(any(), any()) }
    }

    @Test
    fun requestDeletion_whenGateIsClosed_doesNothing() = runTest(dispatcher) {
        val sut = vm()
        sut.onConfirmationTextChange(AccountDeletionConfirmation.REQUIRED_PHRASE)

        sut.requestDeletion()

        assertThat(sut.state.value.showFinalConfirmation).isFalse()
    }

    @Test
    fun dismissFinalConfirmation_cancelsWithoutAnyCall() = runTest(dispatcher) {
        val api = mockk<AccountDeletionApi>(relaxed = true)
        val sut = readyVm(api)
        sut.requestDeletion()

        sut.dismissFinalConfirmation()
        sut.confirmDeletion()
        advanceUntilIdle()

        assertThat(sut.state.value.showFinalConfirmation).isFalse()
        assertThat(sut.state.value.isDeleting).isFalse()
        coVerify(exactly = 0) { api.open(any(), any()) }
    }

    @Test
    fun confirmDeletion_withoutTheAlert_isIgnored() = runTest(dispatcher) {
        val api = mockk<AccountDeletionApi>(relaxed = true)
        val sut = readyVm(api)

        sut.confirmDeletion()
        advanceUntilIdle()

        coVerify(exactly = 0) { api.open(any(), any()) }
    }

    @Test
    fun confirmDeletion_twice_callsTheApiOnce() = runTest(dispatcher) {
        val api = strictApi()
        coEvery { api.open(any(), any()) } returns NetworkResult.Success(AccountDeletionOpenedResponse())
        val sut = readyVm(api)
        sut.requestDeletion()

        sut.confirmDeletion()
        sut.confirmDeletion()
        advanceUntilIdle()

        coVerify(exactly = 1) { api.open(any(), any()) }
    }

    @Test
    fun confirmDeletion_successThenFailure_emitSuccessAndErrorHaptics() = runTest(dispatcher) {
        val api = strictApi()
        coEvery { api.open(any(), any()) } returns NetworkResult.Success(AccountDeletionOpenedResponse())
        val ok = readyVm(api)
        ok.submitConfirmed()
        advanceUntilIdle()
        assertThat(ok.effects.take(2).toList())
            .containsExactly(AccountDeletionEffect.HAPTIC_HEAVY, AccountDeletionEffect.HAPTIC_SUCCESS).inOrder()

        coEvery { api.open(any(), any()) } returns
            NetworkResult.Failure(ApiError(message = "boom", code = "HTTP_500", httpStatus = 500))
        val ko = readyVm(api)
        ko.submitConfirmed()
        advanceUntilIdle()
        assertThat(ko.effects.take(2).toList())
            .containsExactly(AccountDeletionEffect.HAPTIC_HEAVY, AccountDeletionEffect.HAPTIC_ERROR).inOrder()
    }

    private fun apiWithStatus(status: AccountDeletionStatus): AccountDeletionApi {
        val api = mockk<AccountDeletionApi>(relaxed = true)
        coEvery { api.status() } returns NetworkResult.Success(status)
        return api
    }

    @Test
    fun `no request reads as none, a state and not an absence`() = runTest(dispatcher) {
        val sut = vm(apiWithStatus(AccountDeletionStatus()))
        advanceUntilIdle()

        assertThat(sut.state.value.deletion).isEqualTo(AccountDeletionPhase.None)
    }

    @Test
    fun `a request awaiting its e-mail link reads as pending`() = runTest(dispatcher) {
        val sut = vm(apiWithStatus(AccountDeletionStatus(status = "PENDING_EMAIL_CONFIRMATION")))
        advanceUntilIdle()

        assertThat(sut.state.value.deletion).isEqualTo(AccountDeletionPhase.PendingConfirmation)
    }

    @Test
    fun `a confirmed request shows the cancellation deadline`() = runTest(dispatcher) {
        val sut = vm(
            apiWithStatus(
                AccountDeletionStatus(status = "CONFIRMED", gracePeriodEndsAt = "2026-11-01T00:00:00.000Z", canCancelUntil = "2026-11-01T00:00:00.000Z"),
            ),
        )
        advanceUntilIdle()

        assertThat(sut.state.value.deletion).isEqualTo(AccountDeletionPhase.GracePeriod("2026-11-01T00:00:00.000Z"))
    }

    @Test
    fun `an unreadable status asserts nothing and raises no error`() = runTest(dispatcher) {
        val api = mockk<AccountDeletionApi>(relaxed = true)
        coEvery { api.status() } returns NetworkResult.Failure(ApiError(message = "offline", code = "NETWORK"))
        val sut = vm(api)
        advanceUntilIdle()

        assertThat(sut.state.value.deletion).isNull()
        assertThat(sut.state.value.error).isNull()
    }

    @Test
    fun `opening a request keeps the link expiry and flips to pending`() = runTest(dispatcher) {
        val api = apiWithStatus(AccountDeletionStatus())
        coEvery { api.open(any(), any()) } returns
            NetworkResult.Success(AccountDeletionOpenedResponse(message = "ok", tokenExpiresAt = "2026-10-24T10:00:00.000Z"))
        val sut = readyVm(api)

        sut.submitConfirmed()
        advanceUntilIdle()

        assertThat(sut.state.value.tokenExpiresAt).isEqualTo("2026-10-24T10:00:00.000Z")
        assertThat(sut.state.value.deletion).isEqualTo(AccountDeletionPhase.PendingConfirmation)
    }

    @Test
    fun `a 409 already pending re-reads the status instead of blocking`() = runTest(dispatcher) {
        val api = mockk<AccountDeletionApi>(relaxed = true)
        coEvery { api.status() } returnsMany listOf(
            NetworkResult.Success(AccountDeletionStatus()),
            NetworkResult.Success(AccountDeletionStatus(status = "CONFIRMED", canCancelUntil = "2026-11-01T00:00:00.000Z")),
        )
        coEvery { api.open(any(), any()) } returns
            NetworkResult.Failure(ApiError(message = "already", code = "HTTP_409", httpStatus = 409))
        val sut = readyVm(api)
        advanceUntilIdle()

        sut.submitConfirmed()
        advanceUntilIdle()

        assertThat(sut.state.value.error).isEqualTo(AccountDeletionError.ALREADY_PENDING)
        assertThat(sut.state.value.deletion).isEqualTo(AccountDeletionPhase.GracePeriod("2026-11-01T00:00:00.000Z"))
    }
}
