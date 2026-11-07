package me.meeshy.app.contacts.circles

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
import me.meeshy.sdk.relation.BringGateway

@Immutable
data class CircleBringBlockState(
    val userId: String? = null,
    val blocked: Boolean = false,
    val isSaving: Boolean = false,
    /** Vrai après un refus, le temps de le dire : l'interrupteur est déjà revenu à l'état d'avant. */
    val failed: Boolean = false,
)

/**
 * « Bloquer ses Bring », sur la fiche d'un lien (#16617) — iso `CircleBringBlockViewModel.swift`. Le Bring est ouvert par
 * défaut dès Ami : son réglage par personne est un BLOCAGE des Bring que JE reçois de cette personne, qui n'en est pas
 * prévenue (elle lit seulement « Bring indisponible »). Optimiste : basculé au geste, rendu à l'état d'avant sur un
 * refus, qui se dit.
 */
@HiltViewModel
class CircleBringBlockViewModel @Inject constructor(
    private val gateway: BringGateway,
) : ViewModel() {

    private val _state = MutableStateFlow(CircleBringBlockState())
    val state: StateFlow<CircleBringBlockState> = _state.asStateFlow()

    fun load(userId: String) {
        if (userId.isBlank() || _state.value.userId == userId) return
        _state.value = CircleBringBlockState(userId = userId)
        viewModelScope.launch {
            val served = gateway.personSettings(userId) ?: return@launch
            _state.update { if (it.userId == userId && !it.isSaving) it.copy(blocked = served.bringBlocked) else it }
        }
    }

    /** Instantané -> local -> réseau -> retour arrière. */
    fun setBlocked(next: Boolean) {
        val before = _state.value
        val userId = before.userId ?: return
        if (before.isSaving || next == before.blocked) return
        _state.value = before.copy(blocked = next, isSaving = true, failed = false)
        viewModelScope.launch {
            val served = gateway.setBringBlocked(userId, next)
            _state.update {
                if (served == null) {
                    it.copy(blocked = before.blocked, isSaving = false, failed = true)
                } else {
                    it.copy(blocked = served.bringBlocked, isSaving = false)
                }
            }
        }
    }

    fun consumeFailure() {
        _state.update { it.copy(failed = false) }
    }
}
