package me.meeshy.app.contacts.circles

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.relation.CirclePerson
import me.meeshy.sdk.model.relation.SharedLocationBounds
import me.meeshy.sdk.model.relation.SharedLocationPin
import me.meeshy.sdk.model.relation.SharedLocationsMap
import me.meeshy.sdk.relation.CirclesGateway
import me.meeshy.sdk.relation.SharedLocationsGateway

/**
 * LA CARTE DES POSITIONS QU'ON ME PARTAGE, SUR ANDROID (#16985) — iso `SharedLocationsMapViewModel.swift` (#16983).
 *
 * - Elle PROJETTE le magasin du SDK ([SharedLocationsGateway]) : le serveur a déjà tronqué chaque position à la précision
 *   que son émetteur m'a donnée ; ce modèle ne rend rien plus fin, ne garde rien sur le disque et ne rejuge rien.
 * - Cache d'abord : le magasin se peint dès l'ouverture ; le rattrapage du MONDE à l'apparition efface une fin manquée
 *   carte fermée, puis seule l'emprise visible est redemandée, après un temps de calme (un glisser ne fait pas une requête
 *   par image).
 * - Les noms viennent de l'annuaire des cercles ; une personne inconnue reste sans nom (l'écran dit « Quelqu'un »).
 */
@HiltViewModel
class SharedLocationsMapViewModel internal constructor(
    private val live: SharedLocationsGateway,
    private val people: suspend (List<String>) -> Map<String, CirclePerson>,
    private val calmMillis: Long,
) : ViewModel() {

    @Inject
    constructor(live: SharedLocationsGateway, circles: CirclesGateway) : this(live, circles::people, CALM_MILLIS)

    private val known = MutableStateFlow<Map<String, CirclePerson>>(emptyMap())
    private var pending: Job? = null

    val pins: StateFlow<List<SharedLocationPin>> = combine(live.byUser, known) { byUser, names ->
        SharedLocationsMap.pins(byUser, names)
    }.stateIn(viewModelScope, SharingStarted.Eagerly, SharedLocationsMap.pins(live.byUser.value, emptyMap()))

    init {
        viewModelScope.launch {
            live.byUser.collect { byUser ->
                val unnamed = byUser.keys.filterNot { it in known.value }
                if (unnamed.isEmpty()) return@collect
                val found = people(unnamed)
                if (found.isNotEmpty()) known.update { it + found }
            }
        }
    }

    /** À l'apparition : le monde fait foi, une fin survenue carte fermée s'efface partout. */
    fun appeared() {
        viewModelScope.launch { live.catchUp(null) }
    }

    /** L'emprise visible a bougé : un seul rattrapage, sur la dernière emprise, après le calme. */
    fun regionChanged(bounds: SharedLocationBounds?) {
        pending?.cancel()
        pending = viewModelScope.launch {
            delay(calmMillis)
            live.catchUp(bounds)
        }
    }

    private companion object {
        const val CALM_MILLIS = 300L
    }
}
