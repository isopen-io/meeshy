package me.meeshy.sdk.location

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import me.meeshy.sdk.model.LocationPrecision
import me.meeshy.sdk.model.LocationSharingPreferences
import me.meeshy.sdk.model.PlaceCoarseNames
import me.meeshy.sdk.model.SharedMapStyle
import me.meeshy.sdk.model.SharedPlace

/**
 * Préférences de partage de position persistées (précision + style de carte). Un store sans
 * logique : la dégradation vit dans [LocationPrecision.coarsen].
 */
public interface LocationSharingPreferencesStore {
    public val preferences: StateFlow<LocationSharingPreferences>

    public suspend fun setPrecision(precision: LocationPrecision)

    public suspend fun setMapStyle(style: SharedMapStyle)
}

/**
 * Point de passage unique de tout chemin d'envoi d'un lieu (message, position en direct, post,
 * story) : applique la précision choisie avant que la moindre coordonnée ne parte.
 */
public fun LocationSharingPreferencesStore.degrade(
    place: SharedPlace,
    names: PlaceCoarseNames = PlaceCoarseNames.EMPTY,
): SharedPlace = preferences.value.precision.coarsen(place, names)

/** Variante volatile — tests et aperçus. */
public class InMemoryLocationSharingPreferencesStore(
    initial: LocationSharingPreferences = LocationSharingPreferences(),
) : LocationSharingPreferencesStore {
    private val state = MutableStateFlow(initial)
    override val preferences: StateFlow<LocationSharingPreferences> = state.asStateFlow()

    override suspend fun setPrecision(precision: LocationPrecision) {
        state.value = state.value.copy(precision = precision)
    }

    override suspend fun setMapStyle(style: SharedMapStyle) {
        state.value = state.value.copy(mapStyle = style)
    }
}

/** Variante durable sur un Preferences [DataStore] ; valeur illisible = défauts iOS. */
public class DataStoreLocationSharingPreferencesStore(
    private val dataStore: DataStore<Preferences>,
    scope: CoroutineScope,
) : LocationSharingPreferencesStore {

    override val preferences: StateFlow<LocationSharingPreferences> =
        dataStore.data
            .map { prefs ->
                LocationSharingPreferences(
                    precision = LocationPrecision.fromStorage(prefs[PRECISION_KEY]),
                    mapStyle = SharedMapStyle.fromStorage(prefs[MAP_STYLE_KEY]),
                )
            }
            .stateIn(scope, SharingStarted.Eagerly, LocationSharingPreferences())

    override suspend fun setPrecision(precision: LocationPrecision) {
        dataStore.edit { it[PRECISION_KEY] = precision.storageValue }
    }

    override suspend fun setMapStyle(style: SharedMapStyle) {
        dataStore.edit { it[MAP_STYLE_KEY] = style.storageValue }
    }

    private companion object {
        private val PRECISION_KEY = stringPreferencesKey("location_precision")
        private val MAP_STYLE_KEY = stringPreferencesKey("location_map_style")
    }
}
