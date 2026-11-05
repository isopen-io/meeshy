package me.meeshy.sdk.conversation

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

/** Lot liste-pagination-pied : le magasin durable du curseur de la liste et son oubli au changement de compte. */
@Module
@InstallIn(SingletonComponent::class)
abstract class ConversationPaginationModule {

    @Binds
    @IntoSet
    abstract fun paginationAccountCache(impl: ConversationPaginationAccountCache): PerAccountCache

    @Binds
    abstract fun paginating(impl: ConversationPager): ConversationPaginating

    companion object {
        @Provides
        @Singleton
        fun providesConversationPaginationStore(@ApplicationContext context: Context): ConversationPaginationStore {
            val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
            val dataStore = PreferenceDataStoreFactory.create(scope = scope) {
                context.preferencesDataStoreFile("meeshy_conversation_pagination")
            }
            return DataStoreConversationPaginationStore(dataStore)
        }
    }
}
