package me.meeshy.sdk.di

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import dagger.multibindings.Multibinds
import me.meeshy.sdk.conversation.OpenConversationLookup
import me.meeshy.sdk.conversation.OpenConversationRegistry
import me.meeshy.sdk.socket.RealtimeBinding
import me.meeshy.sdk.sync.ConversationRealtimeRelay
import me.meeshy.sdk.sync.MessageRealtimeApplier
import me.meeshy.sdk.sync.RealtimeCacheApplier

/** Le relais permanent : sa branche sur la session, l'ensemble (extensible) de ses applicateurs, et le premier d'entre eux. */
@Module
@InstallIn(SingletonComponent::class)
internal interface RelayModule {
    @Multibinds
    fun appliers(): Set<@JvmSuppressWildcards RealtimeCacheApplier>

    @Binds
    @IntoSet
    fun bindRelay(relay: ConversationRealtimeRelay): RealtimeBinding

    @Binds
    @IntoSet
    fun bindMessageApplier(applier: MessageRealtimeApplier): RealtimeCacheApplier

    @Binds
    fun bindOpenLookup(registry: OpenConversationRegistry): OpenConversationLookup
}
