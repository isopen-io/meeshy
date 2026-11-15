package me.meeshy.sdk.voice

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.preferencesDataStoreFile
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import me.meeshy.sdk.session.PerAccountCache

@Module
@InstallIn(SingletonComponent::class)
object VoiceModule {

    @Provides
    @Singleton
    fun providesGrantedConsentsStore(@ApplicationContext context: Context): GrantedConsentsStore {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val dataStore = PreferenceDataStoreFactory.create(scope = scope) {
            context.preferencesDataStoreFile("meeshy_granted_consents")
        }
        return DataStoreGrantedConsentsStore(dataStore, scope)
    }

    @Provides
    @IntoSet
    fun providesGrantedConsentsAccountReset(store: GrantedConsentsStore): PerAccountCache = GrantedConsentsAccountReset(store)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class VoiceBindingsModule {
    @Binds
    abstract fun bindsVoiceConsentGate(gate: VoiceConsentGate): VoiceConsentGateProviding
}
