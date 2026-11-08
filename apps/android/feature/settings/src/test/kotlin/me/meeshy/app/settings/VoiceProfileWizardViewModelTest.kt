package me.meeshy.app.settings

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import java.io.File
import java.time.LocalDate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.VoiceConsentResponse
import me.meeshy.sdk.model.VoiceConsentStatus
import me.meeshy.sdk.model.VoiceProfile
import me.meeshy.sdk.model.VoiceSampleUploadResponse
import me.meeshy.sdk.model.voice.VoiceSample
import me.meeshy.sdk.model.voice.VoiceSampleSet
import me.meeshy.sdk.model.voice.VoiceWizardError
import me.meeshy.sdk.model.voice.VoiceWizardStep
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.voice.VoiceProfileRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class VoiceProfileWizardViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val file = File("sample.m4a")

    private fun repository(consent: VoiceConsentStatus = VoiceConsentStatus()): VoiceProfileRepository {
        val repository = mockk<VoiceProfileRepository>()
        coEvery { repository.consentStatus() } returns NetworkResult.Success(consent)
        coEvery { repository.grantConsent(any(), any()) } returns NetworkResult.Success(VoiceConsentResponse())
        coEvery { repository.uploadSample(any(), any(), any()) } returns NetworkResult.Success(VoiceSampleUploadResponse())
        coEvery { repository.profile() } returns NetworkResult.Success(VoiceProfile(id = "p", sampleCount = 3))
        return repository
    }

    private fun files(): VoiceSampleFiles {
        val files = mockk<VoiceSampleFiles>()
        coEvery { files.write(any()) } returns file
        coEvery { files.discard(any()) } returns Unit
        return files
    }

    private fun session(language: String? = null): SessionRepository {
        val session = mockk<SessionRepository>()
        every { session.currentUser } returns MutableStateFlow(language?.let { MeeshyUser(id = "u", username = "u", systemLanguage = it) })
        return session
    }

    private fun samples(count: Int): List<VoiceSample> {
        var set = VoiceSampleSet.empty
        repeat(count) { (set.add(byteArrayOf(1, 2), 10.4) as VoiceSampleSet.Added.Accepted).also { set = it.set } }
        return set.samples
    }

    private fun sut(repository: VoiceProfileRepository = repository(), language: String? = null) =
        VoiceProfileWizardViewModel(repository, files(), session(language))

    @Test
    fun `an account that already consented starts at the recording step`() = runTest(dispatcher) {
        val sut = sut(repository(VoiceConsentStatus(voiceRecordingConsentAt = "2026-01-01")))
        advanceUntilIdle()
        assertThat(sut.state.value.step).isEqualTo(VoiceWizardStep.RECORDING)
    }

    @Test
    fun `continue does nothing until the consent is ticked`() = runTest(dispatcher) {
        val sut = sut()
        advanceUntilIdle()
        sut.onEvent(VoiceProfileWizardUiEvent.ContinueFromConsent)
        assertThat(sut.state.value.step).isEqualTo(VoiceWizardStep.CONSENT)
        sut.onEvent(VoiceProfileWizardUiEvent.ConsentChanged(true))
        sut.onEvent(VoiceProfileWizardUiEvent.ContinueFromConsent)
        assertThat(sut.state.value.step).isEqualTo(VoiceWizardStep.AGE_VERIFICATION)
    }

    @Test
    fun `a minor is refused locally and nothing is sent`() = runTest(dispatcher) {
        val repository = repository()
        val sut = sut(repository)
        advanceUntilIdle()
        sut.onEvent(VoiceProfileWizardUiEvent.BirthDateChanged(LocalDate.now().minusYears(10)))
        sut.onEvent(VoiceProfileWizardUiEvent.VerifyAge)
        advanceUntilIdle()
        assertThat(sut.state.value.error).isEqualTo(VoiceWizardError.UNDER_AGE)
        coVerify(exactly = 0) { repository.grantConsent(any(), any()) }
    }

    @Test
    fun `an adult sends the strict wire day with the consent and moves to recording`() = runTest(dispatcher) {
        val repository = repository()
        val sut = sut(repository)
        advanceUntilIdle()
        sut.onEvent(VoiceProfileWizardUiEvent.BirthDateChanged(LocalDate.of(1990, 3, 7)))
        sut.onEvent(VoiceProfileWizardUiEvent.VerifyAge)
        advanceUntilIdle()
        coVerify(exactly = 1) { repository.grantConsent(false, "1990-03-07") }
        assertThat(sut.state.value.step).isEqualTo(VoiceWizardStep.RECORDING)
        assertThat(sut.state.value.isLoading).isFalse()
    }

    @Test
    fun `a consent that fails raises the consent alert and stays on the age step`() = runTest(dispatcher) {
        val repository = repository()
        coEvery { repository.grantConsent(any(), any()) } returns NetworkResult.Failure(ApiError(message = "boom", httpStatus = 500))
        val sut = sut(repository)
        advanceUntilIdle()
        sut.onEvent(VoiceProfileWizardUiEvent.BirthDateChanged(LocalDate.of(1990, 3, 7)))
        sut.onEvent(VoiceProfileWizardUiEvent.VerifyAge)
        advanceUntilIdle()
        assertThat(sut.state.value.error).isEqualTo(VoiceWizardError.CONSENT)
        assertThat(sut.state.value.step).isEqualTo(VoiceWizardStep.CONSENT)
    }

    @Test
    fun `the samples are uploaded one by one with n over N then the profile is read back`() = runTest(dispatcher) {
        val repository = repository(VoiceConsentStatus(voiceRecordingConsentAt = "x"))
        coEvery { repository.uploadSample(any(), any(), any()) } coAnswers {
            delay(10)
            NetworkResult.Success(VoiceSampleUploadResponse())
        }
        val sut = sut(repository)
        advanceUntilIdle()
        sut.state.test {
            awaitItem()
            sut.onEvent(VoiceProfileWizardUiEvent.SamplesReady(samples(3)))
            val counts = mutableListOf<Pair<Int, Int>>()
            var last = awaitItem()
            counts += last.uploadedCount to last.totalToUpload
            while (last.step != VoiceWizardStep.COMPLETE) {
                last = awaitItem()
                counts += last.uploadedCount to last.totalToUpload
            }
            assertThat(counts).containsAtLeast(0 to 3, 1 to 3, 2 to 3, 3 to 3)
            assertThat(last.profile?.id).isEqualTo("p")
            cancelAndIgnoreRemainingEvents()
        }
        coVerify(exactly = 3) { repository.uploadSample(file, 10_400, any()) }
    }

    @Test
    fun `an upload that fails returns to recording with the upload alert and skips the rest`() = runTest(dispatcher) {
        val repository = repository(VoiceConsentStatus(voiceRecordingConsentAt = "x"))
        coEvery { repository.uploadSample(any(), any(), any()) } returns
            NetworkResult.Success(VoiceSampleUploadResponse()) andThen
            NetworkResult.Failure(ApiError(message = "boom", httpStatus = 500))
        val sut = sut(repository)
        advanceUntilIdle()
        sut.onEvent(VoiceProfileWizardUiEvent.SamplesReady(samples(3)))
        advanceUntilIdle()
        assertThat(sut.state.value.step).isEqualTo(VoiceWizardStep.RECORDING)
        assertThat(sut.state.value.error).isEqualTo(VoiceWizardError.UPLOAD)
        coVerify(exactly = 2) { repository.uploadSample(any(), any(), any()) }
        sut.onEvent(VoiceProfileWizardUiEvent.DismissError)
        assertThat(sut.state.value.error).isNull()
    }

    @Test
    fun `the spoken language starts from the account language`() = runTest(dispatcher) {
        val sut = sut(language = "es")
        advanceUntilIdle()
        assertThat(sut.spokenLanguage.value).isEqualTo("es")
    }
}
