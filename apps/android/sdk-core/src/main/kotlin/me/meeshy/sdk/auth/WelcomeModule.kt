package me.meeshy.sdk.auth

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.preferencesDataStoreFile
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

@Module
@InstallIn(SingletonComponent::class)
public object WelcomeModule {

    @Provides
    @Singleton
    public fun providesWelcomeStore(@ApplicationContext context: Context): WelcomeStore {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        return DataStoreWelcomeStore(
            PreferenceDataStoreFactory.create(scope = scope) { context.preferencesDataStoreFile("meeshy_welcome") },
        )
    }
}
