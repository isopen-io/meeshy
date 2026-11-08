package me.meeshy.sdk.notification

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import kotlinx.coroutines.flow.first

/**
 * Le report de la demande de permission de notification (miroir de `PushPermissionDeferral` iOS).
 * Persistant : entre l'inscription et le premier message, l'app peut être fermée ou relancée.
 */
public interface PushPermissionDeferralStore {
    /** Vrai tant qu'une demande différée n'a pas été honorée. */
    public suspend fun isPending(): Boolean

    /** Note qu'il faudra demander, au premier message envoyé et accepté. */
    public suspend fun postpone()

    /** Efface le marqueur, une fois, au moment où la demande part. */
    public suspend fun resolve()
}

public class InMemoryPushPermissionDeferralStore(initial: Boolean = false) : PushPermissionDeferralStore {
    @Volatile private var pending = initial
    override suspend fun isPending(): Boolean = pending
    override suspend fun postpone() { pending = true }
    override suspend fun resolve() { pending = false }
}

public class DataStorePushPermissionDeferralStore(
    private val dataStore: DataStore<Preferences>,
) : PushPermissionDeferralStore {
    override suspend fun isPending(): Boolean = dataStore.data.first()[KEY] == true

    override suspend fun postpone() {
        dataStore.edit { it[KEY] = true }
    }

    override suspend fun resolve() {
        dataStore.edit { it.remove(KEY) }
    }

    private companion object {
        private val KEY = booleanPreferencesKey("defer_push_permission_until_first_message")
    }
}
