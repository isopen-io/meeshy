package me.meeshy.sdk.audio

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
import me.meeshy.sdk.session.PerAccountCache
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
public object AudioPreferencesModule {

    @Provides
    @Singleton
    public fun providesAudioPreferencesStore(@ApplicationContext context: Context): AudioPreferencesStore {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val dataStore = PreferenceDataStoreFactory.create(scope = scope) {
            context.preferencesDataStoreFile("meeshy_audio")
        }
        return DataStoreAudioPreferencesStore(dataStore, scope)
    }

    @Provides
    @IntoSet
    public fun providesAudioPreferencesAccountReset(store: AudioPreferencesStore): PerAccountCache =
        AudioPreferencesAccountReset(store)
}
