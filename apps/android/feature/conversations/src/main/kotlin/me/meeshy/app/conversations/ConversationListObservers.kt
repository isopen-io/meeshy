package me.meeshy.app.conversations

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.category.CategoryRepository
import me.meeshy.sdk.model.UserCategoryCatalog
import me.meeshy.sdk.socket.CategorySocketManager
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.TypingPresenceRelay
import me.meeshy.sdk.status.StatusBarCache
import me.meeshy.sdk.status.StatusFeedMode
import me.meeshy.sdk.story.StoryRepository
import me.meeshy.sdk.story.toStoryGroups

/**
 * Observateurs decoratifs de la liste : catalogue de categories, presence, frappe,
 * anneaux de story et humeur. Tous tournent dans le [scope] du ViewModel.
 */
internal class ConversationListObservers(
    private val scope: CoroutineScope,
    private val state: MutableStateFlow<ConversationListUiState>,
    private val messageSocketManager: MessageSocketManager,
    private val typingPresenceRelay: TypingPresenceRelay,
    private val categoryRepository: CategoryRepository,
    private val categorySocketManager: CategorySocketManager,
    private val storyRepository: StoryRepository,
    private val statusBarCache: StatusBarCache,
) {

    /** Corpus vivant des categories : re-seme par le cache, plie par les evenements socket. */
    private var categoryCatalog: UserCategoryCatalog = UserCategoryCatalog.EMPTY

    /** Minuteries de securite de frappe, par `(conversationId, userId)`. */
    private val typingCleanupJobs = mutableMapOf<String, Job>()

    /** Hydratation cache-first du catalogue puis evenements temps reel. */
    fun startCategories() {
        scope.launch {
            categoryRepository.categoriesStream().collect { categories ->
                categoryCatalog = UserCategoryCatalog.of(categories)
                publishCategories()
            }
        }
        scope.launch {
            categorySocketManager.categoryEvents.collect { event ->
                categoryCatalog = categoryCatalog.apply(event)
                publishCategories()
            }
        }
    }

    /** Presence, frappe, anneaux de story, humeur (demarres tot : flux chauds sans rejeu). */
    fun startLive() {
        observePresence()
        observeTyping()
        observeStoryGroups()
        paintMoodStatusesFromCache()
    }

    private fun publishCategories() {
        state.update { it.copy(categories = categoryCatalog.sorted) }
    }

    private fun paintMoodStatusesFromCache() {
        val statuses = statusBarCache.load(StatusFeedMode.FRIENDS).valueOrNull.orEmpty()
        if (statuses != state.value.moodStatuses) {
            state.update { it.copy(moodStatuses = statuses) }
        }
    }

    private fun observeStoryGroups() {
        scope.launch {
            storyRepository.storiesStream(onSyncError = { }).collect { result ->
                val posts = when (result) {
                    is CacheResult.Fresh -> result.value
                    is CacheResult.Stale -> result.value
                    is CacheResult.Syncing -> result.value
                    CacheResult.Empty -> null
                } ?: return@collect
                val groups = posts.toStoryGroups(currentUserId = state.value.currentUserId)
                state.update { it.copy(storyGroups = groups) }
            }
        }
    }

    private fun observePresence() {
        scope.launch {
            messageSocketManager.userStatus.collect { event ->
                state.update { it.copy(presenceByUserId = it.presenceByUserId + (event.userId to event)) }
            }
        }
        scope.launch {
            typingPresenceRelay.forcedOnline.collect { event ->
                state.update { it.copy(presenceByUserId = it.presenceByUserId + (event.userId to event)) }
            }
        }
        scope.launch {
            messageSocketManager.presenceSnapshot.collect { snapshot ->
                state.update {
                    it.copy(presenceByUserId = it.presenceByUserId + snapshot.users.associateBy { u -> u.userId })
                }
            }
        }
    }

    private fun observeTyping() {
        scope.launch {
            messageSocketManager.typingStarted.collect { event ->
                val before = state.value.typers
                val after = ConversationTypingRoster.started(before, event, state.value.currentUserId)
                if (after === before) return@collect
                state.update { it.copy(typers = after) }
                armTypingCleanup(event.conversationId, event.userId)
            }
        }
        scope.launch {
            messageSocketManager.typingStopped.collect { event ->
                typingCleanupJobs.remove("${event.conversationId} ${event.userId}")?.cancel()
                state.update {
                    it.copy(typers = ConversationTypingRoster.stopped(it.typers, event.conversationId, event.userId))
                }
            }
        }
    }

    private fun armTypingCleanup(conversationId: String, userId: String) {
        val key = "$conversationId $userId"
        typingCleanupJobs.remove(key)?.cancel()
        typingCleanupJobs[key] = scope.launch {
            delay(TYPING_SAFETY_TIMEOUT_MS)
            state.update {
                it.copy(typers = ConversationTypingRoster.stopped(it.typers, conversationId, userId))
            }
            typingCleanupJobs.remove(key)
        }
    }

    private companion object {
        /** iOS parity: a typer with no `typing:stop` is force-cleared after 15 seconds. */
        const val TYPING_SAFETY_TIMEOUT_MS = 15_000L
    }
}
