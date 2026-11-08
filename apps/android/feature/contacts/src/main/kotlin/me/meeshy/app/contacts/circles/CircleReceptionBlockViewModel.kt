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
import me.meeshy.sdk.model.relation.RelationReceptionSetting
import me.meeshy.sdk.relation.BringGateway

@Immutable
data class CircleReceptionBlockState(
    val userId: String? = null,
    val setting: RelationReceptionSetting? = null,
    val blocked: Boolean = false,
    val isSaving: Boolean = false,
    /** Vrai après un refus, le temps de le dire : l'interrupteur est déjà revenu à l'état d'avant. */
    val failed: Boolean = false,
)

/**
 * Une préférence de RÉCEPTION posée pour une personne, sur la fiche d'un lien — « Bloquer ses Bring » (#16617, dès Ami) et
 * « Couper son talkie » (#16675, dès Proche) —, iso `CircleReceptionBlockViewModel.swift`. Ouverte par défaut : son
 * réglage par personne est un BLOCAGE de ce que JE reçois de cette personne, qui n'en est pas prévenue. Optimiste :
 * basculé au geste, rendu à l'état d'avant sur un refus, qui se dit.
 */
@HiltViewModel
class CircleReceptionBlockViewModel @Inject constructor(
    private val gateway: BringGateway,
) : ViewModel() {

    private val _state = MutableStateFlow(CircleReceptionBlockState())
    val state: StateFlow<CircleReceptionBlockState> = _state.asStateFlow()

    fun load(userId: String, setting: RelationReceptionSetting) {
        val current = _state.value
        if (userId.isBlank() || (current.userId == userId && current.setting == setting)) return
        _state.value = CircleReceptionBlockState(userId = userId, setting = setting)
        viewModelScope.launch {
            val served = gateway.personSettings(userId) ?: return@launch
            _state.update {
                if (it.userId == userId && it.setting == setting && !it.isSaving) it.copy(blocked = served.isBlocked(setting)) else it
            }
        }
    }

    /** Instantané -> local -> réseau -> retour arrière. */
    fun setBlocked(next: Boolean) {
        val before = _state.value
        val userId = before.userId ?: return
        val setting = before.setting ?: return
        if (before.isSaving || next == before.blocked) return
        _state.value = before.copy(blocked = next, isSaving = true, failed = false)
        viewModelScope.launch {
            val served = gateway.setReceptionBlocked(userId, setting, next)
            _state.update {
                if (served == null) {
                    it.copy(blocked = before.blocked, isSaving = false, failed = true)
                } else {
                    it.copy(blocked = served.isBlocked(setting), isSaving = false)
                }
            }
        }
    }

    fun consumeFailure() {
        _state.update { it.copy(failed = false) }
    }
}
