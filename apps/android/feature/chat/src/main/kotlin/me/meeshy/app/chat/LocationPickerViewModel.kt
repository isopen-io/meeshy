package me.meeshy.app.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.location.LiveLocationFixSource
import me.meeshy.sdk.location.LocationSharingPreferencesStore
import me.meeshy.sdk.location.PlaceGeocoder
import me.meeshy.sdk.model.LocationSharingPreferences
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.location.GeoPoint
import me.meeshy.sdk.model.location.LocationAccess
import me.meeshy.sdk.model.location.LocationPickerState
import me.meeshy.sdk.model.location.LocationSearchPlan
import me.meeshy.sdk.model.location.LocationSearchResult
import javax.inject.Inject

/** Où la carte doit se poser : un relevé de l'appareil, un résultat choisi ou un recentrage. */
data class MapTarget(val point: GeoPoint, val zoom: Int, val nonce: Int)

/**
 * Pilote le sélecteur de lieu (miroir de `LocationPickerModel` iOS). L'état est une réduction
 * pure ([LocationPickerState]) ; ce ViewModel ne fait que séquencer les E/S : un relevé UNIQUE de
 * l'appareil à l'ouverture et au recentrage (aucun suivi en continu : rien ne reste actif après
 * la fermeture), le géocodage inverse 300 ms après le dernier mouvement, la recherche 300 ms
 * après la dernière frappe.
 */
@HiltViewModel
class LocationPickerViewModel @Inject constructor(
    private val geocoder: PlaceGeocoder,
    private val fixes: LiveLocationFixSource,
    private val store: LocationSharingPreferencesStore,
) : ViewModel() {

    private val _state = MutableStateFlow(LocationPickerState())
    val state: StateFlow<LocationPickerState> = _state.asStateFlow()

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    private val _target = MutableStateFlow<MapTarget?>(null)
    val target: StateFlow<MapTarget?> = _target.asStateFlow()

    private val _isLocating = MutableStateFlow(false)
    val isLocating: StateFlow<Boolean> = _isLocating.asStateFlow()

    private val _confirmed = MutableSharedFlow<SharedPlace>(extraBufferCapacity = 1)
    val confirmed: SharedFlow<SharedPlace> = _confirmed.asSharedFlow()

    val preferences: StateFlow<LocationSharingPreferences> = store.preferences

    private var geocodeJob: Job? = null
    private var searchJob: Job? = null
    private var locateJob: Job? = null
    private var nonce = 0

    /** À l'ouverture : tout repart de zéro (le ViewModel survit à la fermeture de la feuille). */
    fun open() {
        geocodeJob?.cancel(); searchJob?.cancel(); locateJob?.cancel()
        _state.value = LocationPickerState()
        _query.value = ""
        _target.value = null
        _isLocating.value = false
    }

    /** La porte de permission a répondu. Refus : bandeau, la sélection manuelle reste utilisable. */
    fun onAccessResolved(granted: Boolean) {
        if (!granted) {
            _state.update { it.withAccess(LocationAccess.DENIED) }
            return
        }
        _state.update { it.withAccess(LocationAccess.GRANTED) }
        locate(zoom = LocationSearchPlan.DEFAULT_ZOOM)
    }

    /** « Recentrer sur ma position » : un nouveau relevé unique. */
    fun recenter() {
        if (_state.value.isLocationRefused) return
        locate(zoom = LocationSearchPlan.RECENTER_ZOOM)
    }

    private fun locate(zoom: Int) {
        if (locateJob?.isActive == true) return
        _isLocating.value = true
        locateJob = viewModelScope.launch {
            try {
                val fix = fixes.currentFix() ?: return@launch
                val point = GeoPoint(fix.latitude, fix.longitude)
                _state.update { it.userFixed(point) }
                _target.value = MapTarget(point, zoom, ++nonce)
                scheduleGeocode(point, immediate = true)
            } finally {
                _isLocating.value = false
            }
        }
    }

    /** Le centre de la carte a bougé (geste ou recentrage programmatique). */
    fun onMapMoved(center: GeoPoint) {
        val before = _state.value
        val after = before.moved(center)
        if (after === before) return
        _state.value = after
        scheduleGeocode(center, immediate = false)
    }

    private fun scheduleGeocode(point: GeoPoint, immediate: Boolean) {
        geocodeJob?.cancel()
        geocodeJob = viewModelScope.launch {
            if (!immediate) delay(LocationSearchPlan.GEOCODE_DEBOUNCE_MS)
            val address = runCatching { geocoder.reverse(point) }.getOrNull()
            _state.update {
                if (address == null) it.geocodeFailed(point) else it.geocoded(point, address.text, address.coarse)
            }
        }
    }

    fun onQueryChange(query: String) {
        _query.value = query
        searchJob?.cancel()
        if (query.isBlank()) {
            _state.update { it.withResults(emptyList()) }
            return
        }
        searchJob = viewModelScope.launch {
            delay(LocationSearchPlan.SEARCH_DEBOUNCE_MS)
            val near = _state.value.userLocation ?: _state.value.selected
            val results = runCatching { geocoder.search(query.trim(), near, LocationSearchPlan.MAX_RESULTS) }.getOrDefault(emptyList())
            _state.update { it.withResults(results) }
        }
    }

    fun clearQuery() = onQueryChange("")

    /** Un résultat choisi : la carte s'y pose, le nom et la catégorie sont déjà connus. */
    fun choose(result: LocationSearchResult) {
        searchJob?.cancel()
        _query.value = result.name ?: result.address.orEmpty()
        _state.update { it.chosen(result) }
        _target.value = MapTarget(result.point, LocationSearchPlan.RECENTER_ZOOM, ++nonce)
        scheduleGeocode(result.point, immediate = true)
    }

    /** « Confirmer » : le lieu part avec la précision choisie — la même que celle affichée dans la carte du bas. */
    fun confirm() {
        val place = _state.value.place(store.preferences.value.precision) ?: return
        _confirmed.tryEmit(place)
    }

    override fun onCleared() {
        geocodeJob?.cancel(); searchJob?.cancel(); locateJob?.cancel()
    }
}
