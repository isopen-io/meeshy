package me.meeshy.sdk.post

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.navigation.DetailOpenSource
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.story.StoryRepository
import me.meeshy.sdk.story.StoryRepositoryTray
import me.meeshy.sdk.story.StoryTrayResolving
import javax.inject.Singleton

/** Les portes de contenu (réel, story) et la marque d'entrée d'un détail. */
@Module
@InstallIn(SingletonComponent::class)
public object ContentDoorsModule {
    @Provides
    @Singleton
    public fun detailOpenSource(): DetailOpenSource = DetailOpenSource()

    @Provides
    public fun reelPostSource(posts: PostRepository): ReelPostSource = object : ReelPostSource {
        override suspend fun cached(postId: String): ApiPost? = posts.knownPost(postId)
        override suspend fun fetch(postId: String): NetworkResult<ApiPost> = posts.getPost(postId)
    }

    @Provides
    public fun reelNotificationOpener(source: ReelPostSource): ReelNotificationOpener = ReelNotificationOpener(source)

    @Provides
    public fun storyTray(stories: StoryRepository): StoryTrayResolving = StoryRepositoryTray(stories)
}
