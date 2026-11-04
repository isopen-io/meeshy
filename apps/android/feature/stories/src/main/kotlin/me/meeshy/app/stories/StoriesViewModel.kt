package me.meeshy.app.stories

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.sdk.story.FailedStoryPublish
import me.meeshy.sdk.story.InMemoryStoryViewedLedger
import me.meeshy.sdk.story.PendingStoryPublish
import me.meeshy.sdk.publication.PublicationOutbox
import me.meeshy.sdk.story.StoryCoverStore
import me.meeshy.sdk.story.StoryMediaPins
import me.meeshy.sdk.story.StoryMediaPreloader
import me.meeshy.sdk.story.StoryRepository
import me.meeshy.sdk.story.StoryViewedLedger
import me.meeshy.sdk.story.toStoryGroups
import javax.inject.Inject

private data class TrayInputs(
    val result: me.meeshy.sdk.cache.CacheResult<List<ApiPost>>,
    val queue: me.meeshy.sdk.story.StoryPublishQueue,
    val user: me.meeshy.sdk.model.MeeshyUser?,
    val viewed: Map<String, Long>,
)

data class StoriesUiState(
    val tray: StoryTrayPresentation = StoryTrayPresentation(self = null, others = emptyList()),
    val isSyncing: Boolean = false,
    val showSkeleton: Boolean = false,
    val failedPublishes: List<StoryPublishFailures.Item> = emptyList(),
    /** Au moins une story à moi, active ou expirée : l'appui sur « Moi » mène alors à « Mes stories ». */
    val hasStoryHistory: Boolean = false,
    /** Le chargement a échoué : distinct de « aucune story » — le plateau propose Réessayer (iOS `loadFailure`). */
    val loadFailed: Boolean = false,
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
    private val socialSocket: SocialSocketManager,
    private val publications: PublicationOutbox,
    private val coverMemo: StoryCoverMemo = StoryCoverMemo(),
    private val coverStore: StoryCoverStore = StoryCoverStore.Empty,
    private val coverSignal: StoryCoverRenderSignal? = null,
    private val viewedLedger: StoryViewedLedger = InMemoryStoryViewedLedger(),
    private val mediaPreloader: StoryMediaPreloader? = null,
    private val mediaPins: StoryMediaPins? = null,
) : ViewModel() {

    private val _state = MutableStateFlow(StoriesUiState())
    val state: StateFlow<StoriesUiState> = _state.asStateFlow()

    /** Authoritative cached story list; the fallback when a sync carries no value yet. */
    private var rawStories: List<ApiPost> = emptyList()

    /** Temp ids of the publishes seen last emission — a vanished one delivered. */
    private var lastPendingIds: Set<String> = emptySet()

    /** Déclaré AVANT `init` : un initialiseur placé après lui remettrait le drapeau à `false`. */
    private var socialSubscribed = false

    init {
        viewModelScope.launch {
            combine(
                storyRepository.storiesStream(
                    onSyncError = {
                        _state.update { it.copy(showSkeleton = false, isSyncing = false, loadFailed = true) }
                    },
                ),
                storyRepository.publishQueue(),
                // La session peut se résoudre APRÈS la première émission du cache (démarrage
                // à froid) : la barre se recompose alors, sinon mes stories restent rangées
                // comme celles d'un autre auteur jusqu'à la prochaine émission.
                sessionRepository.currentUser,
                // Une couverture rendue après coup rafraîchit les cellules (iOS `StoryCoverRenderSignal`).
                coverSignal?.generation ?: flowOf(0),
                // Le registre durable des vues est une source DISTINCTE du cache : réinjecté à chaque reconstruction.
                viewedLedger.observe(),
            ) { result, queue, user, _, viewed -> TrayInputs(result, queue, user, viewed) }
                .catch { _state.update { it.copy(showSkeleton = false, isSyncing = false, loadFailed = true) } }
                .collectEachSafely { (result, queue, user, viewed) ->
                    val pending = queue.pending
                    val failed = queue.failed
                    reconcileDeliveredPublishes(pending, failed)
                    rawStories = StoryTrayReducer.stories(result, rawStories)
                    val flags = StoryTrayReducer.flags(result, rawStories.isNotEmpty())
                    val currentUserId = user?.id
                    val self = user?.let {
                        StoryOptimisticTray.SelfIdentity(it.id, it.effectiveDisplayName, it.avatar)
                    }
                    val merged = StoryOptimisticTray.merge(
                        cached = rawStories.withViewedLedger(viewed, currentUserId),
                        pending = StoryOptimisticTray.pendingStories(pending, self),
                    )
                    val groups = merged.toStoryGroups(currentUserId = currentUserId)
                    preloadAndPin(groups)
                    val tray = StoryTrayBuilder.build(
                        groups = groups,
                        currentUserId = currentUserId,
                        mediaBaseUrl = config.apiBaseUrl,
                        coverOf = { coverMemo.coverUrl(it, currentUserId, coverStore::localPath) },
                        localCoverOf = { coverMemo.localCover(it, currentUserId, coverStore::localPath) },
                    )
                    _state.update {
                        it.copy(
                            tray = tray,
                            isSyncing = flags.isSyncing,
                            showSkeleton = flags.showSkeleton,
                            loadFailed = it.loadFailed && result !is me.meeshy.sdk.cache.CacheResult.Fresh,
                            failedPublishes = StoryPublishFailures.from(failed),
                            hasStoryHistory = currentUserId != null &&
                                groups.any { g -> g.id == currentUserId && g.stories.isNotEmpty() },
                        )
                    }
                }
        }
        subscribeToSocialEvents()
    }

    /**
     * Abonnement unique aux événements sociaux du plateau (iOS `subscribeToSocketEvents`) : un second appel
     * (relance du composable racine) n'ajoute aucune souscription — les handlers à ±1 compteraient double.
     */
    fun subscribeToSocialEvents() {
        if (socialSubscribed) return
        socialSubscribed = true
        observeStoryDeletions()
        observeStoryUpdates()
        observeStoryCreations()
        observeStoryEngagement()
        observeReconnection()
    }

    /**
     * Reconnexion sociale : des stories ont pu être créées ou supprimées pendant la coupure (aucun rejeu côté
     * serveur). Le rattrapage est la revalidation par delta — curseur pris au moment de l'événement.
     */
    private fun observeReconnection() {
        viewModelScope.launch {
            socialSocket.reconnected.collectEachSafely { refreshQuietly() }
        }
    }

    /**
     * Les compteurs de la story tenue bougent en direct (iOS `story:viewed`, `story:reacted/unreacted`,
     * `comment:added/deleted`, `post:translation-updated`) : l'auteur voit son compteur de vues monter sans rafraîchir.
     */
    private fun observeStoryEngagement() {
        viewModelScope.launch {
            socialSocket.storyViewed.collectEachArrivedSafely { storyRepository.applyStoryViewed(it.storyId, it.viewCount) }
        }
        viewModelScope.launch {
            socialSocket.storyReacted.collectEachArrivedSafely {
                storyRepository.applyStoryReaction(it.storyId, it.emoji, it.userId, sessionRepository.currentUserId, 1)
            }
        }
        viewModelScope.launch {
            socialSocket.storyUnreacted.collectEachArrivedSafely {
                storyRepository.applyStoryReaction(it.storyId, it.emoji, it.userId, sessionRepository.currentUserId, -1)
            }
        }
        viewModelScope.launch {
            socialSocket.commentAdded.collectEachArrivedSafely { storyRepository.applyStoryCommentCount(it.postId, it.commentCount) }
        }
        viewModelScope.launch {
            socialSocket.commentDeleted.collectEachArrivedSafely { storyRepository.applyStoryCommentCount(it.postId, it.commentCount) }
        }
        viewModelScope.launch {
            socialSocket.postTranslationUpdated.collectEachArrivedSafely {
                storyRepository.applyStoryTranslation(it.postId, it.language, it.translation)
            }
        }
    }

    /** Dernière signature de plan : le plateau se ré-émet à chaque compteur, le préchargement ne repart que si les médias changent. */
    private var lastPreloadPlan: List<List<List<String>>>? = null

    /** Stories dont les médias sont déjà épinglés, et leurs données pour relâcher à la purge (iOS `releaseOfflineMedia`). */
    private val pinnedStories = HashMap<String, me.meeshy.sdk.model.StoryItem>()

    private fun preloadAndPin(groups: List<me.meeshy.sdk.model.StoryGroup>) {
        val plan = me.meeshy.sdk.model.story.StoryTrayPreloadPlan.of(groups)
        val signature = plan.map { stories -> stories.map { s -> listOf(s.isViewed.toString()) + s.media.map { it.url } } }
        if (signature != lastPreloadPlan) {
            lastPreloadPlan = signature
            mediaPreloader?.preload(plan)
        }
        val pins = mediaPins ?: return
        val toPin = groups.flatMap { it.stories }.filter { it.isViewed && it.id !in pinnedStories }
        if (toPin.isEmpty()) return
        toPin.forEach { pinnedStories[it.id] = it }
        viewModelScope.launch { toPin.forEach { runQuietly { pins.pin(it) } } }
    }

    private fun releasePins(storyIds: Collection<String>) {
        val pins = mediaPins ?: return
        val dead = storyIds.mapNotNull { pinnedStories.remove(it) }
        if (dead.isEmpty()) return
        viewModelScope.launch { dead.forEach { runQuietly { pins.release(it) } } }
    }

    private suspend fun runQuietly(block: suspend () -> Unit) {
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
        }
    }

    /** Balayage d'expiration (appelé chaque minute tant que le plateau est à l'écran) : les stories mortes sortent du cache. */
    fun sweepExpired() {
        viewModelScope.launch {
            try {
                releasePins(storyRepository.sweepExpired())
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
            }
        }
    }

    private suspend fun refreshQuietly() {
        try {
            storyRepository.refresh()
            _state.update { it.copy(loadFailed = false) }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
        }
    }

    /**
     * Folds a realtime `story:deleted` into the tray: the story is removed from the
     * authoritative Room cache and the cache-first stream repaints without it. The purge
     * is unconditional (no own-echo guard, unlike a reaction) — a story deleted on another
     * device must vanish for its author too. Mirrors iOS `StoryViewModel.storyDeleted`.
     */
    private fun observeStoryDeletions() {
        viewModelScope.launch {
            socialSocket.storyDeleted.collectEachArrivedSafely { payload ->
                storyRepository.removeCachedStory(payload.storyId)
                releasePins(listOf(payload.storyId))
            }
        }
    }

    /**
     * Folds a realtime `story:created` — a friend just posted — into the authoritative Room
     * cache, so their ring appears (unseen, first) without waiting for a revalidation. A story
     * already held (our own publish echoed back, a re-broadcast) is left as is. Mirrors iOS `StoryViewModel.storyCreated`.
     * A friend's republication in story arrives by `post:reposted` instead, and joins the same way.
     */
    private fun observeStoryCreations() {
        viewModelScope.launch {
            socialSocket.storyCreated.collectEachArrivedSafely { payload ->
                storyRepository.adoptAnnounced(payload.story)
            }
        }
        viewModelScope.launch {
            socialSocket.postReposted.collectEachArrivedSafely { payload ->
                storyRepository.adoptAnnouncedRepost(payload.repost)
            }
        }
    }

    /**
     * Folds a realtime `story:updated` into the tray: the edited story is merged onto the
     * authoritative Room cache (adopting the edit while keeping the reader's monotone seen
     * state, unless a content edit reset engagement) and the cache-first stream repaints.
     * The `engagementReset` flag and the current user id (the author-seen exception) are
     * resolved here; the merge law itself lives in the SDK. Mirrors iOS
     * `StoryViewModel.storyUpdated`.
     */
    private fun observeStoryUpdates() {
        viewModelScope.launch {
            socialSocket.storyUpdated.collectEachArrivedSafely { payload ->
                storyRepository.applyStoryUpdate(
                    updated = payload.story,
                    engagementReset = payload.engagementReset ?: false,
                    currentUserId = sessionRepository.currentUserId,
                )
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

    /**
     * Permanently discards a failed publish the user no longer wants to retry — with the media
     * bytes the device kept for it (#13417), which only this explicit gesture removes.
     */
    fun discardPublish(cmid: String) {
        viewModelScope.launch { publications.discard(cmid) }
    }

    /** Pull-to-refresh / retry. Background SWR keeps the visible tray; a failure just leaves the skeleton. */
    fun refresh() {
        viewModelScope.launch {
            try {
                storyRepository.refresh()
                _state.update { it.copy(loadFailed = false) }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                _state.update { it.copy(showSkeleton = false, isSyncing = false, loadFailed = true) }
            }
        }
    }
}
