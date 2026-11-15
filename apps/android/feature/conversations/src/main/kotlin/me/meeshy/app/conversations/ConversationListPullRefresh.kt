package me.meeshy.app.conversations

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import me.meeshy.sdk.category.CategoryRepository
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.status.StatusFeedMode
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.status.StatusBarCache
import me.meeshy.sdk.status.StatusRepository
import me.meeshy.sdk.story.StoryRepository

/**
 * What a pull-to-refresh of the list reloads BESIDE the conversations (iOS
 * `ConversationListView` `onRefresh`: conversations, stories, moods and the user's groupings
 * at once): the stories tray, the friends' mood statuses and the category catalogue. They
 * run together, and a failure of one never fails the gesture — the conversation refresh
 * alone speaks for it.
 */
internal class ConversationListPullRefresh(
    private val storyRepository: StoryRepository,
    private val statusRepository: StatusRepository,
    private val statusBarCache: StatusBarCache,
    private val categoryRepository: CategoryRepository,
) {
    suspend fun refreshSurroundings(onMoods: (List<StatusEntry>) -> Unit) = coroutineScope {
        launch { quietly { storyRepository.refresh() } }
        launch { quietly { categoryRepository.refresh() } }
        launch {
            quietly {
                val page = statusRepository.list(mode = StatusFeedMode.FRIENDS)
                if (page is NetworkResult.Success) {
                    statusBarCache.save(StatusFeedMode.FRIENDS, page.data.statuses)
                    onMoods(page.data.statuses)
                }
            }
        }
    }

    /**
     * The same three reloads, each one THROWING on failure, for [me.meeshy.sdk.conversation.ListRefreshCoordinator]:
     * it runs them beside the conversations and invalidates the neighbour caches only when every one
     * of them came back.
     */
    fun reloads(onMoods: (List<StatusEntry>) -> Unit): List<suspend () -> Unit> = listOf<suspend () -> Unit>(
        { storyRepository.refresh() },
        { categoryRepository.refresh() },
        {
            val page = statusRepository.list(mode = StatusFeedMode.FRIENDS)
            if (page !is NetworkResult.Success) throw IllegalStateException("statuses not refreshed")
            statusBarCache.save(StatusFeedMode.FRIENDS, page.data.statuses)
            onMoods(page.data.statuses)
        },
    )

    private suspend fun quietly(block: suspend () -> Unit) {
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // A side source that fails keeps its cache on screen; the gesture still ends.
        }
    }
}
