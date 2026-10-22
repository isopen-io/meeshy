package me.meeshy.sdk.di

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
import me.meeshy.sdk.media.CaptureGallery
import me.meeshy.sdk.media.CaptureSavePolicyStore
import me.meeshy.sdk.media.DataStoreCaptureSavePolicyStore
import me.meeshy.sdk.media.MediaStoreCaptureGallery
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
internal object CaptureSavePolicyModule {
    @Provides
    @Singleton
    fun providesCaptureSavePolicyStore(@ApplicationContext context: Context): CaptureSavePolicyStore {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val dataStore = PreferenceDataStoreFactory.create(scope = scope) {
            context.preferencesDataStoreFile("meeshy_capture_save_policy")
        }
        return DataStoreCaptureSavePolicyStore(dataStore, scope)
    }

    @Provides
    @Singleton
    fun providesCaptureGallery(@ApplicationContext context: Context): CaptureGallery =
        MediaStoreCaptureGallery(context)
}
