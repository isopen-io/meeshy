package me.meeshy.app.chat

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet

/** Contribue la relecture unique des vocaux sans transcription à l'écran de conversation (`ChatController`). */
@Module
@InstallIn(SingletonComponent::class)
abstract class ChatTranscriptionRetryModule {

    @Binds
    @IntoSet
    abstract fun transcriptionRetry(impl: ChatTranscriptionRetryController): ChatController
}
