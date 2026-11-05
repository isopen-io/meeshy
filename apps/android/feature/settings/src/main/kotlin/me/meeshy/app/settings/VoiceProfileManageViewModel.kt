package me.meeshy.app.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.VoiceProfile
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.voice.VoiceProfileRepository

/** Où en est la lecture du profil vocal : un profil, aucun (l'assistant se propose), ou une lecture en échec. */
sealed interface VoiceProfileManagePhase {
    data object Loading : VoiceProfileManagePhase
    data object Empty : VoiceProfileManagePhase
    data object Failed : VoiceProfileManagePhase
    data class Loaded(val profile: VoiceProfile) : VoiceProfileManagePhase
}

/** L'action refusée par la passerelle, dite à l'écran (iOS `voice.profile.error.*`). */
enum class VoiceProfileManageError { CLONING, DELETE }

data class VoiceProfileManageUiState(
    val phase: VoiceProfileManagePhase = VoiceProfileManagePhase.Loading,
    val isCloningEnabled: Boolean = false,
    val isDeleting: Boolean = false,
    val error: VoiceProfileManageError? = null,
)

/**
 * La gestion du profil vocal existant (iOS `VoiceProfileManageViewModel`) : son état, la bascule du clonage (optimiste,
 * seule la dernière demande décide — la réponse d'une bascule dépassée ne ramène plus le réglage) et la suppression RGPD.
 * Une relecture sur un profil déjà affiché ne repasse jamais par l'état de chargement.
 */
@HiltViewModel
class VoiceProfileManageViewModel @Inject constructor(
    private val repository: VoiceProfileRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(VoiceProfileManageUiState())
    val state: StateFlow<VoiceProfileManageUiState> = _state.asStateFlow()

    private var latestCloningRequest = 0

    init {
        reload()
    }

    fun reload() {
        if (_state.value.phase == VoiceProfileManagePhase.Failed) _state.update { it.copy(phase = VoiceProfileManagePhase.Loading) }
        viewModelScope.launch {
            val consent = async { repository.consentStatus() }
            val profile = repository.profile()
            val cloning = (consent.await() as? NetworkResult.Success)?.data?.voiceCloningEnabled ?: false
            _state.update { current ->
                when (profile) {
                    is NetworkResult.Success -> current.copy(
                        phase = profile.data?.let { VoiceProfileManagePhase.Loaded(it) } ?: VoiceProfileManagePhase.Empty,
                        isCloningEnabled = cloning,
                    )
                    is NetworkResult.Failure ->
                        if (current.phase is VoiceProfileManagePhase.Loaded) current else current.copy(phase = VoiceProfileManagePhase.Failed)
                }
            }
        }
    }

    fun setCloningEnabled(enabled: Boolean) {
        val previous = _state.value.isCloningEnabled
        latestCloningRequest += 1
        val request = latestCloningRequest
        _state.update { it.copy(isCloningEnabled = enabled, error = null) }
        viewModelScope.launch {
            val result = repository.toggleVoiceCloning(enabled)
            if (request != latestCloningRequest || result is NetworkResult.Success) return@launch
            _state.update { it.copy(isCloningEnabled = previous, error = VoiceProfileManageError.CLONING) }
        }
    }

    fun deleteProfile() {
        if (_state.value.isDeleting) return
        _state.update { it.copy(isDeleting = true, error = null) }
        viewModelScope.launch {
            val result = repository.deleteProfile()
            _state.update {
                when (result) {
                    is NetworkResult.Success -> it.copy(phase = VoiceProfileManagePhase.Empty, isCloningEnabled = false, isDeleting = false)
                    is NetworkResult.Failure -> it.copy(isDeleting = false, error = VoiceProfileManageError.DELETE)
                }
            }
        }
    }

    fun dismissError() {
        _state.update { it.copy(error = null) }
    }
}
