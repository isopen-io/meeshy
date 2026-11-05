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
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.VoiceConsentStatus
import me.meeshy.sdk.model.VoiceProfile
import me.meeshy.sdk.model.VoiceProfileDeleteResponse
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.voice.VoiceProfileRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class VoiceProfileManageViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)

    @After fun tearDown() = Dispatchers.resetMain()

    private val profile = VoiceProfile(id = "p1", sampleCount = 3, totalDurationMs = 42_000)
    private val failure = NetworkResult.Failure(ApiError(message = "boom"))

    private fun repository(
        profile: NetworkResult<VoiceProfile?> = NetworkResult.Success(this.profile),
        consent: NetworkResult<VoiceConsentStatus> = NetworkResult.Success(VoiceConsentStatus(voiceRecordingConsentAt = "t", voiceCloningEnabledAt = "t")),
    ): VoiceProfileRepository {
        val repository = mockk<VoiceProfileRepository>()
        coEvery { repository.profile() } returns profile
        coEvery { repository.consentStatus() } returns consent
        coEvery { repository.toggleVoiceCloning(any()) } returns NetworkResult.Success(Unit)
        coEvery { repository.deleteProfile() } returns NetworkResult.Success(VoiceProfileDeleteResponse(deleted = true))
        return repository
    }

    @Test
    fun `un profil existant se gere avec l'etat de son clonage`() = runTest(dispatcher) {
        val viewModel = VoiceProfileManageViewModel(repository())
        advanceUntilIdle()

        val state = viewModel.state.value
        assertThat(state.phase).isEqualTo(VoiceProfileManagePhase.Loaded(profile))
        assertThat(state.isCloningEnabled).isTrue()
    }

    @Test
    fun `sans profil l'ecran est vide et propose la creation`() = runTest(dispatcher) {
        val viewModel = VoiceProfileManageViewModel(repository(profile = NetworkResult.Success(null)))
        advanceUntilIdle()

        assertThat(viewModel.state.value.phase).isEqualTo(VoiceProfileManagePhase.Empty)
    }

    @Test
    fun `un echec de lecture du profil se dit et se rejoue`() = runTest(dispatcher) {
        val repository = repository(profile = failure)
        val viewModel = VoiceProfileManageViewModel(repository)
        advanceUntilIdle()
        assertThat(viewModel.state.value.phase).isEqualTo(VoiceProfileManagePhase.Failed)

        coEvery { repository.profile() } returns NetworkResult.Success(profile)
        viewModel.reload()
        advanceUntilIdle()

        assertThat(viewModel.state.value.phase).isEqualTo(VoiceProfileManagePhase.Loaded(profile))
    }

    @Test
    fun `un statut de consentement illisible laisse le clonage eteint sans masquer le profil`() = runTest(dispatcher) {
        val viewModel = VoiceProfileManageViewModel(repository(consent = failure))
        advanceUntilIdle()

        assertThat(viewModel.state.value.phase).isEqualTo(VoiceProfileManagePhase.Loaded(profile))
        assertThat(viewModel.state.value.isCloningEnabled).isFalse()
    }

    @Test
    fun `basculer le clonage se peint a l'instant puis part au serveur`() = runTest(dispatcher) {
        val repository = repository()
        val viewModel = VoiceProfileManageViewModel(repository)
        advanceUntilIdle()

        viewModel.setCloningEnabled(false)
        assertThat(viewModel.state.value.isCloningEnabled).isFalse()
        advanceUntilIdle()

        coVerify(exactly = 1) { repository.toggleVoiceCloning(false) }
        assertThat(viewModel.state.value.isCloningEnabled).isFalse()
        assertThat(viewModel.state.value.error).isNull()
    }

    @Test
    fun `un clonage refuse revient a sa valeur et le dit`() = runTest(dispatcher) {
        val repository = repository()
        coEvery { repository.toggleVoiceCloning(false) } returns failure
        val viewModel = VoiceProfileManageViewModel(repository)
        advanceUntilIdle()

        viewModel.setCloningEnabled(false)
        advanceUntilIdle()

        assertThat(viewModel.state.value.isCloningEnabled).isTrue()
        assertThat(viewModel.state.value.error).isEqualTo(VoiceProfileManageError.CLONING)
    }

    @Test
    fun `la reponse d'une bascule depassee ne decide plus rien`() = runTest(dispatcher) {
        val repository = repository()
        val first = CompletableDeferred<NetworkResult<Unit>>()
        coEvery { repository.toggleVoiceCloning(false) } coAnswers { first.await() }
        coEvery { repository.toggleVoiceCloning(true) } returns NetworkResult.Success(Unit)
        val viewModel = VoiceProfileManageViewModel(repository)
        advanceUntilIdle()

        viewModel.setCloningEnabled(false)
        advanceUntilIdle()
        viewModel.setCloningEnabled(true)
        advanceUntilIdle()
        first.complete(failure)
        advanceUntilIdle()

        assertThat(viewModel.state.value.isCloningEnabled).isTrue()
        assertThat(viewModel.state.value.error).isNull()
    }

    @Test
    fun `supprimer le profil vide l'ecran`() = runTest(dispatcher) {
        val repository = repository()
        val viewModel = VoiceProfileManageViewModel(repository)
        advanceUntilIdle()

        viewModel.deleteProfile()
        advanceUntilIdle()

        coVerify(exactly = 1) { repository.deleteProfile() }
        assertThat(viewModel.state.value.phase).isEqualTo(VoiceProfileManagePhase.Empty)
        assertThat(viewModel.state.value.isCloningEnabled).isFalse()
    }

    @Test
    fun `une suppression refusee garde le profil et le dit`() = runTest(dispatcher) {
        val repository = repository()
        coEvery { repository.deleteProfile() } returns NetworkResult.Failure(ApiError(message = "boom"))
        val viewModel = VoiceProfileManageViewModel(repository)
        advanceUntilIdle()

        viewModel.deleteProfile()
        advanceUntilIdle()

        assertThat(viewModel.state.value.phase).isEqualTo(VoiceProfileManagePhase.Loaded(profile))
        assertThat(viewModel.state.value.error).isEqualTo(VoiceProfileManageError.DELETE)

        viewModel.dismissError()
        assertThat(viewModel.state.value.error).isNull()
    }
}
