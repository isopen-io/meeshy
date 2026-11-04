package me.meeshy.sdk.story

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.ObjectIdGuard
import me.meeshy.sdk.model.analytics.ContentSurface
import me.meeshy.sdk.model.analytics.ImpressionSource
import me.meeshy.sdk.post.FeedEngagementRepository
import me.meeshy.sdk.post.ImpressionBatcher

/** Une impression par slide de story affichée — chaque visionnage compte, contrairement à la vue (une par story). */
public fun interface StorySlideImpressions {
    public fun record(storyId: String)

    public companion object {
        public val None: StorySlideImpressions = StorySlideImpressions { }
    }
}

/**
 * Les impressions de slides partent groupées par `POST /social/events` (source `story`, surface `story`), comme
 * `recordStoryImpression` d'iOS (C3, #10399). Le groupeur est partagé et survit au lecteur : sa fenêtre part même
 * quand on vient de le fermer. Un identifiant local (story encore en file de publication) n'est jamais compté.
 */
@Singleton
public class BatchedStorySlideImpressions @Inject constructor(
    engagement: FeedEngagementRepository,
) : StorySlideImpressions {

    private val batcher = ImpressionBatcher(
        source = ImpressionSource.STORY,
        surface = ContentSurface.STORY,
        deliver = engagement::deliver,
    )

    override fun record(storyId: String) {
        if (ObjectIdGuard.isValid(storyId)) batcher.record(storyId)
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface StorySlideImpressionsModule {
    @Binds
    fun slideImpressions(impl: BatchedStorySlideImpressions): StorySlideImpressions
}
