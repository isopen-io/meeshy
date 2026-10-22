package me.meeshy.sdk.conversation

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

@Module
@InstallIn(SingletonComponent::class)
internal interface MessagePrefetchModule {
    @Binds
    fun store(impl: RoomMessagePrefetchStore): MessagePrefetchStore

    @Binds
    fun pageSource(impl: ApiMessagePrefetchPageSource): MessagePrefetchPageSource
}
