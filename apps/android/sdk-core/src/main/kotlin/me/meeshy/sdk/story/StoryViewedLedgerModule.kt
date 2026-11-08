package me.meeshy.sdk.story

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.preferencesDataStoreFile
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
import kotlinx.serialization.json.Json
import me.meeshy.sdk.session.PerAccountCache

@Module
@InstallIn(SingletonComponent::class)
internal object StoryViewedLedgerModule {
    @Provides
    @Singleton
    fun providesStoryViewedLedger(@ApplicationContext context: Context, json: Json): StoryViewedLedger {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val dataStore = PreferenceDataStoreFactory.create(scope = scope) {
            context.preferencesDataStoreFile("meeshy_story_viewed_ledger")
        }
        return DataStoreStoryViewedLedger(dataStore, json)
    }

    @Provides
    @IntoSet
    fun providesStoryViewedLedgerWipe(ledger: StoryViewedLedger): PerAccountCache = ledger
}
