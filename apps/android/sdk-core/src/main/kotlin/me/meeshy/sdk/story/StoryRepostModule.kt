package me.meeshy.sdk.story

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

@Module
@InstallIn(SingletonComponent::class)
interface StoryRepostModule {
    @Binds
    fun repostPublisher(impl: StoryDirectRepost): StoryRepostPublisher
}
