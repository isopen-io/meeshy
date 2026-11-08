package me.meeshy.sdk.cache.purge

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.preferencesDataStoreFile
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import me.meeshy.core.common.IoDispatcher
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.session.PerAccountCache
import javax.inject.Singleton

/** Le service de mesure et de purge du cache, son registre d'attribution (vidé à la déconnexion) et ses charges Room. */
@Module
@InstallIn(SingletonComponent::class)
public object CachePurgeModule {

    @Provides
    @Singleton
    public fun providesMediaAttributionLedger(
        @ApplicationContext context: Context,
        @IoDispatcher io: CoroutineDispatcher,
    ): MediaAttributionLedger {
        val dataStore = PreferenceDataStoreFactory.create(scope = CoroutineScope(SupervisorJob() + io)) {
            context.preferencesDataStoreFile("meeshy_media_attribution")
        }
        return MediaAttributionLedger(dataStore)
    }

    @Provides
    @IntoSet
    public fun providesLedgerAccountReset(ledger: MediaAttributionLedger): PerAccountCache = ledger

    @Provides
    @Singleton
    public fun providesCachePurgeService(
        disks: CacheMediaDisks,
        database: MeeshyDatabase,
        ledger: MediaAttributionLedger,
        @IoDispatcher io: CoroutineDispatcher,
    ): CachePurgeService = CachePurgeService(
        disks = disks,
        payloads = RoomCachePayloadStores(database),
        attribution = RoomCacheAttributionSource(database, ledger),
        ledger = ledger,
        dispatcher = io,
    )
}
