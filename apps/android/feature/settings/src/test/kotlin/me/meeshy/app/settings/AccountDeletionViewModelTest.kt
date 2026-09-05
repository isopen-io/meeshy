package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.AccountDeletionConfirmation
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

        sut.submit()

        coVerify(exactly = 0) { api.open(any(), any()) }
    }

    @Test
    fun submit_whenPasswordBlank_doesNothing() {
        val api = mockk<AccountDeletionApi>(relaxed = true)
        val sut = vm(api)
        sut.onConfirmationTextChange(AccountDeletionConfirmation.REQUIRED_PHRASE)

        sut.submit()

        coVerify(exactly = 0) { api.open(any(), any()) }
    }

    @Test
    fun submit_success_flipsEmailSentAndSendsCanonicalPhraseAndPassword() = runTest(dispatcher) {
        val api = mockk<AccountDeletionApi>()
        coEvery { api.open(any(), any()) } returns
            NetworkResult.Success(AccountDeletionOpenedResponse(message = "email sent"))
        val sut = vm(api)
        // Even if the buffer somehow differed, the wire must carry the canonical literal.
        sut.onConfirmationTextChange(AccountDeletionConfirmation.REQUIRED_PHRASE)
        sut.onCurrentPasswordChange("motdepasse")

        sut.submit()
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
        val api = mockk<AccountDeletionApi>()
        coEvery { api.open(any(), any()) } returns
            NetworkResult.Success(AccountDeletionOpenedResponse(message = "email sent"))
        val sut = vm(api)
        sut.onConfirmationTextChange(AccountDeletionConfirmation.REQUIRED_PHRASE)
        sut.onCurrentPasswordChange("motdepasse")

        sut.submit()
        advanceUntilIdle()

        assertThat(sut.state.value.currentPassword).isEmpty()
    }

    @Test
    fun submit_http401_mapsToInvalidPassword() = runTest(dispatcher) {
        val api = mockk<AccountDeletionApi>()
        coEvery { api.open(any(), any()) } returns
            NetworkResult.Failure(ApiError(message = "wrong password", code = "HTTP_401", httpStatus = 401))
        val sut = vm(api)
        sut.onConfirmationTextChange(AccountDeletionConfirmation.REQUIRED_PHRASE)
        sut.onCurrentPasswordChange("wrong")

        sut.submit()
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
        val api = mockk<AccountDeletionApi>()
        coEvery { api.open(any(), any()) } returns
            NetworkResult.Failure(ApiError(message = "no email", code = "NO_EMAIL", httpStatus = 409))
        val sut = vm(api)
        sut.onConfirmationTextChange(AccountDeletionConfirmation.REQUIRED_PHRASE)
        sut.onCurrentPasswordChange("motdepasse")

        sut.submit()
        advanceUntilIdle()

        val state = sut.state.value
        assertThat(state.error).isEqualTo(AccountDeletionError.NO_EMAIL)
        assertThat(state.isDeleting).isFalse()
        assertThat(state.isEmailSent).isFalse()
    }

    @Test
    fun submit_http409_mapsToAlreadyPending() = runTest(dispatcher) {
        val api = mockk<AccountDeletionApi>()
        coEvery { api.open(any(), any()) } returns
            NetworkResult.Failure(ApiError(message = "already", code = "HTTP_409", httpStatus = 409))
        val sut = vm(api)
        sut.onConfirmationTextChange(AccountDeletionConfirmation.REQUIRED_PHRASE)
        sut.onCurrentPasswordChange("motdepasse")

        sut.submit()
        advanceUntilIdle()

        val state = sut.state.value
        assertThat(state.error).isEqualTo(AccountDeletionError.ALREADY_PENDING)
        assertThat(state.isDeleting).isFalse()
        assertThat(state.isEmailSent).isFalse()
    }

    @Test
    fun submit_networkFailure_mapsToNetwork() = runTest(dispatcher) {
        val api = mockk<AccountDeletionApi>()
        coEvery { api.open(any(), any()) } returns
            NetworkResult.Failure(ApiError(message = "offline", code = "NETWORK"))
        val sut = vm(api)
        sut.onConfirmationTextChange(AccountDeletionConfirmation.REQUIRED_PHRASE)
        sut.onCurrentPasswordChange("motdepasse")

        sut.submit()
        advanceUntilIdle()

        assertThat(sut.state.value.error).isEqualTo(AccountDeletionError.NETWORK)
    }

    @Test
    fun submit_otherFailure_mapsToGeneric() = runTest(dispatcher) {
        val api = mockk<AccountDeletionApi>()
        coEvery { api.open(any(), any()) } returns
            NetworkResult.Failure(ApiError(message = "boom", code = "HTTP_500", httpStatus = 500))
        val sut = vm(api)
        sut.onConfirmationTextChange(AccountDeletionConfirmation.REQUIRED_PHRASE)
        sut.onCurrentPasswordChange("motdepasse")

        sut.submit()
        advanceUntilIdle()

        assertThat(sut.state.value.error).isEqualTo(AccountDeletionError.GENERIC)
    }

    @Test
    fun editingConfirmation_clearsAPriorError() = runTest(dispatcher) {
        val api = mockk<AccountDeletionApi>()
        coEvery { api.open(any(), any()) } returns
            NetworkResult.Failure(ApiError(message = "boom", code = "HTTP_500", httpStatus = 500))
        val sut = vm(api)
        sut.onConfirmationTextChange(AccountDeletionConfirmation.REQUIRED_PHRASE)
        sut.onCurrentPasswordChange("motdepasse")
        sut.submit()
        advanceUntilIdle()
        assertThat(sut.state.value.error).isEqualTo(AccountDeletionError.GENERIC)

        sut.onConfirmationTextChange("SUPPRIMER MON COMPT")

        assertThat(sut.state.value.error).isNull()
    }

    @Test
    fun editingPassword_clearsAPriorError() = runTest(dispatcher) {
        val api = mockk<AccountDeletionApi>()
        coEvery { api.open(any(), any()) } returns
            NetworkResult.Failure(ApiError(message = "wrong password", code = "HTTP_401", httpStatus = 401))
        val sut = vm(api)
        sut.onConfirmationTextChange(AccountDeletionConfirmation.REQUIRED_PHRASE)
        sut.onCurrentPasswordChange("wrong")
        sut.submit()
        advanceUntilIdle()
        assertThat(sut.state.value.error).isEqualTo(AccountDeletionError.INVALID_PASSWORD)

        sut.onCurrentPasswordChange("wrong2")

        assertThat(sut.state.value.error).isNull()
    }

    @Test
    fun submit_whileInFlight_callsApiOnce() = runTest(dispatcher) {
        val gate = CompletableDeferred<NetworkResult<AccountDeletionOpenedResponse>>()
        val api = mockk<AccountDeletionApi>()
        coEvery { api.open(any(), any()) } coAnswers { gate.await() }
        val sut = vm(api)
        sut.onConfirmationTextChange(AccountDeletionConfirmation.REQUIRED_PHRASE)
        sut.onCurrentPasswordChange("motdepasse")

        sut.submit()
        runCurrent()
        assertThat(sut.state.value.isDeleting).isTrue()
        // a second tap while the first request is in flight must be ignored
        sut.submit()
        runCurrent()

        gate.complete(NetworkResult.Success(AccountDeletionOpenedResponse()))
        advanceUntilIdle()

        coVerify(exactly = 1) { api.open(any(), any()) }
    }
}
