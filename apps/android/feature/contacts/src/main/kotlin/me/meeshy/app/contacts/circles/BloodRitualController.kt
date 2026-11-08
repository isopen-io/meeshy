package me.meeshy.app.contacts.circles

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.relation.RelationRefusal
import me.meeshy.sdk.model.relation.RelationRitualCompletedEvent
import me.meeshy.sdk.model.relation.RelationRitualConsentKey
import me.meeshy.sdk.model.relation.RelationRitualConsents
import me.meeshy.sdk.model.relation.RelationRitualPhase
import me.meeshy.sdk.model.relation.RelationRitualProgressEvent
import me.meeshy.sdk.model.relation.RelationRitualStage
import me.meeshy.sdk.model.relation.RelationRitualStartedEvent
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.relation.CirclesGateway

/** Les étapes du rituel, du point de vue de l'écran — miroir de `BloodRitualViewModel.Stage` (iOS, #13938). */
enum class RitualStage {
    /** Les quatre partages, un à un, tous refusés au départ. */
    CONSENT,

    /** Prêt à ouvrir. */
    READY,
    OPENING,

    /** Ouvert : on attend que l'autre ouvre et tienne l'écran, et que nous le tenions. */
    WAITING,

    /** Les deux tiennent : le scellement part. */
    SYNCHRONISED,

    /** Nous avons confirmé, l'autre pas encore. */
    AWAITING_OTHER,
    COMPLETED,

    /** L'autre a lâché : rien n'est enregistré. */
    LAPSED,

    /** Le rituel ne peut pas se jouer (hors ligne, plus de demande, plus éligible…). */
    UNAVAILABLE,
}

/** Ce que l'écran dit en passant, sans alarme. */
enum class RitualNotice { BUSY, OPEN_FAILED, SEAL_FAILED }

data class BloodRitualState(
    val stage: RitualStage = RitualStage.CONSENT,
    val consents: RelationRitualConsents = RelationRitualConsents.ALL_REFUSED,
    val isHolding: Boolean = false,
    val otherIsWaiting: Boolean = false,
    val otherIsHolding: Boolean = false,
    val refusal: RelationRefusal? = null,
    val isOfflineUnavailable: Boolean = false,
    val notice: RitualNotice? = null,
) {
    val isSynchronised: Boolean get() = stage == RitualStage.SYNCHRONISED || stage == RitualStage.AWAITING_OTHER
}

/** Les trois flux du rituel que l'écran écoute (`relation:ritual-*`). */
data class RitualEvents(
    val started: Flow<RelationRitualStartedEvent>,
    val progress: Flow<RelationRitualProgressEvent>,
    val completed: Flow<RelationRitualCompletedEvent>,
)

/**
 * Le rituel du Sang, côté écran (#13938) — miroir de `BloodRitualViewModel.swift`. Le serveur tient l'état (jeton, fenêtre
 * de tenue de 15 s, double confirmation, consentements) ; l'écran le PILOTE (`POST /relations/:userId/ritual`) et se
 * synchronise sur les événements `relation:ritual-*`.
 *
 * **L'ordre est celui du serveur.** Il n'accepte un `confirm` que sur une tenue fraîche des DEUX côtés : les consentements se
 * choisissent donc AVANT de tenir l'écran, et le scellement part tout seul dès que les deux tiennent.
 *
 * **Lâcher est calme.** Si l'autre lâche (`lapsed`, ou `RELATION_RITUAL_LAPSED`), rien n'est enregistré : l'écran le dit et
 * propose de recommencer.
 */
