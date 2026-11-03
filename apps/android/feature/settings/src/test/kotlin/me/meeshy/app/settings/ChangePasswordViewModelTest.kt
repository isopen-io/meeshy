package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.model.ChangePasswordResponse
import me.meeshy.sdk.model.PasswordStrengthLevel
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Behavioural coverage of [ChangePasswordViewModel]: buffer editing + derived
 * strength/validation, the submit gate, success buffer-clearing, the double-tap
 * in-flight guard, and the failure→[ChangePasswordError] mapping (400 = wrong
 * current password, transport = network, else generic).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ChangePasswordViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun auth(hasPassword: NetworkResult<Boolean?> = NetworkResult.Success(true)): AuthRepository =
        mockk<AuthRepository>().also { coEvery { it.hasPassword() } returns hasPassword }

    private fun vm(
        repository: UserRepository = mockk(relaxed = true),
        authRepository: AuthRepository = auth(),
    ) = ChangePasswordViewModel(repository, authRepository)

    /** Fills every buffer with a submit-ready set of values. */
    private fun ChangePasswordViewModel.fillValid() {
        onCurrentPasswordChange("oldpass1")
        onNewPasswordChange("newpass12")
        onConfirmPasswordChange("newpass12")
    }

    @Test
    fun onNewPasswordChange_updatesBufferAndDerivedStrength() = runTest(dispatcher) {
        val sut = vm()
        sut.onNewPasswordChange("Abcdefg1!!")

        assertThat(sut.state.value.newPassword).isEqualTo("Abcdefg1!!")
        assertThat(sut.state.value.strength).isEqualTo(PasswordStrengthLevel.EXCELLENT)
    }

    @Test
    fun state_reflectsValidationOfTheBuffers() = runTest(dispatcher) {
        val sut = vm()
        sut.fillValid()

        assertThat(sut.state.value.validation.canSubmit).isTrue()
        assertThat(sut.state.value.canSubmit).isTrue()
    }

    @Test
    fun submit_whenInvalid_doesNothing() = runTest(dispatcher) {
        val repository = mockk<UserRepository>(relaxed = true)
        val sut = vm(repository)
        sut.onCurrentPasswordChange("") // missing current → cannot submit
        sut.onNewPasswordChange("newpass12")
        sut.onConfirmPasswordChange("newpass12")

        sut.submit()
        advanceUntilIdle()

        coVerify(exactly = 0) { repository.changePassword(any(), any()) }
    }

    @Test
    fun submit_success_flipsSuccessAndClearsBuffers() = runTest(dispatcher) {
        val repository = mockk<UserRepository>()
        coEvery { repository.changePassword(any(), any()) } returns
            NetworkResult.Success(ChangePasswordResponse(message = "ok"))
        val sut = vm(repository)
        sut.fillValid()

        sut.submit()
        advanceUntilIdle()

        val state = sut.state.value
        assertThat(state.isSuccess).isTrue()
        assertThat(state.isSaving).isFalse()
        assertThat(state.currentPassword).isEmpty()
        assertThat(state.newPassword).isEmpty()
        assertThat(state.confirmPassword).isEmpty()
        coVerify(exactly = 1) { repository.changePassword("oldpass1", "newpass12") }
    }

    @Test
    fun submit_codeCurrentPasswordIncorrect_mapsToIncorrectCurrent() = runTest(dispatcher) {
        val repository = mockk<UserRepository>()
        coEvery { repository.changePassword(any(), any()) } returns
            NetworkResult.Failure(ApiError(message = "Current password is incorrect", code = "CURRENT_PASSWORD_INCORRECT", httpStatus = 400))
        val sut = vm(repository)
        sut.fillValid()

        sut.submit()
        advanceUntilIdle()

        val state = sut.state.value
        assertThat(state.error).isEqualTo(ChangePasswordError.INCORRECT_CURRENT)
        assertThat(state.isSaving).isFalse()
        // the entered values are retained so the user can correct the current password
        assertThat(state.newPassword).isEqualTo("newpass12")
    }

    @Test
    fun submit_networkFailure_mapsToNetwork() = runTest(dispatcher) {
        val repository = mockk<UserRepository>()
        coEvery { repository.changePassword(any(), any()) } returns
            NetworkResult.Failure(ApiError(message = "offline", code = "NETWORK"))
        val sut = vm(repository)
        sut.fillValid()

        sut.submit()
        advanceUntilIdle()

        assertThat(sut.state.value.error).isEqualTo(ChangePasswordError.NETWORK)
    }

    @Test
    fun submit_otherFailure_mapsToGeneric() = runTest(dispatcher) {
        val repository = mockk<UserRepository>()
        coEvery { repository.changePassword(any(), any()) } returns
            NetworkResult.Failure(ApiError(message = "boom", code = "HTTP_500", httpStatus = 500))
        val sut = vm(repository)
        sut.fillValid()

        sut.submit()
        advanceUntilIdle()

        assertThat(sut.state.value.error).isEqualTo(ChangePasswordError.GENERIC)
    }

    @Test
    fun editingAField_clearsAPriorError() = runTest(dispatcher) {
        val repository = mockk<UserRepository>()
        coEvery { repository.changePassword(any(), any()) } returns
            NetworkResult.Failure(ApiError(message = "Current password is incorrect", code = "CURRENT_PASSWORD_INCORRECT", httpStatus = 400))
        val sut = vm(repository)
        sut.fillValid()
        sut.submit()
        advanceUntilIdle()
        assertThat(sut.state.value.error).isEqualTo(ChangePasswordError.INCORRECT_CURRENT)

        sut.onCurrentPasswordChange("corrected1")

        assertThat(sut.state.value.error).isNull()
    }

    @Test
    fun submit_whileInFlight_callsRepositoryOnce() = runTest(dispatcher) {
        val gate = CompletableDeferred<NetworkResult<ChangePasswordResponse>>()
        val repository = mockk<UserRepository>()
        coEvery { repository.changePassword(any(), any()) } coAnswers { gate.await() }
        val sut = vm(repository)
        sut.fillValid()

        sut.submit()
        runCurrent()
        assertThat(sut.state.value.isSaving).isTrue()
        // a second tap while the first request is in flight must be ignored
        sut.submit()
        runCurrent()

        gate.complete(NetworkResult.Success(ChangePasswordResponse()))
        advanceUntilIdle()

        coVerify(exactly = 1) { repository.changePassword(any(), any()) }
    }

    @Test
    fun `un compte sans mot de passe masque le champ actuel et soumet une valeur nulle`() = runTest(dispatcher) {
        val repository = mockk<UserRepository>()
        coEvery { repository.changePassword(any(), any()) } returns
            NetworkResult.Success(ChangePasswordResponse())
        val sut = vm(repository, auth(NetworkResult.Success(false)))
        advanceUntilIdle()
        assertThat(sut.state.value.asksCurrentPassword).isFalse()

        sut.onNewPasswordChange("newpass12")
        sut.onConfirmPasswordChange("newpass12")
        assertThat(sut.state.value.canSubmit).isTrue()
        sut.submit()
        advanceUntilIdle()

        coVerify(exactly = 1) { repository.changePassword(null, "newpass12") }
        assertThat(sut.state.value.isSuccess).isTrue()
    }

    @Test
    fun `un compte avec mot de passe garde le champ actuel`() = runTest(dispatcher) {
        val sut = vm(authRepository = auth(NetworkResult.Success(true)))
        advanceUntilIdle()

        assertThat(sut.state.value.asksCurrentPassword).isTrue()
        sut.onNewPasswordChange("newpass12")
        sut.onConfirmPasswordChange("newpass12")
        assertThat(sut.state.value.canSubmit).isFalse()
    }

    @Test
    fun `un echec de lecture de hasPassword retombe sur le champ demande`() = runTest(dispatcher) {
        val failure = NetworkResult.Failure(ApiError(message = "offline", code = "NETWORK"))
        val sut = vm(authRepository = auth(failure))
        advanceUntilIdle()

        assertThat(sut.state.value.hasPassword).isNull()
        assertThat(sut.state.value.asksCurrentPassword).isTrue()
        sut.onNewPasswordChange("newpass12")
        sut.onConfirmPasswordChange("newpass12")
        assertThat(sut.state.value.canSubmit).isFalse()
    }

    @Test
    fun `une passerelle qui ne sert pas le resume garde le champ demande`() = runTest(dispatcher) {
        val sut = vm(authRepository = auth(NetworkResult.Success(null)))
        advanceUntilIdle()

        assertThat(sut.state.value.asksCurrentPassword).isTrue()
    }

    @Test
    fun `un 400 en mode definition n'est pas un mot de passe actuel incorrect`() = runTest(dispatcher) {
        val repository = mockk<UserRepository>()
        coEvery { repository.changePassword(any(), any()) } returns
            NetworkResult.Failure(ApiError(message = "Password requirements: password strength score is 0/4 (minimum: 2/4)", code = "PASSWORD_TOO_WEAK", httpStatus = 400))
        val sut = vm(repository, auth(NetworkResult.Success(false)))
        advanceUntilIdle()
        sut.onNewPasswordChange("newpass12")
        sut.onConfirmPasswordChange("newpass12")

        sut.submit()
        advanceUntilIdle()

        assertThat(sut.state.value.error).isEqualTo(ChangePasswordError.WEAK)
    }

    private suspend fun TestScope.submitRejected(error: ApiError, hasPassword: Boolean = true): ChangePasswordUiState {
        val repository = mockk<UserRepository>()
        coEvery { repository.changePassword(any(), any()) } returns NetworkResult.Failure(error)
        val sut = vm(repository, auth(NetworkResult.Success(hasPassword)))
        advanceUntilIdle()
        sut.fillValid()
        sut.submit()
        advanceUntilIdle()
        return sut.state.value
    }

    @Test
    fun `un 400 mot de passe trop faible en mode changement n'est pas un actuel incorrect`() = runTest(dispatcher) {
        val state = submitRejected(
            ApiError(message = "Password requirements: password strength score is 0/4 (minimum: 2/4)", code = "PASSWORD_TOO_WEAK", httpStatus = 400),
        )
        assertThat(state.error).isEqualTo(ChangePasswordError.WEAK)
    }

    @Test
    fun `une erreur de validation est un refus generique sans texte brut`() = runTest(dispatcher) {
        val state = submitRejected(ApiError(message = "Invalid data", code = "VALIDATION_ERROR", httpStatus = 400))
        assertThat(state.error).isEqualTo(ChangePasswordError.REJECTED)
    }

    @Test
    fun `une ancienne passerelle sans code se reconnait au message exact de l'actuel faux`() = runTest(dispatcher) {
        val state = submitRejected(
            ApiError(message = "Current password is incorrect", code = "HTTP_400", httpStatus = 400),
        )
        assertThat(state.error).isEqualTo(ChangePasswordError.INCORRECT_CURRENT)
    }

    @Test
    fun `une ancienne passerelle sans code se reconnait au message trop faible`() = runTest(dispatcher) {
        val state = submitRejected(
            ApiError(message = "Password requirements: password strength score is 0/4 (minimum: 2/4)", code = "HTTP_400", httpStatus = 400),
        )
        assertThat(state.error).isEqualTo(ChangePasswordError.WEAK)
    }

    @Test
    fun `un 400 inconnu sans code n'est jamais un actuel incorrect`() = runTest(dispatcher) {
        val state = submitRejected(ApiError(message = "bad", code = "HTTP_400", httpStatus = 400))
        assertThat(state.error).isEqualTo(ChangePasswordError.REJECTED)
    }

    @Test
    fun `un 400 actuel faux en mode definition reste un refus sans texte brut`() = runTest(dispatcher) {
        val state = submitRejected(
            ApiError(message = "Current password is incorrect", code = "CURRENT_PASSWORD_INCORRECT", httpStatus = 400),
            hasPassword = false,
        )
        assertThat(state.error).isEqualTo(ChangePasswordError.REJECTED)
    }

    @Test
    fun `une erreur non 400 reste generique sans texte brut du serveur`() = runTest(dispatcher) {
        val repository = mockk<UserRepository>()
        coEvery { repository.changePassword(any(), any()) } returns
            NetworkResult.Failure(ApiError(message = "Too many requests", code = "HTTP_429", httpStatus = 429))
        val sut = vm(repository)
        sut.fillValid()

        sut.submit()
        advanceUntilIdle()

        assertThat(sut.state.value.error).isEqualTo(ChangePasswordError.GENERIC)
        sut.onNewPasswordChange("newpass123")
        assertThat(sut.state.value.error).isNull()
    }

    @Test
    fun `le succes emet la fermeture apres 1,5 seconde seulement`() = runTest(dispatcher) {
        val repository = mockk<UserRepository>()
        coEvery { repository.changePassword(any(), any()) } returns
            NetworkResult.Success(ChangePasswordResponse())
        val sut = vm(repository)
        val effects = mutableListOf<ChangePasswordEffect>()
        val job = backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { sut.effects.collect { effects += it } }
        sut.fillValid()

        sut.submit()
        advanceTimeBy(1_400)
        runCurrent()
        assertThat(sut.state.value.isSuccess).isTrue()
        assertThat(effects).isEmpty()

        advanceTimeBy(200)
        runCurrent()
        assertThat(effects).containsExactly(ChangePasswordEffect.Close)
        job.cancel()
    }
}
