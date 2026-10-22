package me.meeshy.app.stories

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MyStoriesSelection
import me.meeshy.sdk.model.MyStoriesTab
import me.meeshy.sdk.model.MyStoriesTabResolver
import me.meeshy.sdk.model.MyStoryDeleteConfirmation
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.sdk.story.StoryRepository
import me.meeshy.sdk.story.isExpired
import me.meeshy.sdk.story.toStoryItem
import javax.inject.Inject

/** Une story du lot avec le compteur de vues que `StoryItem` ne porte pas. */
@Immutable
data class MyStoryEntry(val item: StoryItem, val viewCount: Int) {
    val id: String get() = item.id
}

/** Une suppression en attente de confirmation : la cible décide du libellé. */
@Immutable
data class PendingMyStoryDelete(
    val target: MyStoryDeleteConfirmation.Target,
    val storyId: String?,
)

@Immutable
data class MyStoriesUiState(
    val active: List<MyStoryEntry> = emptyList(),
    val archived: List<MyStoryEntry> = emptyList(),
    val tab: MyStoriesTab = MyStoriesTab.PUBLISHED,
    val visibleTabs: List<MyStoriesTab> = MyStoriesTabResolver.visibleTabs(false, false),
    val hasQueueWork: Boolean = false,
    /** Squelette seulement sur un cache froid : jamais de spinner devant des stories déjà là. */
    val showSkeleton: Boolean = true,
    val isSelecting: Boolean = false,
    val selectedIds: Set<String> = emptySet(),
    val pendingDelete: PendingMyStoryDelete? = null,
    val isRepublishing: Boolean = false,
)

sealed interface MyStoriesUiEvent {
    data class SelectTab(val tab: MyStoriesTab) : MyStoriesUiEvent
    data object ToggleSelecting : MyStoriesUiEvent
    data class ToggleSelected(val storyId: String) : MyStoriesUiEvent
    data class RequestDelete(val storyId: String) : MyStoriesUiEvent
    data object RequestBulkDelete : MyStoriesUiEvent
    data object ConfirmDelete : MyStoriesUiEvent
    data object DismissDelete : MyStoriesUiEvent
    data class Republish(val storyId: String) : MyStoriesUiEvent
    data object Refresh : MyStoriesUiEvent
}

sealed interface MyStoriesUiEffect {
    data object StoryDeleted : MyStoriesUiEffect
    data object DeleteFailed : MyStoriesUiEffect
    data object BulkDeleted : MyStoriesUiEffect
    data class BulkDeleteFailed(val failures: Int) : MyStoriesUiEffect
    data object Republished : MyStoriesUiEffect
    data object RepublishFailed : MyStoriesUiEffect
}

/**
 * « Mes stories » — port du comportement de `MyStoriesView` / `StoryViewModel.loadMyStoriesArchive`.
 * Cache d'abord : l'archive drainée précédemment peint l'écran sans attendre ; le plateau en direct
 * et le drain réseau la complètent. La sélection est TOUJOURS relue contre les stories affichées.
 * Suppression optimiste avec retour arrière sur échec.
 */
