package me.meeshy.sdk.session

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.preferencesDataStoreFile
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import javax.inject.Singleton

/** Le magasin durable des appareils connectés, et son vidage à la déconnexion (jamais d'héritage entre comptes). */
@Module
@InstallIn(SingletonComponent::class)
public object UserSessionsModule {

    @Provides
    @Singleton
    public fun providesUserSessionsSnapshotStore(@ApplicationContext context: Context): UserSessionsSnapshotStore {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val dataStore = PreferenceDataStoreFactory.create(scope = scope) {
            context.preferencesDataStoreFile("meeshy_user_sessions_snapshot")
        }
        return DataStoreUserSessionsSnapshotStore(dataStore)
    }

    @Provides
    @IntoSet
    public fun providesUserSessionsAccountCache(store: UserSessionsSnapshotStore): PerAccountCache = store
}
