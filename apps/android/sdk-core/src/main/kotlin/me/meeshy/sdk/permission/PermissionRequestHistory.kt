package me.meeshy.sdk.permission

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStoreFile
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.first
import java.io.IOException

/**
 * La mémoire des permissions déjà demandées au système, qui survit au redémarrage du processus.
 *
 * Android ne dit pas « jamais demandé » : `shouldShowRequestPermissionRationale` rend `false`
 * avant la première demande comme après un refus définitif. Sans cette mémoire, un refus
 * définitif ressemblerait à une première demande et l'app tenterait une boîte système qui ne
 * s'affichera plus. La clé est la permission Android elle-même, de sorte qu'une demande du
 * micro n'altère jamais l'état de la caméra.
 */
public interface PermissionRequestHistory {

    /** Vrai si [permission] a déjà été soumise à la boîte système au moins une fois. */
    public suspend fun wasRequested(permission: String): Boolean

    /** Le sous-ensemble de [permissions] déjà soumis à la boîte système. */
    public suspend fun requestedAmong(permissions: Collection<String>): Set<String>

    /** Note que [permissions] vont être soumises à la boîte système (écriture durable). */
    public suspend fun markRequested(permissions: Collection<String>)

    public companion object {
        /**
         * L'instance du processus. DataStore refuse deux instances actives sur un même fichier :
         * tout appelant passe par ici plutôt que d'en construire une.
         */
        public fun shared(context: Context): PermissionRequestHistory = SharedHistory.get(context)
    }
}

/** [PermissionRequestHistory] durable, adossé à un DataStore Preferences. */
public class DataStorePermissionRequestHistory(
    private val dataStore: DataStore<Preferences>,
) : PermissionRequestHistory {

    override suspend fun wasRequested(permission: String): Boolean = requested().contains(permission)

    override suspend fun requestedAmong(permissions: Collection<String>): Set<String> =
        requested().intersect(permissions.toSet())

    override suspend fun markRequested(permissions: Collection<String>) {
        if (permissions.isEmpty()) return
        dataStore.edit { prefs -> prefs[KEY] = (prefs[KEY] ?: emptySet()) + permissions }
    }

    private suspend fun requested(): Set<String> =
        dataStore.data
            .catch { error -> if (error is IOException) emit(emptyPreferences()) else throw error }
            .first()[KEY] ?: emptySet()

    private companion object {
        private val KEY = stringSetPreferencesKey("requested_permissions")
    }
}

private object SharedHistory {
    private const val FILE_NAME = "meeshy_permission_history"

    @Volatile
    private var instance: PermissionRequestHistory? = null

    fun get(context: Context): PermissionRequestHistory =
        instance ?: synchronized(this) {
            instance ?: create(context.applicationContext).also { instance = it }
        }

    private fun create(appContext: Context): PermissionRequestHistory {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val dataStore = PreferenceDataStoreFactory.create(scope = scope) {
            appContext.preferencesDataStoreFile(FILE_NAME)
        }
        return DataStorePermissionRequestHistory(dataStore)
    }
}