@HiltViewModel
class MyStoriesViewModel internal constructor(
    private val storyRepository: StoryRepository,
    private val sessionRepository: SessionRepository,
    private val socialSocket: SocialSocketManager,
    private val now: () -> Long,
) : ViewModel() {

    @Inject
    constructor(
        storyRepository: StoryRepository,
        sessionRepository: SessionRepository,
        socialSocket: SocialSocketManager,
    ) : this(storyRepository, sessionRepository, socialSocket, System::currentTimeMillis)

    private val _state = MutableStateFlow(MyStoriesUiState())
    val state: StateFlow<MyStoriesUiState> = _state.asStateFlow()

    private val _effects = Channel<MyStoriesUiEffect>(Channel.BUFFERED)
    val effects = _effects.receiveAsFlow()

    private var fresh: List<ApiPost> = emptyList()
    private var archive: List<ApiPost> = emptyList()
    private var hasWork = false
    private var tabChosen = false
    private var loaded = false
    private var trayReady = false

    init {
        viewModelScope.launch { loadCachedArchive() }
        viewModelScope.launch { observeTrayAndQueue() }
        viewModelScope.launch { observeDeletedElsewhere() }
        viewModelScope.launch { drainArchive() }
    }

    fun onEvent(event: MyStoriesUiEvent) {
        when (event) {
            is MyStoriesUiEvent.SelectTab -> _state.update { it.copy(tab = event.tab) }
            MyStoriesUiEvent.ToggleSelecting -> toggleSelecting()
            is MyStoriesUiEvent.ToggleSelected -> toggleSelected(event.storyId)
            is MyStoriesUiEvent.RequestDelete -> _state.update {
                it.copy(pendingDelete = PendingMyStoryDelete(MyStoryDeleteConfirmation.Target.PUBLISHED_STORY, event.storyId))
            }
            MyStoriesUiEvent.RequestBulkDelete -> requestBulkDelete()
            MyStoriesUiEvent.ConfirmDelete -> confirmDelete()
            MyStoriesUiEvent.DismissDelete -> _state.update { it.copy(pendingDelete = null) }
            is MyStoriesUiEvent.Republish -> republish(event.storyId)
            MyStoriesUiEvent.Refresh -> viewModelScope.launch { drainArchive() }
        }
    }

    private suspend fun loadCachedArchive() {
        archive = ownOnly(storyRepository.cachedMyStories().orEmpty())
        if (archive.isNotEmpty()) rebuild(coldDone = true)
    }

    private suspend fun observeTrayAndQueue() {
        combine(
            storyRepository.storiesStream(onSyncError = {
                trayReady = true
                rebuild(coldDone = true)
            }),
            storyRepository.publishQueue(),
        ) { result, queue -> result to queue }.collect { (result, queue) ->
            val posts = result.valueOrNull
            posts?.let { fresh = ownOnly(it) }
            hasWork = queue.pending.isNotEmpty() || queue.failed.isNotEmpty()
            trayReady = true
            rebuild(coldDone = posts != null)
        }
    }

    private suspend fun observeDeletedElsewhere() {
        socialSocket.storyDeleted.collect { payload ->
            try {
                fresh = fresh.filterNot { it.id == payload.storyId }
                archive = archive.filterNot { it.id == payload.storyId }
                rebuild(coldDone = true)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
            }
        }
    }

    private suspend fun drainArchive() {
        when (val result = storyRepository.drainMyStories()) {
            is NetworkResult.Success -> if (result.data.isNotEmpty()) archive = ownOnly(result.data)
            is NetworkResult.Failure -> Unit
        }
        rebuild(coldDone = true)
    }

    private fun ownOnly(posts: List<ApiPost>): List<ApiPost> {
        val me = sessionRepository.currentUserId ?: return posts
        return posts.filter { it.author == null || it.author?.id == me }
    }

    private fun rebuild(coldDone: Boolean) {
        if (coldDone) loaded = true
        val nowMillis = now()
        val entries = MyStoriesSelection.merge(fresh, archive)
            .map { MyStoryEntry(it.toStoryItem(), it.viewCount ?: 0) }
        val (archived, active) = entries.partition { it.item.isExpired(nowMillis) }
        _state.update { current ->
            val visible = MyStoriesTabResolver.visibleTabs(hasWork, archived.isNotEmpty())
            val tab = when {
                !tabChosen && loaded && trayReady -> {
                    tabChosen = true
                    MyStoriesTabResolver.initialTab(active.isNotEmpty(), hasWork, hasDraftWork = false)
                }
                else -> MyStoriesTabResolver.tabAfterContentChange(current.tab, visible)
            }
            val live = (active + archived).map { it.id }
            current.copy(
                active = active,
                archived = archived,
                hasQueueWork = hasWork,
                visibleTabs = visible,
                tab = tab,
                showSkeleton = !loaded && entries.isEmpty(),
                selectedIds = MyStoriesSelection.liveSelection(current.selectedIds, live),
            )
        }
    }

    private fun toggleSelecting() = _state.update {
        if (it.isSelecting) it.copy(isSelecting = false, selectedIds = emptySet()) else it.copy(isSelecting = true)
    }

    private fun toggleSelected(id: String) = _state.update {
        if (!it.isSelecting) it else it.copy(selectedIds = if (id in it.selectedIds) it.selectedIds - id else it.selectedIds + id)
    }

    private fun requestBulkDelete() = _state.update {
        if (it.selectedIds.isEmpty()) it
        else it.copy(pendingDelete = PendingMyStoryDelete(MyStoryDeleteConfirmation.Target.BULK_SELECTION, null))
    }

    private fun confirmDelete() {
        val pending = _state.value.pendingDelete ?: return
        _state.update { it.copy(pendingDelete = null) }
        when (pending.target) {
            MyStoryDeleteConfirmation.Target.BULK_SELECTION -> deleteSelected()
            else -> pending.storyId?.let { id -> viewModelScope.launch { deleteOne(id, notify = true) } }
        }
    }

    private fun deleteSelected() {
        val ids = _state.value.selectedIds
        if (ids.isEmpty()) return
        viewModelScope.launch {
            val failures = ids.count { !deleteOne(it, notify = false) }
            _state.update {
                val remaining = it.selectedIds - ids
                it.copy(selectedIds = remaining, isSelecting = remaining.isNotEmpty() && it.isSelecting)
            }
            _effects.send(if (failures == 0) MyStoriesUiEffect.BulkDeleted else MyStoriesUiEffect.BulkDeleteFailed(failures))
        }
    }

    /** Optimiste : la story sort de la liste tout de suite, revient si le serveur refuse. */
    private suspend fun deleteOne(id: String, notify: Boolean): Boolean {
        val previousFresh = fresh
        val previousArchive = archive
        fresh = fresh.filterNot { it.id == id }
        archive = archive.filterNot { it.id == id }
        rebuild(coldDone = true)
        val ok = storyRepository.delete(id) is NetworkResult.Success
        if (ok) {
            storyRepository.removeCachedStory(id)
            storyRepository.persistMyStories(archive)
        } else {
            fresh = (fresh + previousFresh.filter { it.id == id }).distinctBy { it.id }
            archive = (archive + previousArchive.filter { it.id == id }).distinctBy { it.id }
            rebuild(coldDone = true)
        }
        if (notify) _effects.send(if (ok) MyStoriesUiEffect.StoryDeleted else MyStoriesUiEffect.DeleteFailed)
        return ok
    }

    private fun republish(id: String) {
        if (_state.value.isRepublishing) return
        _state.update { it.copy(isRepublishing = true) }
        viewModelScope.launch {
            when (val result = storyRepository.republish(id)) {
                is NetworkResult.Success -> {
                    val post = result.data
                    fresh = fresh.map { if (it.id == post.id) post else it }
                    archive = archive.map { if (it.id == post.id) post else it }
                    if (fresh.none { it.id == post.id } && archive.none { it.id == post.id }) archive = archive + post
                    rebuild(coldDone = true)
                    storyRepository.persistMyStories(archive)
                    _effects.send(MyStoriesUiEffect.Republished)
                }
                is NetworkResult.Failure -> _effects.send(MyStoriesUiEffect.RepublishFailed)
            }
            _state.update { it.copy(isRepublishing = false) }
        }
    }
}
