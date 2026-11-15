package me.meeshy.app.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import javax.inject.Inject
import kotlin.math.roundToInt
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.voice.VoiceSample
import me.meeshy.sdk.model.voice.VoiceWizardState
import me.meeshy.sdk.model.voice.VoiceWizardStep
import me.meeshy.sdk.model.voice.VoiceWizardRules
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.voice.VoiceProfileRepository

sealed interface VoiceProfileWizardUiEvent {
    data class ConsentChanged(val given: Boolean) : VoiceProfileWizardUiEvent
    data object ContinueFromConsent : VoiceProfileWizardUiEvent
    data class BirthDateChanged(val day: LocalDate) : VoiceProfileWizardUiEvent
    data object VerifyAge : VoiceProfileWizardUiEvent
    data class SamplesReady(val samples: List<VoiceSample>) : VoiceProfileWizardUiEvent
    data object DismissError : VoiceProfileWizardUiEvent
}

private const val SETTLE_MILLIS = 1_000L
private const val MILLIS_PER_SECOND = 1_000.0

/**
 * L'assistant de création du profil vocal (iOS `VoiceProfileWizardViewModel`) : le consentement part AVEC la date de
 * naissance (`YYYY-MM-DD`), puis chaque échantillon est envoyé, n/N, avant la relecture du profil. Toute règle est
 * dans [VoiceWizardState] ; ce modèle n'y branche que le réseau.
 */
@HiltViewModel
class VoiceProfileWizardViewModel @Inject constructor(
    private val repository: VoiceProfileRepository,
    private val sampleFiles: VoiceSampleFiles,
    sessionRepository: SessionRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(VoiceWizardState(birthDate = VoiceWizardRules.defaultBirthDate(LocalDate.now())))
    val state: StateFlow<VoiceWizardState> = _state.asStateFlow()

    private val _spokenLanguage = MutableStateFlow<String?>(null)

    /** La langue de l'utilisateur : le point de départ de la langue PARLÉE, choisissable avant le premier échantillon. */
    val spokenLanguage: StateFlow<String?> = _spokenLanguage.asStateFlow()

    init {
        viewModelScope.launch {
            sessionRepository.currentUser.collect { user -> _spokenLanguage.value = user?.systemLanguage }
        }
        viewModelScope.launch { skipConsentWhenAlreadyGiven() }
    }

    fun onEvent(event: VoiceProfileWizardUiEvent) {
        when (event) {
            is VoiceProfileWizardUiEvent.ConsentChanged -> _state.update { it.copy(consentGiven = event.given) }
            VoiceProfileWizardUiEvent.ContinueFromConsent -> _state.update { it.continueFromConsent() }
            is VoiceProfileWizardUiEvent.BirthDateChanged -> _state.update { it.copy(birthDate = event.day) }
            VoiceProfileWizardUiEvent.VerifyAge -> verifyAge()
            is VoiceProfileWizardUiEvent.SamplesReady -> upload(event.samples)
            VoiceProfileWizardUiEvent.DismissError -> _state.update { it.errorDismissed() }
        }
    }

    private suspend fun skipConsentWhenAlreadyGiven() {
        val status = (repository.consentStatus() as? NetworkResult.Success)?.data ?: return
        if (status.hasConsent) _state.update { if (it.step == VoiceWizardStep.CONSENT) it.copy(step = VoiceWizardStep.RECORDING) else it }
    }

    private fun verifyAge() {
        val current = _state.value
        if (current.isLoading) return
        when (val submission = current.submitAge(LocalDate.now())) {
            is VoiceWizardState.AgeSubmission.Refused -> _state.value = submission.state
            is VoiceWizardState.AgeSubmission.Accepted -> {
                _state.value = submission.state
                viewModelScope.launch { grantConsent(submission.wireBirthDate) }
            }
        }
    }

    private suspend fun grantConsent(wireBirthDate: String) {
        val granted = try {
            repository.grantConsent(voiceCloningConsent = false, birthDate = wireBirthDate) is NetworkResult.Success
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            false
        }
        _state.update { if (granted) it.consentGranted() else it.consentFailed() }
    }

    private fun upload(samples: List<VoiceSample>) {
        if (_state.value.step != VoiceWizardStep.RECORDING || samples.isEmpty()) return
        _state.update { it.uploadStarted(samples.size) }
        viewModelScope.launch {
            val uploaded = samples.all { sample -> uploadOne(sample).also { ok -> if (ok) _state.update { it.sampleUploaded() } } }
            if (!uploaded) {
                _state.update { it.uploadFailed() }
                return@launch
            }
            delay(SETTLE_MILLIS)
            val profile = (repository.profile() as? NetworkResult.Success)?.data
            _state.update { it.uploadCompleted(profile) }
        }
    }

    private suspend fun uploadOne(sample: VoiceSample): Boolean {
        val file = sampleFiles.write(sample.bytes)
        return try {
            val durationMs = (sample.durationSeconds * MILLIS_PER_SECOND).roundToInt().coerceAtLeast(1_000)
            repository.uploadSample(file, durationMs) is NetworkResult.Success
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            false
        } finally {
            sampleFiles.discard(file)
        }
    }
}
