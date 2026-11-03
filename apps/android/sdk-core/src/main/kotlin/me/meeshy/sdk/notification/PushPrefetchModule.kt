package me.meeshy.sdk.notification

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.story.StoryRepository

@Module
@InstallIn(SingletonComponent::class)
internal object PushPrefetchModule {
    @Provides
    fun postPrefetcher(stories: StoryRepository): PushPostPrefetcher = PushPostPrefetcher { stories.fetchPost(it) }
}
