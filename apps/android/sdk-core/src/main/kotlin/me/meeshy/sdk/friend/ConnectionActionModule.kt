package me.meeshy.sdk.friend

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

@Module
@InstallIn(SingletonComponent::class)
abstract class ConnectionActionModule {
    @Binds
    abstract fun bindFlushScheduler(impl: WorkManagerOutboxFlushScheduler): OutboxFlushScheduler
}
