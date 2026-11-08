package me.meeshy.sdk.notification

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.preferencesDataStoreFile
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.Multibinds
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

/**
 * Qui d'autre peut garder la fenêtre système : l'onboarding pour sa carte Langues. Un
 * point d'extension en multibinding ; aucun membre = personne ne garde la fenêtre.
 */
public fun interface OnboardingPushPermissionHold {
    public suspend fun holds(reportPending: Boolean): Boolean
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class PushPermissionHoldsModule {
    @Multibinds
    abstract fun holds(): Set<@JvmSuppressWildcards OnboardingPushPermissionHold>
}

@Module
@InstallIn(SingletonComponent::class)
internal object PushPermissionModule {
    @Provides
    @Singleton
    fun deferralStore(@ApplicationContext context: Context): PushPermissionDeferralStore {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val dataStore = PreferenceDataStoreFactory.create(scope = scope) {
            context.preferencesDataStoreFile("meeshy_push_permission")
        }
        return DataStorePushPermissionDeferralStore(dataStore)
    }

    @Provides
    @Singleton
    fun status(@ApplicationContext context: Context): PushPermissionStatus = PushPermissionStatus(context)
}
