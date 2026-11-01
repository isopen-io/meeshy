package me.meeshy.app.game.photo

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.game.GameDevicePrefsStore
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.photo.GamePhotoMoment
import me.meeshy.sdk.model.game.photo.GamePhotoNotebookIndex
import me.meeshy.sdk.model.game.photo.GamePhotoOffers
import me.meeshy.sdk.model.game.photo.PhotoOfferMemory

/**
 * LES PROPOSITIONS DE PHOTO DE LA PREMIÈRE PAGE (iOS `GamePhotoCoordinator`) — Mee propose APRÈS la célébration, pendant
 * que la page est ouverte ; la loi ([GamePhotoOffers]) dit quoi, ce modèle lit la Chronique au moment de choisir. Le
 * déroulé ouvert ([active]) vient d'une proposition, d'une carte de Mee ou de la photo de départ. Les propositions se
 * taisent quand l'utilisateur a coupé les célébrations ; le déroulé qu'il ouvre lui-même, non.
 */
@HiltViewModel
class GamePhotoCoordinator internal constructor(
    val notebook: GamePhotoNotebooking,
    celebrations: Flow<Boolean>,
) : ViewModel() {

    @Inject constructor(notebooks: GamePhotoNotebooks, prefs: GameDevicePrefsStore) :
        this(notebooks.current(), prefs.prefs.map { it.celebrations })

    private var memory = PhotoOfferMemory()
    private val pending = MutableStateFlow<List<GamePhotoMoment>>(emptyList())
    private val opened = MutableStateFlow<GamePhotoMoment?>(null)

    /** Les propositions en attente d'un geste. */
    val offers: StateFlow<List<GamePhotoMoment>> = combine(pending, celebrations) { shown, celebrates -> if (celebrates) shown else emptyList() }
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    /** Le déroulé ouvert. */
    val active: StateFlow<GamePhotoMoment?> = opened.asStateFlow()

    /** Chaque lecture CONFIRMÉE du bloc de jeu ; la première n'est qu'un état, jamais une célébration. */
    fun observe(game: GameBlock, settled: Boolean = true) {
        val observation = GamePhotoOffers.observe(memory, game, settled)
        memory = observation.memory
        if (observation.moments.isEmpty()) return
        viewModelScope.launch {
            val entries = notebook.list()
            val chosen = GamePhotoOffers.choose(
                observation.moments, game,
                kept = GamePhotoNotebookIndex.keptIds(entries),
                known = entries.map { it.momentId }.toSet(),
                memory = memory,
                hasPendingOffer = pending.value.isNotEmpty(),
            ) ?: return@launch
            memory = memory.copy(offered = memory.offered + chosen.id)
            pending.update { it + chosen }
        }
    }

    fun start(moment: GamePhotoMoment) {
        pending.update { offers -> offers.filterNot { it.id == moment.id } }
        opened.value = moment
    }

    /** « Plus tard » sur une proposition : le moment attend dans la Chronique. */
    fun later(moment: GamePhotoMoment) {
        pending.update { offers -> offers.filterNot { it.id == moment.id } }
        viewModelScope.launch { notebook.postpone(moment) }
    }

    fun close() {
        opened.value = null
    }
}
