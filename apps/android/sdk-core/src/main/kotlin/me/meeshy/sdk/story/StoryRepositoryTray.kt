package me.meeshy.sdk.story

import kotlinx.coroutines.CancellationException
import me.meeshy.sdk.model.story.StoryNotificationTargetResolver
import me.meeshy.sdk.model.story.StoryNotificationTargetState
import me.meeshy.sdk.net.NetworkResult

/** Le plateau de [StoryRepository] vu par la porte : le groupe est l'auteur ; `fetchPost` charge ce que le plateau ignore. */
public class StoryRepositoryTray(
    private val repository: StoryRepository,
    private val nowMillis: () -> Long = System::currentTimeMillis,
) : StoryTrayResolving {
    override fun groupId(storyId: String): String? = repository.cachedPost(storyId)?.author?.id?.takeIf { it.isNotBlank() }

    override suspend fun ensureStoryLoaded(postId: String): Boolean =
        try {
            when (val result = repository.fetchPost(postId)) {
                is NetworkResult.Success ->
                    StoryNotificationTargetResolver.stateFor(result.data, nowMillis()) is StoryNotificationTargetState.Active
                is NetworkResult.Failure -> false
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            false
        }
}
