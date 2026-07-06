package me.meeshy.sdk.notification

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
import me.meeshy.sdk.model.UserNotificationPreferences
import me.meeshy.sdk.model.notificationPreferencesFromStorage
import me.meeshy.sdk.model.storageValue

/**
 * The durable notification-preference seam (feature-parity §L). Holds the persisted
 * [UserNotificationPreferences] block and exposes it as an observable [StateFlow] so the
 * settings UI reflects a toggle the instant it changes, and hydrates it on cold start so
 * the persisted choice paints without a flash of the wrong (default) configuration.
 *
 * A stateless building block: it owns only the stored token; the storage codec and the
 * safe-defaults corruption fallback live in the pure `UserNotificationPreferences` helpers.
 */
public interface NotificationPreferencesStore {
    /** The current notification preferences, defaulting to [UserNotificationPreferences]. */
    public val preferences: StateFlow<UserNotificationPreferences>

    /** Persists the whole notification-preference block. */
    public suspend fun setPreferences(preferences: UserNotificationPreferences)
}

/** Volatile [NotificationPreferencesStore] — for tests and previews. */
public class InMemoryNotificationPreferencesStore(
    initial: UserNotificationPreferences = UserNotificationPreferences(),
) : NotificationPreferencesStore {
    private val _preferences = MutableStateFlow(initial)
    override val preferences: StateFlow<UserNotificationPreferences> = _preferences.asStateFlow()

    override suspend fun setPreferences(preferences: UserNotificationPreferences) {
        _preferences.value = preferences
    }
}

/**
 * [NotificationPreferencesStore] backed by a Preferences [DataStore] (the SOTA replacement
 * for `SharedPreferences`). The persisted token is decoded through the pure
 * [notificationPreferencesFromStorage] codec, so a corrupt/legacy value degrades to the
 * safe defaults instead of crashing.
 */
public class DataStoreNotificationPreferencesStore(
    private val dataStore: DataStore<Preferences>,
    scope: CoroutineScope,
) : NotificationPreferencesStore {

    override val preferences: StateFlow<UserNotificationPreferences> =
        dataStore.data
            .map { prefs -> notificationPreferencesFromStorage(prefs[KEY]) }
            .stateIn(scope, SharingStarted.Eagerly, UserNotificationPreferences())

    override suspend fun setPreferences(preferences: UserNotificationPreferences) {
        dataStore.edit { prefs -> prefs[KEY] = preferences.storageValue }
    }

    private companion object {
        private val KEY = stringPreferencesKey("notification_preferences")
    }
}
