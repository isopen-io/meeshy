package me.meeshy.sdk.auth

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map

/**
 * « Cet appareil a déjà vu l'accueil » (iOS `hasCompletedOnboarding`). Durable, par appareil et non par compte :
 * l'accueil précède tout compte, il ne se purge donc pas à la déconnexion.
 */
public interface WelcomeStore {
    /** `null` tant que la lecture durable n'a pas répondu : l'accueil ne s'affiche jamais sur une réponse inconnue. */
    public val isSettled: Flow<Boolean?>

    /** Solde l'accueil ; idempotent. */
    public suspend fun settle()
}

/** [WelcomeStore] volatil — tests et aperçus. */
public class InMemoryWelcomeStore(settled: Boolean = false) : WelcomeStore {
    private val state = MutableStateFlow<Boolean?>(settled)
    override val isSettled: Flow<Boolean?> = state

    override suspend fun settle() {
        state.value = true
    }
}

/** [WelcomeStore] sur un [DataStore] Preferences ; un drapeau absent vaut « non soldé ». */
public class DataStoreWelcomeStore(private val dataStore: DataStore<Preferences>) : WelcomeStore {
    override val isSettled: Flow<Boolean?> = dataStore.data.map { it[KEY] ?: false }

    override suspend fun settle() {
        dataStore.edit { it[KEY] = true }
    }

    private companion object {
        val KEY = booleanPreferencesKey("welcome_settled")
    }
}
