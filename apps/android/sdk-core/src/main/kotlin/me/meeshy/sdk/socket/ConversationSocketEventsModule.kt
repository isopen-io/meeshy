package me.meeshy.sdk.socket

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet

/** Branche la famille du fil sur la session temps réel (attachée par `RealtimeSessionCoordinator`). */
@Module
@InstallIn(SingletonComponent::class)
internal interface ConversationSocketEventsModule {
    @Binds
    @IntoSet
    fun bindRealtime(manager: ConversationSocketEventsManager): RealtimeBinding
}
