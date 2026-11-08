package me.meeshy.app.profile

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.relation.BringAvailability
import me.meeshy.sdk.model.relation.BringSent
import me.meeshy.sdk.relation.BringGateway
import me.meeshy.sdk.relation.BringSendOutcome

/** Ce que la ligne du Bring dit après un refus, sans jamais dire « bloqué ». */
enum class BringNotice { QUOTA, OFFLINE, FAILED }

/**
 * L'état de la ligne du Bring d'une fiche. [availability] nul ou `available: false` ⇒ la ligne n'existe pas ; [ringing]
 * non nul ⇒ « Ça sonne chez X · Annuler ».
 */
@Immutable
data class ProfileBringState(
    val userId: String? = null,
    val availability: BringAvailability? = null,
    val ringing: BringSent? = null,
    val isSending: Boolean = false,
    val notice: BringNotice? = null,
) {
    val isOffered: Boolean get() = availability?.available == true
}

/**
 * Le Bring sur la fiche d'un ami (#16617) — iso `ProfileBringViewModel.swift` : « Bring » expliqué, « Restants
 * aujourd'hui », ABSENT quand la passerelle ne l'ouvre pas — ni bouton grisé, ni raison. Le compteur se recompte depuis la
 * réponse de l'envoi, sans relire ; « Ça sonne » suit [BringGateway.outgoing] jusqu'à l'arrêt ou l'échéance.
 */
@HiltViewModel
class ProfileBringViewModel @Inject constructor(
    private val gateway: BringGateway,
) : ViewModel() {

    private val local = MutableStateFlow(ProfileBringState())

    val state: StateFlow<ProfileBringState> = combine(local, gateway.outgoing) { current, outgoing ->
        current.copy(ringing = current.userId?.let(outgoing::get))
    }.stateIn(viewModelScope, SharingStarted.Eagerly, ProfileBringState())

    fun load(userId: String) {
        if (userId.isBlank() || local.value.userId == userId) return
        local.value = ProfileBringState(userId = userId)
        viewModelScope.launch {
            val served = gateway.availability(userId) ?: return@launch
            local.update { if (it.userId == userId) it.copy(availability = served) else it }
        }
    }

    /** Après la confirmation : envoyer, puis dire ce que la passerelle a répondu. */
    fun send() {
        val current = local.value
        val userId = current.userId ?: return
        val availability = current.availability ?: return
        if (current.isSending || !availability.canSend) return
        local.update { it.copy(isSending = true, notice = null) }
        viewModelScope.launch {
            val outcome = gateway.send(userId)
            local.update { it.afterSend(outcome, availability) }
        }
    }

    /** « Annuler » : le Bring cesse chez l'autre, optimiste. */
    fun cancel() {
        local.value.userId?.let(gateway::cancel)
    }

    fun consumeNotice() {
        local.update { it.copy(notice = null) }
    }

    private fun ProfileBringState.afterSend(outcome: BringSendOutcome, before: BringAvailability): ProfileBringState =
        when (outcome) {
            is BringSendOutcome.Sent -> copy(
                isSending = false,
                availability = before.counted(outcome.sent.perDay, outcome.sent.remainingToday),
            )
            BringSendOutcome.Gone -> copy(isSending = false, availability = before.withdrawn)
            BringSendOutcome.Quota -> copy(
                isSending = false,
                availability = before.counted(before.perDay, 0),
                notice = BringNotice.QUOTA,
            )
            BringSendOutcome.Offline -> copy(isSending = false, notice = BringNotice.OFFLINE)
            BringSendOutcome.Failed -> copy(isSending = false, notice = BringNotice.FAILED)
        }
}
