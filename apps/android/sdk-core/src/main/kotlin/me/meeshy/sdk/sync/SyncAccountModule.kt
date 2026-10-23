package me.meeshy.sdk.sync

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
internal object SyncAccountModule {
    @Provides
    @Singleton
    fun provideSyncAccountProvider(sessionRepository: SessionRepository): SyncAccountProvider =
        SyncAccountProvider { sessionRepository.currentUserId?.takeIf { it.isNotBlank() } }
}
