package me.meeshy.app.chat

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet

/** Contribue le temps réel du fil à l'écran de conversation (point d'extension `ChatController`). */
@Module
@InstallIn(SingletonComponent::class)
abstract class ChatRealtimeModule {

    @Binds
    @IntoSet
    abstract fun controller(impl: ChatRealtimeController): ChatController
}
