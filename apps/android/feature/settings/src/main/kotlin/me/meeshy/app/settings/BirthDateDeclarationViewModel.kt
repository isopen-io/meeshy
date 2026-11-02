package me.meeshy.app.settings

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.BirthDateDeclarationError
import me.meeshy.sdk.model.BirthDateRules
import me.meeshy.sdk.user.BirthDateOutcome
import me.meeshy.sdk.user.BirthDateRepository

@Immutable
data class BirthDateDeclarationUiState(
    /** Minuit UTC du jour retenu par le selecteur natif ; `null` tant qu'aucun jour n'est choisi. */
    val pickedUtcMillis: Long? = null,
    val isPickerOpen: Boolean = false,
    val isSubmitting: Boolean = false,
    val error: BirthDateDeclarationError? = null,
    val isDeclared: Boolean = false,
    /** Un mineur lit sans ecrire (`viewerWriteRestrictionGlobal`). */
    val isWriteRestricted: Boolean = false,
) {
    val canSubmit: Boolean get() = pickedUtcMillis != null && !isSubmitting && !isDeclared

    /** `AAAA-MM-JJ` du jour choisi, tel qu'il part sur le fil. */
    val pickedWireDay: String? get() = pickedUtcMillis?.let(BirthDateRules::wireDayFromPicker)
}

sealed interface BirthDateDeclarationUiEvent {
    data object OpenPicker : BirthDateDeclarationUiEvent
    data object DismissPicker : BirthDateDeclarationUiEvent
    data class PickDay(val utcMillis: Long) : BirthDateDeclarationUiEvent
    data object Submit : BirthDateDeclarationUiEvent
}

/** Declare la date de naissance (une seule fois) : selecteur natif, refus classes, jamais de saisie libre. */
@HiltViewModel
class BirthDateDeclarationViewModel @Inject constructor(
    private val repository: BirthDateRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(BirthDateDeclarationUiState())
    val state: StateFlow<BirthDateDeclarationUiState> = _state.asStateFlow()

    fun onEvent(event: BirthDateDeclarationUiEvent) {
        when (event) {
            BirthDateDeclarationUiEvent.OpenPicker -> _state.update { it.copy(isPickerOpen = true, error = null) }
            BirthDateDeclarationUiEvent.DismissPicker -> _state.update { it.copy(isPickerOpen = false) }
            is BirthDateDeclarationUiEvent.PickDay ->
                _state.update { it.copy(pickedUtcMillis = event.utcMillis, isPickerOpen = false, error = null) }
            BirthDateDeclarationUiEvent.Submit -> submit()
        }
    }

    private fun submit() {
        val snapshot = _state.value
        val picked = snapshot.pickedUtcMillis
        if (!snapshot.canSubmit || picked == null) return
        _state.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            val outcome = repository.setBirthDateFromPicker(picked)
            _state.update { current ->
                when (outcome) {
                    is BirthDateOutcome.Declared -> current.copy(
                        isSubmitting = false,
                        isDeclared = true,
                        isWriteRestricted = BirthDateRules.restrictsWriting(outcome.declaration),
                    )
                    // « Deja posee » : l'etape est faite, l'ecran le dit sans retenir l'utilisateur.
                    is BirthDateOutcome.Refused -> current.copy(isSubmitting = false, error = outcome.reason)
                }
            }
        }
    }
}
