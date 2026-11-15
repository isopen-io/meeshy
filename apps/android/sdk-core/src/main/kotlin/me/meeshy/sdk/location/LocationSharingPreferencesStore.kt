package me.meeshy.sdk.location

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import androidx.datastore.preferences.core.emptyPreferences
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.updateAndGet
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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

    public companion object {
        /** Délai de repos avant écriture disque : une rafale de taps n'écrit qu'une fois (iOS : 100 ms). */
        public const val WRITE_DEBOUNCE_MS: Long = 100L
    }
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

/**
 * Variante durable sur un Preferences [DataStore].
 *
 * - Lecture tolérante : fichier illisible, clé absente ou valeur d'enum inconnue d'une version
 *   future = défauts (exacte / plan), jamais de plantage.
 * - Le choix est publié IMMÉDIATEMENT dans [preferences] (retour instantané de l'interface) ;
 *   l'écriture disque est débouncée de [LocationSharingPreferencesStore.WRITE_DEBOUNCE_MS].
 */
public class DataStoreLocationSharingPreferencesStore(
    private val dataStore: DataStore<Preferences>,
    private val scope: CoroutineScope,
) : LocationSharingPreferencesStore {

    private val state = MutableStateFlow(LocationSharingPreferences())
    override val preferences: StateFlow<LocationSharingPreferences> = state.asStateFlow()

    private val seeded = CompletableDeferred<Unit>()
    private var pendingWrite: Job? = null

    init {
        scope.launch {
            val stored = readStored()
            state.value = stored
            seeded.complete(Unit)
        }
    }

    override suspend fun setPrecision(precision: LocationPrecision) {
        seeded.await()
        commit(state.updateAndGet { it.copy(precision = precision) })
    }

    override suspend fun setMapStyle(style: SharedMapStyle) {
        seeded.await()
        commit(state.updateAndGet { it.copy(mapStyle = style) })
    }

    private fun commit(value: LocationSharingPreferences) {
        pendingWrite?.cancel()
        pendingWrite = scope.launch {
            delay(LocationSharingPreferencesStore.WRITE_DEBOUNCE_MS)
            persist(value)
        }
    }

    private suspend fun readStored(): LocationSharingPreferences {
        val prefs = try {
            dataStore.data.catch { emit(emptyPreferences()) }.first()
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (_: Exception) {
            emptyPreferences()
        }
        return LocationSharingPreferences(
            precision = LocationPrecision.fromStorage(prefs[PRECISION_KEY]),
            mapStyle = SharedMapStyle.fromStorage(prefs[MAP_STYLE_KEY]),
        )
    }

    private suspend fun persist(value: LocationSharingPreferences) {
        try {
            dataStore.edit {
                it[PRECISION_KEY] = value.precision.storageValue
                it[MAP_STYLE_KEY] = value.mapStyle.storageValue
            }
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (_: Exception) {
            // Disque plein ou fichier illisible : le choix reste actif pour la session.
        }
    }

    private companion object {
        private val PRECISION_KEY = stringPreferencesKey("location_precision")
        private val MAP_STYLE_KEY = stringPreferencesKey("location_map_style")
    }
}
