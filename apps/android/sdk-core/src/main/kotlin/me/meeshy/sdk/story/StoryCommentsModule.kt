package me.meeshy.sdk.story

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.session.PerAccountCache

@Module
@InstallIn(SingletonComponent::class)
abstract class StoryCommentsModule {
    @Binds
    abstract fun bindStoryCommentsCache(impl: InMemoryStoryCommentsCache): StoryCommentsCache

    @Binds
    @IntoSet
    abstract fun bindStoryCommentsAccountCache(impl: InMemoryStoryCommentsCache): PerAccountCache
}
