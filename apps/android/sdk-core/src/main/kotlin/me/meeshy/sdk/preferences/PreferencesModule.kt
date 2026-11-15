package me.meeshy.sdk.preferences

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.preferencesDataStoreFile
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import javax.inject.Singleton

/** Binds the durable store behind [PreferencesRepository] and the category fold state. */
@Module
@InstallIn(SingletonComponent::class)
public object PreferencesModule {

    @Provides
    @Singleton
    public fun providesPreferenceSnapshotStore(@ApplicationContext context: Context): PreferenceSnapshotStore {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val dataStore = PreferenceDataStoreFactory.create(scope = scope) {
            context.preferencesDataStoreFile("meeshy_preference_snapshots")
        }
        return DataStorePreferenceSnapshotStore(dataStore)
    }
}
