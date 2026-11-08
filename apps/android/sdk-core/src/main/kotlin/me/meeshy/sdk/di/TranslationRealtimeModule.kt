package me.meeshy.sdk.di

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.socket.RealtimeBinding
import me.meeshy.sdk.sync.RealtimeCacheApplier
import me.meeshy.sdk.sync.TranslationFailureApplier
import me.meeshy.sdk.translation.TranslationSocketRequester

/** Les échecs de traduction (état de bulle) et le tampon des demandes de traduction par socket. */
@Module
@InstallIn(SingletonComponent::class)
internal interface TranslationRealtimeModule {
    @Binds
    @IntoSet
    fun bindFailureApplier(applier: TranslationFailureApplier): RealtimeCacheApplier

    @Binds
    @IntoSet
    fun bindRequesterBinding(requester: TranslationSocketRequester): RealtimeBinding
}
