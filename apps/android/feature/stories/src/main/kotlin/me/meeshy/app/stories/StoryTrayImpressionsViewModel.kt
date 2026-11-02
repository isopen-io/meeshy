package me.meeshy.app.stories

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import me.meeshy.sdk.model.analytics.ContentSurface
import me.meeshy.sdk.model.analytics.ImpressionSource
import me.meeshy.sdk.post.FeedEngagementRepository
import me.meeshy.sdk.post.ImpressionBatcher
import javax.inject.Inject

/**
 * Compte une impression par anneau apparu : source `story`, surface `story_rail`, par
 * `POST /social/events` — exactement `SharedImpressionBatchers.storyRail` d'iOS (#12483).
 */
@HiltViewModel
class StoryTrayImpressionsViewModel @Inject constructor(
    engagement: FeedEngagementRepository,
) : ViewModel() {

    private val batcher = ImpressionBatcher(
        source = ImpressionSource.STORY,
        surface = ContentSurface.STORY_RAIL,
        deliver = engagement::deliver,
    )

    fun onRingAppeared(storyId: String?) {
        if (storyId != null) batcher.record(storyId)
    }

    override fun onCleared() {
        batcher.flushNowAsync()
    }
}
