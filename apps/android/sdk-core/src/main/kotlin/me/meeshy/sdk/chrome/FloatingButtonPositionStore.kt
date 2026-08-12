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
import me.meeshy.sdk.model.chrome.FloatingButtonPosition
import me.meeshy.sdk.model.chrome.decodePosition
import me.meeshy.sdk.model.chrome.encodePosition

/**
 * Ou l'utilisateur a range ses deux boutons flottants.
 *
 * Meme patron que [me.meeshy.sdk.theme.ThemeStore] : une interface, un double
 * memoire pour les tests, une implementation DataStore, et un codec pur qui degrade
 * au lieu de planter.
 */
public interface FloatingButtonPositionStore {
    public val leftPosition: StateFlow<FloatingButtonPosition>
    public val rightPosition: StateFlow<FloatingButtonPosition>
    public suspend fun setLeftPosition(position: FloatingButtonPosition)
    public suspend fun setRightPosition(position: FloatingButtonPosition)
}

/** Double de test — aucune E/S. */
public class InMemoryFloatingButtonPositionStore : FloatingButtonPositionStore {
    private val _left = MutableStateFlow(FloatingButtonPosition.DEFAULT_LEFT)
    private val _right = MutableStateFlow(FloatingButtonPosition.DEFAULT_RIGHT)

    override val leftPosition: StateFlow<FloatingButtonPosition> = _left.asStateFlow()
    override val rightPosition: StateFlow<FloatingButtonPosition> = _right.asStateFlow()

    override suspend fun setLeftPosition(position: FloatingButtonPosition) { _left.value = position }
    override suspend fun setRightPosition(position: FloatingButtonPosition) { _right.value = position }
}

/**
 * Adossee a un DataStore Preferences.
 *
 * Le decodage passe par le codec pur, donc une preference corrompue rend la position
 * par defaut au lieu de faire disparaitre le bouton — un ecran sans commandes coute
 * infiniment plus qu'une position approximative.
 *
 * Une cle par bouton : deplacer le menu ne doit pas emporter le flux avec lui.
 */
public class DataStoreFloatingButtonPositionStore(
    private val dataStore: DataStore<Preferences>,
    scope: CoroutineScope,
) : FloatingButtonPositionStore {

    override val leftPosition: StateFlow<FloatingButtonPosition> =
        dataStore.data
            .map { prefs -> decodePosition(prefs[KEY_LEFT], FloatingButtonPosition.DEFAULT_LEFT) }
            .stateIn(scope, SharingStarted.Eagerly, FloatingButtonPosition.DEFAULT_LEFT)

    override val rightPosition: StateFlow<FloatingButtonPosition> =
        dataStore.data
            .map { prefs -> decodePosition(prefs[KEY_RIGHT], FloatingButtonPosition.DEFAULT_RIGHT) }
            .stateIn(scope, SharingStarted.Eagerly, FloatingButtonPosition.DEFAULT_RIGHT)

    override suspend fun setLeftPosition(position: FloatingButtonPosition) {
        dataStore.edit { prefs -> prefs[KEY_LEFT] = encodePosition(position) }
    }

    override suspend fun setRightPosition(position: FloatingButtonPosition) {
        dataStore.edit { prefs -> prefs[KEY_RIGHT] = encodePosition(position) }
    }

    private companion object {
        private val KEY_LEFT = stringPreferencesKey("floating_button_left")
        private val KEY_RIGHT = stringPreferencesKey("floating_button_right")
    }
}
