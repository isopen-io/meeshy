package me.meeshy.app.auth

import androidx.lifecycle.SavedStateHandle
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.model.auth.PasswordResetFlow
import me.meeshy.sdk.model.auth.ResetTokenVerification
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class NewPasswordViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun repository(
        verification: NetworkResult<ResetTokenVerification> = NetworkResult.Success(ResetTokenVerification(valid = true)),
        submission: NetworkResult<Unit> = NetworkResult.Success(Unit),
    ): AuthRepository = mockk<AuthRepository>(relaxed = true).also {
        coEvery { it.verifyResetToken(any()) } returns verification
        coEvery { it.submitPasswordReset(any(), any(), any()) } returns submission
    }

    private fun viewModel(repository: AuthRepository, handle: SavedStateHandle = SavedStateHandle(mapOf("token" to "tok"))) =
        NewPasswordViewModel(repository, handle)

    private fun refusal(status: Int, code: String?, message: String = "") =
        NetworkResult.Failure(ApiError(message = message, code = code, httpStatus = status))

    @Test
    fun `le jeton est verifie sans etre consomme des l'ouverture`() = runTest(dispatcher) {
        val repository = repository()
        viewModel(repository)
        advanceUntilIdle()
        coVerify(exactly = 1) { repository.verifyResetToken("tok") }
        coVerify(exactly = 0) { repository.submitPasswordReset(any(), any(), any()) }
    }

    @Test
    fun `le jeton est efface de l'etat sauvegarde des qu'il est lu`() = runTest(dispatcher) {
        val handle = SavedStateHandle(mapOf("token" to "tok"))
        viewModel(repository(), handle)
        assertThat(handle.contains("token")).isFalse()
    }

    @Test
    fun `un lien sans jeton est un lien mort et n'appelle rien`() = runTest(dispatcher) {
        val repository = repository()
        val vm = viewModel(repository, SavedStateHandle())
        advanceUntilIdle()
        assertThat(vm.state.value.flow.phase).isEqualTo(PasswordResetFlow.Phase.LINK_INVALID)
        coVerify(exactly = 0) { repository.verifyResetToken(any()) }
    }

    @Test
    fun `un jeton que la passerelle dit invalide affiche le lien mort`() = runTest(dispatcher) {
        val vm = viewModel(repository(verification = NetworkResult.Success(ResetTokenVerification(valid = false))))
        advanceUntilIdle()
        assertThat(vm.state.value.flow.phase).isEqualTo(PasswordResetFlow.Phase.LINK_INVALID)
    }

    @Test
    fun `une panne de verification laisse le formulaire, l'envoi dira la verite`() = runTest(dispatcher) {
        val vm = viewModel(repository(verification = refusal(503, null)))
        advanceUntilIdle()
        assertThat(vm.state.value.flow.phase).isEqualTo(PasswordResetFlow.Phase.FORM)
    }

    @Test
    fun `un compte protege reclame le code avant tout envoi`() = runTest(dispatcher) {
        val vm = viewModel(repository(verification = NetworkResult.Success(ResetTokenVerification(valid = true, requires2FA = true))))
        advanceUntilIdle()
        vm.onNewPasswordChange("Str0ng!pass"); vm.onConfirmPasswordChange("Str0ng!pass")
        assertThat(vm.state.value.canSubmit).isFalse()
        vm.onCodeChange("12 34 56")
        assertThat(vm.state.value.code).isEqualTo("123456")
        assertThat(vm.state.value.canSubmit).isTrue()
    }

    @Test
    fun `l'envoi porte le jeton, le mot de passe et le code d'un compte protege`() = runTest(dispatcher) {
        val repository = repository(verification = NetworkResult.Success(ResetTokenVerification(valid = true, requires2FA = true)))
        val vm = viewModel(repository)
        advanceUntilIdle()
        vm.onNewPasswordChange("Str0ng!pass"); vm.onConfirmPasswordChange("Str0ng!pass"); vm.onCodeChange("123456")
        vm.submit()
        advanceUntilIdle()
        coVerify(exactly = 1) { repository.submitPasswordReset("tok", "Str0ng!pass", "123456") }
        assertThat(vm.state.value.flow.phase).isEqualTo(PasswordResetFlow.Phase.SAVED)
    }

    @Test
    fun `un compte ordinaire n'envoie aucun code`() = runTest(dispatcher) {
        val repository = repository()
        val vm = viewModel(repository)
        advanceUntilIdle()
        vm.onNewPasswordChange("Str0ng!pass"); vm.onConfirmPasswordChange("Str0ng!pass"); vm.onCodeChange("123456")
        vm.submit()
        advanceUntilIdle()
        coVerify { repository.submitPasswordReset("tok", "Str0ng!pass", null) }
    }

    @Test
    fun `deux mots de passe differents ne partent pas`() = runTest(dispatcher) {
        val repository = repository()
        val vm = viewModel(repository)
        advanceUntilIdle()
        vm.onNewPasswordChange("abc"); vm.onConfirmPasswordChange("abd")
        assertThat(vm.state.value.showsMismatch).isTrue()
        vm.submit()
        advanceUntilIdle()
        coVerify(exactly = 0) { repository.submitPasswordReset(any(), any(), any()) }
    }

    @Test
    fun `un second appui pendant l'envoi est sans effet`() = runTest(dispatcher) {
        val repository = repository()
        val vm = viewModel(repository)
        advanceUntilIdle()
        vm.onNewPasswordChange("Str0ng!pass"); vm.onConfirmPasswordChange("Str0ng!pass")
        vm.submit(); vm.submit()
        advanceUntilIdle()
        coVerify(exactly = 1) { repository.submitPasswordReset(any(), any(), any()) }
    }

    @Test
    fun `un code faux garde le formulaire, vide le code et dit pourquoi`() = runTest(dispatcher) {
        val vm = viewModel(
            repository(
                verification = NetworkResult.Success(ResetTokenVerification(valid = true, requires2FA = true)),
                submission = refusal(400, "TWO_FACTOR_INVALID"),
            ),
        )
        advanceUntilIdle()
        vm.onNewPasswordChange("Str0ng!pass"); vm.onConfirmPasswordChange("Str0ng!pass"); vm.onCodeChange("123456")
        vm.submit()
        advanceUntilIdle()
        assertThat(vm.state.value.code).isEmpty()
        assertThat(vm.state.value.flow.notice).isEqualTo(PasswordResetFlow.Notice.SecondFactorInvalid)
        assertThat(vm.state.value.isLoading).isFalse()
    }

    @Test
    fun `un mot de passe refuse par la passerelle garde la saisie et affiche la raison`() = runTest(dispatcher) {
        val vm = viewModel(repository(submission = refusal(400, "RESET_PASSWORD_WEAK")))
        advanceUntilIdle()
        vm.onNewPasswordChange("abc"); vm.onConfirmPasswordChange("abc")
        vm.submit()
        advanceUntilIdle()
        assertThat(vm.state.value.flow.notice).isEqualTo(PasswordResetFlow.Notice.WeakPassword)
        assertThat(vm.state.value.newPassword).isEqualTo("abc")
    }

    @Test
    fun `un jeton consomme entre-temps devient un lien mort et la saisie est oubliee`() = runTest(dispatcher) {
        val vm = viewModel(repository(submission = refusal(400, "RESET_TOKEN_INVALID")))
        advanceUntilIdle()
        vm.onNewPasswordChange("Str0ng!pass"); vm.onConfirmPasswordChange("Str0ng!pass")
        vm.submit()
        advanceUntilIdle()
        assertThat(vm.state.value.flow.phase).isEqualTo(PasswordResetFlow.Phase.LINK_INVALID)
        assertThat(vm.state.value.newPassword).isEmpty()
        assertThat(vm.state.value.confirmPassword).isEmpty()
    }

    @Test
    fun `le mot de passe enregistre n'est plus gardé en memoire`() = runTest(dispatcher) {
        val vm = viewModel(repository())
        advanceUntilIdle()
        vm.onNewPasswordChange("Str0ng!pass"); vm.onConfirmPasswordChange("Str0ng!pass")
        vm.submit()
        advanceUntilIdle()
        assertThat(vm.state.value.newPassword).isEmpty()
        assertThat(vm.state.value.confirmPassword).isEmpty()
    }

    @Test
    fun `un jeton ne sert pas deux fois, meme apres l'enregistrement`() = runTest(dispatcher) {
        val repository = repository()
        val vm = viewModel(repository)
        advanceUntilIdle()
        vm.onNewPasswordChange("Str0ng!pass"); vm.onConfirmPasswordChange("Str0ng!pass")
        vm.submit()
        advanceUntilIdle()
        vm.onNewPasswordChange("Other!pass1"); vm.onConfirmPasswordChange("Other!pass1")
        vm.submit()
        advanceUntilIdle()
        coVerify(exactly = 1) { repository.submitPasswordReset(any(), any(), any()) }
    }
}
