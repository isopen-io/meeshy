package me.meeshy.sdk.relation

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.relation.BringAvailability
import me.meeshy.sdk.model.relation.BringSent

/** Ce qu'un écran du Bring dit après un refus, sans jamais dire « bloqué ». */
enum class BringNotice { QUOTA, OFFLINE, FAILED }

/** Ce que montre le bouton du Bring de l'en-tête d'un direct (#17442) : il n'existe que si la passerelle l'ouvre. */
enum class BringLook { HIDDEN, SEND, SENDING, EXHAUSTED, RINGING }

/**
 * L'état d'envoi d'un Bring vers une personne. [availability] nul ou `available: false` ⇒ rien n'existe ; [ringing] non
 * nul ⇒ « Ça sonne chez X · Annuler ».
 */
data class BringSendState(
    val userId: String? = null,
    val availability: BringAvailability? = null,
    val ringing: BringSent? = null,
    val isSending: Boolean = false,
    val notice: BringNotice? = null,
) {
    val isOffered: Boolean get() = availability?.available == true

    val look: BringLook
        get() = when {
            !isOffered -> BringLook.HIDDEN
            ringing != null -> BringLook.RINGING
            availability?.isExhausted == true -> BringLook.EXHAUSTED
            isSending -> BringLook.SENDING
            else -> BringLook.SEND
        }
}

/**
 * Ce que tout écran qui ENVOIE un Bring partage (fiche, en-tête d'un direct — #16617, #17442) — iso
 * `ProfileBringViewModel.swift`, que l'en-tête iOS réutilise aussi. Le compteur se recompte depuis la réponse de l'envoi,
 * sans relire ; « Ça sonne » suit [BringGateway.outgoing] jusqu'à l'arrêt ou l'échéance, quel que soit l'écran qui a
 * envoyé.
 */
class BringSendControl(
    private val gateway: BringGateway,
    private val scope: CoroutineScope,
) {
    private val local = MutableStateFlow(BringSendState())

    val state: StateFlow<BringSendState> = combine(local, gateway.outgoing) { current, outgoing ->
        current.copy(ringing = current.userId?.let(outgoing::get))
    }.stateIn(scope, SharingStarted.Eagerly, BringSendState())

    fun load(userId: String) {
        if (userId.isBlank() || local.value.userId == userId) return
        local.value = BringSendState(userId = userId)
        scope.launch {
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
        scope.launch {
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

    private fun BringSendState.afterSend(outcome: BringSendOutcome, before: BringAvailability): BringSendState =
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