class BloodRitualController(
    val userId: String,
    val displayName: String,
    private val gateway: CirclesGateway,
    private val isOnline: () -> Boolean,
    events: RitualEvents,
    private val scope: CoroutineScope,
    private val wait: suspend (Long) -> Unit = { kotlinx.coroutines.delay(it) },
) {
    private val _state = MutableStateFlow(BloodRitualState())
    val state: StateFlow<BloodRitualState> = _state.asStateFlow()

    private var token: String? = null
    private var holdWindowMs: Long = DEFAULT_HOLD_WINDOW_MS
    private var holdJob: Job? = null
    private val listening: Job = scope.launch {
        launch { events.started.collect { receiveStarted(it) } }
        launch { events.progress.collect { receiveProgress(it) } }
        launch { events.completed.collect { receiveCompleted(it) } }
    }

    /** La feuille se ferme : plus rien n'écoute ni ne rejoue la tenue. */
    fun close() {
        holdJob?.cancel()
        listening.cancel()
    }

    fun dismissNotice() = _state.update { it.copy(notice = null) }

    // Les consentements d'abord

    fun setConsent(key: RelationRitualConsentKey, granted: Boolean) {
        if (_state.value.stage != RitualStage.CONSENT) return
        _state.update { it.copy(consents = it.consents.setting(key, granted)) }
    }

    fun proceedFromConsents() {
        if (_state.value.stage != RitualStage.CONSENT) return
        _state.update { it.copy(stage = RitualStage.READY) }
    }

    // Ouvrir

    fun open() {
        if (_state.value.stage != RitualStage.READY) return
        if (!isOnline()) {
            _state.update { it.copy(stage = RitualStage.UNAVAILABLE, isOfflineUnavailable = true) }
            return
        }
        _state.update { it.copy(stage = RitualStage.OPENING) }
        scope.launch {
            when (val step = gateway.ritual(userId, RelationRitualPhase.START, token = null, consents = null)) {
                is NetworkResult.Success -> {
                    token = step.data.token
                    holdWindowMs = step.data.holdWindowMs ?: holdWindowMs
                    _state.update { it.copy(stage = RitualStage.WAITING) }
                }
                is NetworkResult.Failure -> onOpenFailure(RelationRefusal.of(step.error.code))
            }
        }
    }

    private fun onOpenFailure(refusal: RelationRefusal?) = _state.update {
        when (refusal) {
            RelationRefusal.RITUAL_BUSY -> it.copy(stage = RitualStage.READY, notice = RitualNotice.BUSY)
            null -> it.copy(stage = RitualStage.READY, notice = RitualNotice.OPEN_FAILED)
            else -> it.copy(stage = RitualStage.UNAVAILABLE, refusal = refusal)
        }
    }

    // Tenir l'écran

    fun holdBegan() {
        val current = _state.value
        if (current.stage != RitualStage.WAITING || current.isHolding || token == null) return
        _state.update { it.copy(isHolding = true) }
        scope.launch {
            postHold()
            if (!_state.value.isHolding) return@launch
            startHoldLoop()
            sealIfSynchronised()
        }
    }

    fun holdEnded() {
        stopHolding()
        if (_state.value.stage == RitualStage.SYNCHRONISED) _state.update { it.copy(stage = RitualStage.WAITING) }
    }

    private suspend fun postHold() {
        val held = token ?: return
        when (val step = gateway.ritual(userId, RelationRitualPhase.HOLD, token = held, consents = null)) {
            is NetworkResult.Success -> holdWindowMs = step.data.holdWindowMs ?: holdWindowMs
            is NetworkResult.Failure -> {
                val refusal = RelationRefusal.of(step.error.code)
                if (refusal == RelationRefusal.RITUAL_NO_REQUEST || refusal == RelationRefusal.RITUAL_INVALID) {
                    stopHolding()
                    _state.update { it.copy(stage = RitualStage.UNAVAILABLE, refusal = refusal) }
                }
            }
        }
    }

    /** Rejoue `hold` tant que le doigt reste posé : une tenue ne vaut que sa fenêtre. */
    private fun startHoldLoop() {
        holdJob?.cancel()
        val interval = maxOf(holdWindowMs / 3, MIN_HOLD_INTERVAL_MS)
        holdJob = scope.launch {
            while (isActive) {
                wait(interval)
                if (!_state.value.isHolding) return@launch
                postHold()
            }
        }
    }

    private fun stopHolding() {
        holdJob?.cancel()
        holdJob = null
        _state.update { it.copy(isHolding = false) }
    }

    // Les événements de l'autre

    private fun receiveStarted(event: RelationRitualStartedEvent) {
        if (event.userId != userId) return
        _state.update { it.copy(otherIsWaiting = true) }
    }

    private suspend fun receiveProgress(event: RelationRitualProgressEvent) {
        if (event.userId != userId || !matchesToken(event.token)) return
        when (event.servedStage) {
            RelationRitualStage.HELD -> {
                _state.update { it.copy(otherIsHolding = true) }
                sealIfSynchronised()
            }
            RelationRitualStage.LAPSED -> lapse()
            RelationRitualStage.CONFIRMED, null -> Unit
        }
    }

    private fun receiveCompleted(event: RelationRitualCompletedEvent) {
        if (event.userId != userId || !matchesToken(event.token)) return
        complete()
    }

    private fun matchesToken(served: String): Boolean = token == null || token == served

    // Sceller

    private suspend fun sealIfSynchronised() {
        val current = _state.value
        val held = token
        if (current.stage != RitualStage.WAITING || !current.isHolding || !current.otherIsHolding || held == null) return
        _state.update { it.copy(stage = RitualStage.SYNCHRONISED) }
        when (val step = gateway.ritual(userId, RelationRitualPhase.CONFIRM, token = held, consents = current.consents)) {
            is NetworkResult.Success -> {
                if (_state.value.stage == RitualStage.COMPLETED) return
                if (step.data.completed == true) complete() else _state.update { it.copy(stage = RitualStage.AWAITING_OTHER) }
            }
            is NetworkResult.Failure -> onConfirmFailure(RelationRefusal.of(step.error.code))
        }
    }

    private fun onConfirmFailure(refusal: RelationRefusal?) {
        when (refusal) {
            RelationRefusal.RITUAL_LAPSED -> lapse()
            RelationRefusal.RITUAL_NOT_SYNCHRONISED ->
                _state.update { it.copy(otherIsHolding = false, stage = RitualStage.WAITING) }
            RelationRefusal.CONSENT_REQUIRED -> {
                stopHolding()
                _state.update { it.copy(stage = RitualStage.CONSENT) }
            }
            RelationRefusal.RITUAL_BUSY -> _state.update { it.copy(stage = RitualStage.WAITING) }
            null -> _state.update { it.copy(stage = RitualStage.WAITING, notice = RitualNotice.SEAL_FAILED) }
            else -> {
                stopHolding()
                _state.update { it.copy(stage = RitualStage.UNAVAILABLE, refusal = refusal) }
            }
        }
    }

    private fun complete() {
        stopHolding()
        _state.update { it.copy(stage = RitualStage.COMPLETED) }
    }

    private fun lapse() {
        stopHolding()
        _state.update { it.copy(otherIsHolding = false, stage = RitualStage.LAPSED) }
    }

    /** Recommencer après un lâcher : l'état du serveur n'a pas changé, il suffit de rouvrir. */
    fun retry() {
        if (_state.value.stage != RitualStage.LAPSED) return
        stopHolding()
        token = null
        _state.update { it.copy(otherIsHolding = false, otherIsWaiting = false, stage = RitualStage.READY) }
    }

    private companion object {
        const val DEFAULT_HOLD_WINDOW_MS = 15_000L
        const val MIN_HOLD_INTERVAL_MS = 1_000L
    }
}
