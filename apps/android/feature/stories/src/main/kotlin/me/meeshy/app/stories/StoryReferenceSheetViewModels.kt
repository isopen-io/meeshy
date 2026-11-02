package me.meeshy.app.stories

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.location.LiveLocationFixSource
import me.meeshy.sdk.location.PlaceGeocoder
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.composer.StoryNearbyPlaces
import me.meeshy.sdk.model.composer.StoryPlaceSheetState
import me.meeshy.sdk.model.location.GeoPoint
import me.meeshy.sdk.model.location.LocationAccess
import me.meeshy.sdk.post.PostHashtagRepository
import javax.inject.Inject

/**
 * La feuille « Lieu » (#13846) : un relevé UNIQUE de l'appareil après l'accord (rien ne reste actif feuille fermée), les
 * lieux alentour par le géocodeur de l'appareil, la recherche par nom 300 ms après la dernière frappe. Après un refus, la
 * position n'est jamais lue.
 */
@HiltViewModel
class StoryPlaceSheetViewModel @Inject constructor(
    private val geocoder: PlaceGeocoder,
    private val fixes: LiveLocationFixSource,
) : ViewModel() {

    private val _state = MutableStateFlow(StoryPlaceSheetState())
    val state: StateFlow<StoryPlaceSheetState> = _state.asStateFlow()

    private var hereName = ""
    private var origin: GeoPoint? = null
    private var nearbyJob: Job? = null
    private var searchJob: Job? = null

    fun open(hereName: String) {
        nearbyJob?.cancel(); searchJob?.cancel()
        this.hereName = hereName
        origin = null
        _state.value = StoryPlaceSheetState()
    }

    fun onAccessResolved(granted: Boolean) {
        if (!granted) return _state.update { it.withAccess(LocationAccess.DENIED) }
        _state.update { it.withAccess(LocationAccess.GRANTED) }
        nearbyJob?.cancel()
        nearbyJob = viewModelScope.launch {
            val fix = fixes.currentFix() ?: return@launch
            val point = GeoPoint(fix.latitude, fix.longitude)
            origin = point
            val around = runCatching { geocoder.around(point, AROUND_LIMIT) }.getOrDefault(emptyList())
            _state.update { it.withNearby(StoryNearbyPlaces.places(point, around, hereName)) }
        }
    }

    fun onQueryChange(query: String) {
        _state.update { it.queried(query) }
        searchJob?.cancel()
        if (query.isBlank()) return
        searchJob = viewModelScope.launch {
            delay(SEARCH_DEBOUNCE_MS)
            val found = runCatching { geocoder.search(query, origin, SEARCH_LIMIT) }.getOrDefault(emptyList())
            val places = found.map { SharedPlace(latitude = it.point.latitude, longitude = it.point.longitude, name = it.name, address = it.address) }
            _state.update { it.withResults(query, places) }
        }
    }

    fun onChoose(place: SharedPlace) = _state.update { it.chosen(place) }

    private companion object {
        const val AROUND_LIMIT = 12
        const val SEARCH_LIMIT = 8
        const val SEARCH_DEBOUNCE_MS = 300L
    }
}

/** Les tendances de la feuille « Hashtags » (#13846, iOS `PostService.getTrendingHashtags`) : un échec se tait. */
@HiltViewModel
class StoryHashtagSheetViewModel @Inject constructor(
    private val hashtags: PostHashtagRepository,
) : ViewModel() {

    private val _trending = MutableStateFlow<List<String>>(emptyList())
    val trending: StateFlow<List<String>> = _trending.asStateFlow()

    fun load() {
        viewModelScope.launch {
            val tags = runCatching { hashtags.trending().getOrNull() }.getOrNull().orEmpty()
            _trending.value = tags.map { it.tag.trim().removePrefix("#") }.filter { it.isNotEmpty() }.distinct()
        }
    }
}
