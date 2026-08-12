package me.meeshy.app.stories

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.FailedStoryPublish
import me.meeshy.sdk.story.PendingStoryPublish
import me.meeshy.sdk.story.StoryRepository
import me.meeshy.sdk.story.toStoryGroups
import javax.inject.Inject

data class StoriesUiState(
    val tray: StoryTrayPresentation = StoryTrayPresentation(self = null, others = emptyList()),
    val isSyncing: Boolean = false,
    val showSkeleton: Boolean = false,
    val failedPublishes: List<StoryPublishFailures.Item> = emptyList(),
)

/**
 * Drives the story tray from the Room-backed cache-first stream
 * ([StoryRepository.storiesStream]). Cache rows paint the tray instantly on a
 * warm start; the cold skeleton shows only on a genuinely empty cache (Instant
 * App principles). The pure [StoryTrayReducer] holds the SWR decisions.
 */
@HiltViewModel
class StoriesViewModel @Inject constructor(
    private val storyRepository: StoryRepository,
    private val sessionRepository: SessionRepository,
    private val config: MeeshyConfig,
    private val workManager: WorkManager,
) : ViewModel() {

    private val _state = MutableStateFlow(StoriesUiState())
    val state: StateFlow<StoriesUiState> = _state.asStateFlow()

    /** Authoritative cached story list; the fallback when a sync carries no value yet. */
    private var rawStories: List<ApiPost> = emptyList()

    /** Temp ids of the publishes seen last emission — a vanished one delivered. */
    private var lastPendingIds: Set<String> = emptySet()

    init {
        viewModelScope.launch {
            combine(
                storyRepository.storiesStream(
                    onSyncError = {
                        _state.update { it.copy(showSkeleton = false, isSyncing = false) }
                    },
                ),
                storyRepository.publishQueue(),
            ) { result, queue -> result to queue }
                .collect { (result, queue) ->
                    val pending = queue.pending
                    val failed = queue.failed
                    reconcileDeliveredPublishes(pending, failed)
                    rawStories = StoryTrayReducer.stories(result, rawStories)
                    val flags = StoryTrayReducer.flags(result, rawStories.isNotEmpty())
                    val user = sessionRepository.currentUser.value
                    val currentUserId = user?.id
                    val self = user?.let {
                        StoryOptimisticTray.SelfIdentity(it.id, it.effectiveDisplayName, it.avatar)
                    }
                    val merged = StoryOptimisticTray.merge(
                        cached = rawStories,
                        pending = StoryOptimisticTray.pendingStories(pending, self),
                    )
                    val tray = StoryTrayBuilder.build(
                        groups = merged.toStoryGroups(currentUserId = currentUserId),
                        currentUserId = currentUserId,
                        mediaBaseUrl = config.socketUrl,
                    )
                    _state.update {
                        it.copy(
                            tray = tray,
                            isSyncing = flags.isSyncing,
                            showSkeleton = flags.showSkeleton,
                            failedPublishes = StoryPublishFailures.from(failed),
                        )
                    }
                }
        }
    }

    /**
     * A publish present last emission but gone now was **delivered** (a succeeded
     * outbox row is deleted) — pull the real story in so the optimistic ring hands
     * off to it without waiting for the next background revalidation. A publish
     * that vanished into the [failed] set instead **exhausted**: it is surfaced as
     * a failure (retry/discard), never mistaken for a delivery, so no spurious
     * refresh fires.
     */
    private fun reconcileDeliveredPublishes(
        pending: List<PendingStoryPublish>,
        failed: List<FailedStoryPublish>,
    ) {
        val currentIds = pending.mapTo(HashSet()) { it.tempId }
        val failedIds = failed.mapTo(HashSet()) { it.tempId }
        val delivered = lastPendingIds.any { it !in currentIds && it !in failedIds }
        lastPendingIds = currentIds
        if (delivered) refresh()
    }

    /**
     * Revives an exhausted publish for another attempt and kicks the drain worker.
     * The failed item drops out of state as the row leaves `EXHAUSTED`.
     */
    fun retryPublish(cmid: String) {
        viewModelScope.launch {
            if (storyRepository.retryPublish(cmid)) {
                workManager.enqueue(OutboxFlushWorker.buildRequest())
            }
        }
    }

    /** Permanently discards a failed publish the user no longer wants to retry. */
    fun discardPublish(cmid: String) {
        viewModelScope.launch { storyRepository.discardPublish(cmid) }
    }

    /** Pull-to-refresh / retry. Background SWR keeps the visible tray; a failure just leaves the skeleton. */
    fun refresh() {
        viewModelScope.launch {
            try {
                storyRepository.refresh()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                _state.update { it.copy(showSkeleton = false, isSyncing = false) }
            }
        }
    }
}
