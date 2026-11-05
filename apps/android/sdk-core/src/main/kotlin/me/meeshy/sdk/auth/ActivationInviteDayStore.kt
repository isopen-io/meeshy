package me.meeshy.sdk.auth

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import java.time.ZoneId
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.MutableStateFlow
import me.meeshy.sdk.model.auth.ActivationInviteDay

/** Le jour ou l'invitation « Validez votre compte » a ete montree, sur CET appareil (#8239). */
public interface ActivationInviteDayStore {
    public suspend fun wasShownToday(nowEpochMillis: Long): Boolean

    public suspend fun markShown(nowEpochMillis: Long)
}

/** [ActivationInviteDayStore] volatil — tests et apercus. */
public class InMemoryActivationInviteDayStore(
    private val zone: () -> ZoneId = { ZoneId.systemDefault() },
) : ActivationInviteDayStore {
    private val day = MutableStateFlow<String?>(null)

    override suspend fun wasShownToday(nowEpochMillis: Long): Boolean =
        day.value == ActivationInviteDay.key(nowEpochMillis, zone())

    override suspend fun markShown(nowEpochMillis: Long) {
        day.value = ActivationInviteDay.key(nowEpochMillis, zone())
    }
}

/** Le jour civil LOCAL en cle stable (`activation_invite_shown_on`), le fuseau etant relu a chaque appel. */
public class DataStoreActivationInviteDayStore(
    private val dataStore: DataStore<Preferences>,
    private val zone: () -> ZoneId = { ZoneId.systemDefault() },
) : ActivationInviteDayStore {
    override suspend fun wasShownToday(nowEpochMillis: Long): Boolean =
        dataStore.data.first()[KEY] == ActivationInviteDay.key(nowEpochMillis, zone())

    override suspend fun markShown(nowEpochMillis: Long) {
        dataStore.edit { it[KEY] = ActivationInviteDay.key(nowEpochMillis, zone()) }
    }

    private companion object {
        val KEY = stringPreferencesKey("activation_invite_shown_on")
    }
}
