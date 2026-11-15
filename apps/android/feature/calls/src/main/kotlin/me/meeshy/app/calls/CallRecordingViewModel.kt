package me.meeshy.app.calls

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import me.meeshy.sdk.call.CallRecordingController
import me.meeshy.sdk.model.call.CallRecordingKind
import me.meeshy.sdk.model.call.CallRecordingPhase
import javax.inject.Inject

@Immutable
data class CallRecordingUiState(val phase: CallRecordingPhase = CallRecordingPhase.Idle)

sealed interface CallRecordingUiEvent {
    data class Pick(val kind: CallRecordingKind) : CallRecordingUiEvent
}

/** Le panneau « Enregistrer » de la pilule : il choisit ce qu'on enregistre, le contrôleur fait le reste. */
@HiltViewModel
class CallRecordingViewModel @Inject constructor(
    private val recording: CallRecordingController,
) : ViewModel() {
    val state: StateFlow<CallRecordingUiState> = recording.state
        .map { CallRecordingUiState(it.phase) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), CallRecordingUiState())

    /** R1.5 — un bandeau d'enregistrement est dans la pile (carte, capsule, avis) : ma vignette lui fait place. */
    val isBannerShown: StateFlow<Boolean> = recording.state
        .map { it.isBannerShown }
        .distinctUntilChanged()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    fun onEvent(event: CallRecordingUiEvent) {
        when (event) {
            is CallRecordingUiEvent.Pick -> recording.request(event.kind)
        }
    }
}
