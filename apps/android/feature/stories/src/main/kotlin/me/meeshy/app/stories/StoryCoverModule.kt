package me.meeshy.app.stories

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

@Module
@InstallIn(SingletonComponent::class)
abstract class StoryCoverModule {
    @Binds
    abstract fun bindDraftCoverSink(impl: StoryCoverRenderer): StoryDraftCoverSink
}
