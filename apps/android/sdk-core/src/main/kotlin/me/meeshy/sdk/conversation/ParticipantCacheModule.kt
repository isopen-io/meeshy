package me.meeshy.sdk.conversation

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import me.meeshy.core.database.dao.KeyedJsonCacheDao
import me.meeshy.sdk.cache.KeyedJsonCache
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
internal object ParticipantCacheModule {

    @Provides
    @Singleton
    fun participantCache(
        dao: KeyedJsonCacheDao,
        conversations: ConversationRepository,
    ): ParticipantCacheRepository = ParticipantCacheRepository(
        cache = KeyedJsonCache(dao),
        fetchPage = { id, cursor, limit -> conversations.participants(id = id, cursor = cursor, limit = limit) },
        scope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
    )
}
