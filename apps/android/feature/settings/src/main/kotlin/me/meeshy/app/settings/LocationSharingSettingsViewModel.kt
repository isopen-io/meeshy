package me.meeshy.app.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.location.LocationSharingPreferencesStore
import me.meeshy.sdk.model.LocationPrecision
import me.meeshy.sdk.model.LocationSharingPreferences
import me.meeshy.sdk.model.SharedMapStyle
import javax.inject.Inject

/** Pilote la feuille « Partage de position » : le magasin est l'unique source de vérité. */
@HiltViewModel
class LocationSharingSettingsViewModel @Inject constructor(
    private val store: LocationSharingPreferencesStore,
) : ViewModel() {

    val preferences: StateFlow<LocationSharingPreferences> = store.preferences

    fun setPrecision(precision: LocationPrecision) {
        viewModelScope.launch { store.setPrecision(precision) }
    }

    fun setMapStyle(style: SharedMapStyle) {
        viewModelScope.launch { store.setMapStyle(style) }
    }
}
