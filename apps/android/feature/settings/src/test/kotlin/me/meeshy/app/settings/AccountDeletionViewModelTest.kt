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
import me.meeshy.sdk.model.DeleteAccountResponse
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Behavioural coverage of [AccountDeletionViewModel]: the typed-phrase gate, the
 * double-tap in-flight guard, the success → email-confirmation transition (no logout —
 * the gateway starts a 90-day grace period and mails a confirmation link), and the
 * failure → [AccountDeletionError] mapping (409 = already pending, transport = network,
 * else generic). The wire always carries the canonical [AccountDeletionConfirmation.REQUIRED_PHRASE],
 * never the raw buffer.
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

    private fun vm(repository: UserRepository = mockk(relaxed = true)) =
        AccountDeletionViewModel(repository)

    @Test
    fun initialState_isNotConfirmedAndCannotSubmit() {
        val sut = vm()
        assertThat(sut.state.value.confirmationText).isEmpty()
        assertThat(sut.state.value.isConfirmed).isFalse()
        assertThat(sut.state.value.canSubmit).isFalse()
    }

    @Test
    fun onConfirmationTextChange_exactPhrase_enablesSubmit() {
        val sut = vm()
        sut.onConfirmationTextChange(AccountDeletionConfirmation.REQUIRED_PHRASE)

        assertThat(sut.state.value.isConfirmed).isTrue()
        assertThat(sut.state.value.canSubmit).isTrue()
    }

    @Test
    fun onConfirmationTextChange_nearMiss_keepsSubmitDisabled() {
        val sut = vm()
        sut.onConfirmationTextChange("supprimer mon compte")

        assertThat(sut.state.value.isConfirmed).isFalse()
        assertThat(sut.state.value.canSubmit).isFalse()
    }

    @Test
    fun submit_whenNotConfirmed_doesNothing() {
        val repository = mockk<UserRepository>(relaxed = true)
        val sut = vm(repository)
        sut.onConfirmationTextChange("SUPPRIMER") // partial

        sut.submit()

        coVerify(exactly = 0) { repository.deleteAccount(any()) }
    }

    @Test
    fun submit_success_flipsEmailSentAndSendsCanonicalPhrase() = runTest(dispatcher) {
        val repository = mockk<UserRepository>()
        coEvery { repository.deleteAccount(any()) } returns
            NetworkResult.Success(DeleteAccountResponse(message = "email sent"))
        val sut = vm(repository)
        // Even if the buffer somehow differed, the wire must carry the canonical literal.
        sut.onConfirmationTextChange(AccountDeletionConfirmation.REQUIRED_PHRASE)

        sut.submit()
        advanceUntilIdle()

        val state = sut.state.value
        assertThat(state.isEmailSent).isTrue()
        assertThat(state.isDeleting).isFalse()
        assertThat(state.error).isNull()
        coVerify(exactly = 1) { repository.deleteAccount(AccountDeletionConfirmation.REQUIRED_PHRASE) }
    }

    @Test
    fun submit_http409_mapsToAlreadyPending() = runTest(dispatcher) {
        val repository = mockk<UserRepository>()
        coEvery { repository.deleteAccount(any()) } returns
            NetworkResult.Failure(ApiError(message = "already", code = "HTTP_409", httpStatus = 409))
        val sut = vm(repository)
        sut.onConfirmationTextChange(AccountDeletionConfirmation.REQUIRED_PHRASE)

        sut.submit()
        advanceUntilIdle()

        val state = sut.state.value
        assertThat(state.error).isEqualTo(AccountDeletionError.ALREADY_PENDING)
        assertThat(state.isDeleting).isFalse()
        assertThat(state.isEmailSent).isFalse()
    }

    @Test
    fun submit_networkFailure_mapsToNetwork() = runTest(dispatcher) {
        val repository = mockk<UserRepository>()
        coEvery { repository.deleteAccount(any()) } returns
            NetworkResult.Failure(ApiError(message = "offline", code = "NETWORK"))
        val sut = vm(repository)
        sut.onConfirmationTextChange(AccountDeletionConfirmation.REQUIRED_PHRASE)

        sut.submit()
        advanceUntilIdle()

        assertThat(sut.state.value.error).isEqualTo(AccountDeletionError.NETWORK)
    }

    @Test
    fun submit_otherFailure_mapsToGeneric() = runTest(dispatcher) {
        val repository = mockk<UserRepository>()
        coEvery { repository.deleteAccount(any()) } returns
            NetworkResult.Failure(ApiError(message = "boom", code = "HTTP_500", httpStatus = 500))
        val sut = vm(repository)
        sut.onConfirmationTextChange(AccountDeletionConfirmation.REQUIRED_PHRASE)

        sut.submit()
        advanceUntilIdle()

        assertThat(sut.state.value.error).isEqualTo(AccountDeletionError.GENERIC)
    }

    @Test
    fun editingConfirmation_clearsAPriorError() = runTest(dispatcher) {
        val repository = mockk<UserRepository>()
        coEvery { repository.deleteAccount(any()) } returns
            NetworkResult.Failure(ApiError(message = "boom", code = "HTTP_500", httpStatus = 500))
        val sut = vm(repository)
        sut.onConfirmationTextChange(AccountDeletionConfirmation.REQUIRED_PHRASE)
        sut.submit()
        advanceUntilIdle()
        assertThat(sut.state.value.error).isEqualTo(AccountDeletionError.GENERIC)

        sut.onConfirmationTextChange("SUPPRIMER MON COMPT")

        assertThat(sut.state.value.error).isNull()
    }

    @Test
    fun submit_whileInFlight_callsRepositoryOnce() = runTest(dispatcher) {
        val gate = CompletableDeferred<NetworkResult<DeleteAccountResponse>>()
        val repository = mockk<UserRepository>()
        coEvery { repository.deleteAccount(any()) } coAnswers { gate.await() }
        val sut = vm(repository)
        sut.onConfirmationTextChange(AccountDeletionConfirmation.REQUIRED_PHRASE)

        sut.submit()
        runCurrent()
        assertThat(sut.state.value.isDeleting).isTrue()
        // a second tap while the first request is in flight must be ignored
        sut.submit()
        runCurrent()

        gate.complete(NetworkResult.Success(DeleteAccountResponse()))
        advanceUntilIdle()

        coVerify(exactly = 1) { repository.deleteAccount(any()) }
    }
}
