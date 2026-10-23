package me.meeshy.app.stories

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import me.meeshy.sdk.post.ImpressionBatcher
import me.meeshy.sdk.post.PostRepository
import javax.inject.Inject

/** Compte une impression par anneau apparu, source `story-rail` — port des batchers de rail iOS. */
@HiltViewModel
class StoryTrayImpressionsViewModel @Inject constructor(
    postRepository: PostRepository,
) : ViewModel() {

    private val batcher = ImpressionBatcher(source = "story-rail", postRepository = postRepository)

    fun onRingAppeared(storyId: String?) {
        if (storyId != null) batcher.record(storyId)
    }

    override fun onCleared() {
        batcher.flushNowAsync()
    }
}
