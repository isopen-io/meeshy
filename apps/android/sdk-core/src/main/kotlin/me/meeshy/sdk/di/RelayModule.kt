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
import me.meeshy.sdk.sync.ConversationRealtimeApplier
import me.meeshy.sdk.sync.ConversationRealtimeRelay
import me.meeshy.sdk.sync.MessageRealtimeApplier
import me.meeshy.sdk.sync.ParticipantRealtimeApplier
import me.meeshy.sdk.sync.ReactionReadStatusApplier
import me.meeshy.sdk.sync.RealtimeCacheApplier
import me.meeshy.sdk.sync.TranslationRealtimeApplier

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
    @IntoSet
    fun bindConversationApplier(applier: ConversationRealtimeApplier): RealtimeCacheApplier

    @Binds
    @IntoSet
    fun bindParticipantApplier(applier: ParticipantRealtimeApplier): RealtimeCacheApplier

    @Binds
    @IntoSet
    fun bindReactionApplier(applier: ReactionReadStatusApplier): RealtimeCacheApplier

    @Binds
    @IntoSet
    fun bindTranslationApplier(applier: TranslationRealtimeApplier): RealtimeCacheApplier

    @Binds
    fun bindOpenLookup(registry: OpenConversationRegistry): OpenConversationLookup
}
