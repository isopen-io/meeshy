package me.meeshy.sdk.chat

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.session.PerAccountCache
import me.meeshy.sdk.socket.RealtimeBinding

@Module
@InstallIn(SingletonComponent::class)
internal abstract class StarredMessagesRealtimeModule {
    @Binds
    @IntoSet
    abstract fun bindRealtime(binding: StarredMessagesRealtimeBinding): RealtimeBinding

    @Binds
    @IntoSet
    abstract fun bindAccountCache(binding: StarredMessagesRealtimeBinding): PerAccountCache
}
