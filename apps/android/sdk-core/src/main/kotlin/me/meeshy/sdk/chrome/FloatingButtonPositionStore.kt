package me.meeshy.sdk.chrome

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
import me.meeshy.sdk.model.chrome.FloatingButtonGeometry
import me.meeshy.sdk.model.chrome.FloatingButtonStoredPosition

/**
 * Ou l'utilisateur a range ses deux boutons flottants — miroir des `@AppStorage`
 * `feedButtonPosition` / `menuButtonPosition` de `RootView` iOS.
 *
 * Le magasin garde la valeur BRUTE (`v3,L,0.512345`, ou l'ancienne forme `x,y`) : c'est
 * `FloatingButtonGeometry` qui la lit contre la zone sure mesuree, et qui seule produit une
 * nouvelle valeur, a la fin d'un vrai glisser. Une valeur illisible n'est jamais propagee :
 * le bouton retombe sur sa place par defaut au lieu de disparaitre.
 *
 * Une cle par bouton : deplacer le menu n'emporte pas le flux.
 */
public interface FloatingButtonPositionStore {
    /** La place du bouton Flux (gauche par defaut). */
    public val leftStorage: StateFlow<String>

    /** La place du bouton avatar / menu (droite par defaut). */
    public val rightStorage: StateFlow<String>

    public suspend fun setLeftStorage(value: String)
    public suspend fun setRightStorage(value: String)
}

/** Une valeur lisible, ou [fallback] : jamais une chaine corrompue jusqu'a l'ecran. */
internal fun sanitizedStorage(raw: String?, fallback: String): String =
    if (raw != null && FloatingButtonStoredPosition.parse(raw) != null) raw else fallback

/** Double de test — aucune E/S. */
public class InMemoryFloatingButtonPositionStore(
    left: String = FloatingButtonGeometry.DEFAULT_FEED_STORAGE,
    right: String = FloatingButtonGeometry.DEFAULT_MENU_STORAGE,
) : FloatingButtonPositionStore {
    private val _left = MutableStateFlow(sanitizedStorage(left, FloatingButtonGeometry.DEFAULT_FEED_STORAGE))
    private val _right = MutableStateFlow(sanitizedStorage(right, FloatingButtonGeometry.DEFAULT_MENU_STORAGE))

    override val leftStorage: StateFlow<String> = _left.asStateFlow()
    override val rightStorage: StateFlow<String> = _right.asStateFlow()

    override suspend fun setLeftStorage(value: String) {
        _left.value = sanitizedStorage(value, _left.value)
    }

    override suspend fun setRightStorage(value: String) {
        _right.value = sanitizedStorage(value, _right.value)
    }
}

/**
 * Adossee a un DataStore Preferences. Les cles sont celles de l'ancien format `x,y` : une
 * position choisie avant la mise a jour est relue (migration par lecture, aucune ecriture tant
 * que l'utilisateur ne deplace pas le bouton).
 */
public class DataStoreFloatingButtonPositionStore(
    private val dataStore: DataStore<Preferences>,
    scope: CoroutineScope,
) : FloatingButtonPositionStore {

    override val leftStorage: StateFlow<String> =
        dataStore.data
            .map { prefs -> sanitizedStorage(prefs[KEY_LEFT], FloatingButtonGeometry.DEFAULT_FEED_STORAGE) }
            .stateIn(scope, SharingStarted.Eagerly, FloatingButtonGeometry.DEFAULT_FEED_STORAGE)

    override val rightStorage: StateFlow<String> =
        dataStore.data
            .map { prefs -> sanitizedStorage(prefs[KEY_RIGHT], FloatingButtonGeometry.DEFAULT_MENU_STORAGE) }
            .stateIn(scope, SharingStarted.Eagerly, FloatingButtonGeometry.DEFAULT_MENU_STORAGE)

    override suspend fun setLeftStorage(value: String) {
        if (FloatingButtonStoredPosition.parse(value) == null) return
        dataStore.edit { prefs -> prefs[KEY_LEFT] = value }
    }

    override suspend fun setRightStorage(value: String) {
        if (FloatingButtonStoredPosition.parse(value) == null) return
        dataStore.edit { prefs -> prefs[KEY_RIGHT] = value }
    }

    private companion object {
        private val KEY_LEFT = stringPreferencesKey("floating_button_left")
        private val KEY_RIGHT = stringPreferencesKey("floating_button_right")
    }
}
