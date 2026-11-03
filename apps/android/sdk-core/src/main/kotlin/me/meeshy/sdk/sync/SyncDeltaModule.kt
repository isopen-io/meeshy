package me.meeshy.sdk.sync

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

@Module
@InstallIn(SingletonComponent::class)
internal abstract class SyncDeltaModule {
    @Binds
    abstract fun bindSyncDeltaFetching(client: SyncDeltaClient): SyncDeltaFetching
}
