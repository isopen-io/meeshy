package me.meeshy.sdk.story

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

@Module
@InstallIn(SingletonComponent::class)
interface StoryReactionModule {
    @Binds
    fun reactionPublisher(impl: StoryReactionDispatch): StoryReactionPublisher
}
