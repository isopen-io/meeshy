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
import me.meeshy.sdk.model.relation.RelationPersonSettings
import me.meeshy.sdk.model.relation.RelationPersonSwitch
import me.meeshy.sdk.relation.BringGateway

@Immutable
data class CircleReceptionBlockState(
    val userId: String? = null,
    val personSwitch: RelationPersonSwitch? = null,
    val isOn: Boolean = false,
    val isSaving: Boolean = false,
    /** Vrai après un refus, le temps de le dire : l'interrupteur est déjà revenu à l'état d'avant. */
    val failed: Boolean = false,
)

/**
 * UN interrupteur posé pour une personne sur la fiche d'un lien, iso `CircleReceptionBlockViewModel.swift` :
 * - une préférence de RÉCEPTION, ouverte par défaut, dont l'interrupteur allumé est un BLOCAGE — « Bloquer ses Bring »
 *   (#16617, dès Ami), « Couper son talkie » (#16675, dès Proche) ;
 * - un PARTAGE de mon activité, refusé par défaut, dont l'interrupteur allumé est un ACCORD — « Ce que j'écoute » (#16836,
 *   dès Proche).
 * L'autre n'en est pas prévenu. Optimiste : basculé au geste, rendu à l'état d'avant sur un refus, qui se dit.
 */
@HiltViewModel
class CircleReceptionBlockViewModel @Inject constructor(
    private val gateway: BringGateway,
) : ViewModel() {

    private val _state = MutableStateFlow(CircleReceptionBlockState())
    val state: StateFlow<CircleReceptionBlockState> = _state.asStateFlow()

    fun load(userId: String, personSwitch: RelationPersonSwitch) {
        val current = _state.value
        if (userId.isBlank() || (current.userId == userId && current.personSwitch == personSwitch)) return
        _state.value = CircleReceptionBlockState(userId = userId, personSwitch = personSwitch)
        viewModelScope.launch {
            val served = gateway.personSettings(userId) ?: return@launch
            _state.update {
                if (it.userId == userId && it.personSwitch == personSwitch && !it.isSaving) {
                    it.copy(isOn = personSwitch.isOn(served))
                } else {
                    it
                }
            }
        }
    }

    /** Instantané -> local -> réseau -> retour arrière. */
    fun setOn(next: Boolean) {
        val before = _state.value
        val userId = before.userId ?: return
        val personSwitch = before.personSwitch ?: return
        if (before.isSaving || next == before.isOn) return
        _state.value = before.copy(isOn = next, isSaving = true, failed = false)
        viewModelScope.launch {
            val served = write(userId, personSwitch, next)
            _state.update {
                if (served == null) {
                    it.copy(isOn = before.isOn, isSaving = false, failed = true)
                } else {
                    it.copy(isOn = personSwitch.isOn(served), isSaving = false)
                }
            }
        }
    }

    private suspend fun write(userId: String, personSwitch: RelationPersonSwitch, on: Boolean): RelationPersonSettings? =
        when (personSwitch) {
            is RelationPersonSwitch.Reception -> gateway.setReceptionBlocked(userId, personSwitch.setting, on)
            is RelationPersonSwitch.Share -> gateway.setShareGranted(userId, personSwitch.grant, on)
        }

    fun consumeFailure() {
        _state.update { it.copy(failed = false) }
    }
}
