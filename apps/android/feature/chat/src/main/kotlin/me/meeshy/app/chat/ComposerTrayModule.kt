package me.meeshy.app.chat

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet

@Module
@InstallIn(SingletonComponent::class)
abstract class ComposerTrayModule {

    @Binds
    @IntoSet
    abstract fun controller(impl: ComposerTrayController): ChatController
}
