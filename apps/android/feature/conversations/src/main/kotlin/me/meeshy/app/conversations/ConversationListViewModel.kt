package me.meeshy.app.conversations

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.category.CategoryRepository
import me.meeshy.sdk.chat.ConversationDraftStore
import me.meeshy.sdk.chat.StarredMessagesStore
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.lock.ConversationLockStore
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.CategoryOption
import me.meeshy.sdk.model.ConversationDraft
import me.meeshy.sdk.model.ConversationFilter
import me.meeshy.sdk.model.ConversationFilters
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.PresenceSnapshotEvent
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.UserCategoryCatalog
import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.UserStatusEvent
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.CategorySocketManager
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.SocketConnectionState
import me.meeshy.sdk.socket.SocketManager
import me.meeshy.sdk.theme.otherParticipantUserId
import javax.inject.Inject

data class ConversationListUiState(
    val conversations: List<ApiConversation> = emptyList(),
    val isSyncing: Boolean = false,
    val isUserRefreshing: Boolean = false,
    val showSkeleton: Boolean = false,
    val errorMessage: String? = null,
    val connection: SocketConnectionState = SocketConnectionState.DISCONNECTED,
    val currentUserId: String? = null,
    /**
     * The signed-in identity, kept alongside [currentUserId] so the preview
     * card can resolve the Prisme Linguistique ([me.meeshy.sdk.model.MeeshyUser]
     * implements [me.meeshy.sdk.lang.LanguageResolver.ContentLanguagePreferences])
     * without a second session read at render time.
     */
    val currentUser: MeeshyUser? = null,
    val selectedFilter: ConversationFilter = ConversationFilter.ALL,
    val searchText: String = "",
    val isSearchActive: Boolean = false,
    val drafts: Map<String, ConversationDraft> = emptyMap(),
    /**
     * The user's conversation-category catalogue (parity iOS `userCategories`), the
     * section source consumed by [ConversationSections.of]. Empty until the tracked
     * corpus-hydration slice populates it (cache-first + revalidate); an empty
     * catalogue keeps the list on the pinned/all split, so this is a safe default.
     */
    val categories: List<CategoryOption> = emptyList(),
    /**
     * The hard-press preview card's most-recent messages, keyed by conversation
     * id — populated once on demand ([ConversationListViewModel.loadPreviewMessages])
     * rather than eagerly for every row. Absent key = not loaded yet (or in
     * flight); present-but-empty = loaded, genuinely no cached messages.
     */
    val previewMessages: Map<String, List<LocalMessage>> = emptyMap(),
    /**
     * Live `user:status`/`presence:snapshot` frames, keyed by userId — see
     * [ConversationListViewModel.observePresence]. A userId absent here has no
     * live presence data yet (a genuinely cold cache, not an error): `ApiConversation
     * .participants` carries no `isOnline`/`lastActiveAt` fields at all, so there is
     * no REST-fetched fallback to fall back to, unlike the Contacts roster.
     */
    val presenceByUserId: Map<String, UserStatusEvent> = emptyMap(),
    /**
     * Live mirror of [me.meeshy.sdk.lock.ConversationLockStore.lockedConversationIdsFlow] —
     * port of iOS `ConversationListView` observing `ConversationLockManager` directly so a
     * lock/unlock re-evaluates every row (see `ConversationListView+Rows.swift`'s
     * `ConversationRowItem.==`, which compares swipe-action icons for exactly this reason).
     * Data plumbing only: UI wiring (hiding content, swapping the swipe action, the PIN entry
     * flow) is a deliberately deferred follow-up — see NOTES.md/PROGRESS.md for this slice.
     */
    val lockedConversationIds: Set<String> = emptySet(),
) {
    val banner: ConnectionBanner get() = bannerFor(connection, isSyncing)

    /** The persisted draft for [conversationId], if the composer holds one — drives the row's "Draft: …" preview. */
    fun draftFor(conversationId: String): ConversationDraft? = drafts[conversationId]

    /** The preview card's cached messages for [conversationId], or `null` while not yet loaded. */
    fun previewFor(conversationId: String): List<LocalMessage>? = previewMessages[conversationId]

    /**
     * The live presence state for [conversation]'s other participant, or `null` for a
     * group/community/channel/bot conversation, or when nothing has arrived for them yet.
     * UI wiring (the actual dot on the row/header) is a deliberately deferred follow-up —
     * see `NOTES.md`/`PROGRESS.md` for this slice.
     */
    fun presenceStateFor(conversation: ApiConversation, nowEpochMillis: Long): PresenceState? {
        val otherId = conversation.otherParticipantUserId(currentUserId) ?: return null
        val event = presenceByUserId[otherId] ?: return null
        return UserPresence(isOnline = event.isOnline, lastActiveAt = event.lastActiveAt).state(nowEpochMillis)
    }

    /** True when a filter/search is narrowing the list yet nothing matches — distinct from a cold-empty cache. */
    val isFilteredEmpty: Boolean
        get() = conversations.isEmpty() && !showSkeleton && errorMessage == null &&
            (selectedFilter != ConversationFilter.ALL || searchText.isNotBlank())
}

@HiltViewModel
class ConversationListViewModel @Inject constructor(
    private val repository: ConversationRepository,
    private val messageRepository: MessageRepository,
    private val messageSocketManager: MessageSocketManager,
    private val workManager: WorkManager,
    private val draftStore: ConversationDraftStore,
    private val starredStore: StarredMessagesStore,
    private val categoryRepository: CategoryRepository,
    categorySocketManager: CategorySocketManager,
    socketManager: SocketManager,
    sessionRepository: SessionRepository,
    private val lockStore: ConversationLockStore,
) : ViewModel() {

    private val _state = MutableStateFlow(ConversationListUiState())
    val state: StateFlow<ConversationListUiState> = _state.asStateFlow()

    /** Authoritative, unfiltered cache list; [ConversationListUiState.conversations] is the filtered view. */
    private var rawConversations: List<ApiConversation> = emptyList()

    /**
     * The live category corpus (parity iOS `UserCategoryStore.categoriesById`). Cache-first
     * hydration re-seeds it from the server snapshot; real-time socket events fold onto it in
     * place. Its [UserCategoryCatalog.sorted] view is what the section splitter reads via
     * [ConversationListUiState.categories]. Both collectors run on the same (Main) dispatcher,
     * so the read-modify-write is serialized — the same single-writer discipline as
     * [rawConversations].
     */
    private var categoryCatalog: UserCategoryCatalog = UserCategoryCatalog.EMPTY

    init {
        viewModelScope.launch {
            repository.conversationsStream(
                onSyncError = { error ->
                    _state.update {
                        it.copy(errorMessage = error.message, showSkeleton = false, isSyncing = false)
                    }
                },
            ).collect { result ->
                rawConversations = result.rawListOr(rawConversations)
                _state.update { it.applyResultFlags(result, rawConversations).withVisible(rawConversations) }
            }
        }

        viewModelScope.launch {
            socketManager.connectionState.collect { connection ->
                _state.update { it.copy(connection = connection) }
            }
        }

        viewModelScope.launch {
            sessionRepository.currentUser.collect { user ->
                _state.update {
                    it.copy(currentUserId = user?.id, currentUser = user).withVisible(rawConversations)
                }
            }
        }

        viewModelScope.launch {
            draftStore.observeAll().collect { drafts ->
                _state.update { it.copy(drafts = drafts).withVisible(rawConversations) }
            }
        }

        viewModelScope.launch {
            lockStore.lockedConversationIdsFlow.collect { ids ->
                _state.update { it.copy(lockedConversationIds = ids) }
            }
        }

        viewModelScope.launch {
            // Cache-first catalogue hydration: the section splitter renders user
            // categories once the snapshot (then the background revalidation) lands.
            // Each emission re-seeds the live catalogue with server truth (which already
            // reflects any socket changes it has persisted). Failures stay silent — an
            // empty catalogue keeps the pinned/all split.
            categoryRepository.categoriesStream().collect { categories ->
                categoryCatalog = UserCategoryCatalog.of(categories)
                publishCategories()
            }
        }

        viewModelScope.launch {
            // Real-time category changes (created/updated/deleted/reordered) fold onto the
            // live catalogue between hydrations, so the list re-buckets the instant another
            // device edits the corpus (parity iOS `UserCategoryStore.applyRemote`).
            categorySocketManager.categoryEvents.collect { event ->
                categoryCatalog = categoryCatalog.apply(event)
                publishCategories()
            }
        }

        viewModelScope.launch {
            launch {
                messageSocketManager.unreadUpdated.collect {
                    refreshSilently()
                }
            }
            launch {
                messageSocketManager.messageReceived.collect {
                    refreshSilently()
                }
            }
            launch {
                messageSocketManager.conversationUpdated.collect {
                    refreshSilently()
                }
            }
            launch {
                messageSocketManager.conversationDeleted.collect { event ->
                    ConversationPurge.onConversationDeleted(event)?.let(::purge)
                }
            }
            launch {
                messageSocketManager.participantLeft.collect { event ->
                    ConversationPurge.onParticipantLeft(event, _state.value.currentUserId)?.let(::purge)
                }
            }
        }

        observePresence()
    }

    /**
     * Overlays live `user:status`/`presence:snapshot` frames into
     * [ConversationListUiState.presenceByUserId] — started eagerly here (not lazily
     * on first row render): [MessageSocketManager]'s flows are hot `SharedFlow`s with
     * no replay, so a late subscriber genuinely misses events (mirrors the identical
     * `ContactsListViewModel.observePresence` precedent, `presence-live-contacts-
     * overlay` slice). UI wiring (the actual dot on the row/header) is a deliberately
     * deferred follow-up — this slice is the data plumbing only.
     */
    private fun observePresence() {
        viewModelScope.launch {
            messageSocketManager.userStatus.collect { event ->
                _state.update { it.copy(presenceByUserId = it.presenceByUserId + (event.userId to event)) }
            }
        }
        viewModelScope.launch {
            messageSocketManager.presenceSnapshot.collect { snapshot ->
                _state.update {
                    it.copy(presenceByUserId = it.presenceByUserId + snapshot.users.associateBy { u -> u.userId })
                }
            }
        }
    }

    /** Pushes the live catalogue's display-ordered snapshot onto the section source. */
    private fun publishCategories() {
        _state.update { it.copy(categories = categoryCatalog.sorted) }
    }

    /**
     * Purges a removed conversation from local state. The star cleanup runs
     * first and synchronously — local-only, so a bookmark can never outlive the
     * conversation it points at even if the follow-up refresh fails — then a
     * refresh drops the vanished row from the list. A refresh failure is
     * swallowed silently (background revalidation stays quiet; the SWR stream
     * keeps the last good cache); cancellation is rethrown.
     */
    private fun purge(conversationId: String) {
        starredStore.removeConversation(conversationId)
        viewModelScope.launch {
            try {
                repository.refresh()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // Silent: a failed background refresh leaves the cached list intact.
            }
        }
    }

    /** Selects a filter tab and re-derives the visible list from the cached conversations (no network). */
    fun selectFilter(filter: ConversationFilter) {
        _state.update { it.copy(selectedFilter = filter).withVisible(rawConversations) }
    }

    /** Updates the free-text search query and re-derives the visible list (no network). */
    fun setSearch(query: String) {
        _state.update { it.copy(searchText = query).withVisible(rawConversations) }
    }

    /** Opens or closes the search field; closing clears the query and restores the full list. */
    fun setSearchActive(active: Boolean) {
        _state.update {
            val next = if (active) it else it.copy(searchText = "")
            next.copy(isSearchActive = active).withVisible(rawConversations)
        }
    }

    /** Toggles the pinned state of a conversation (swipe action / context menu). */
    fun togglePin(id: String) {
        val pinned = prefsOf(id)?.isPinned ?: false
        runPrefMutation { repository.setPinnedOptimistic(id, !pinned) }
    }

    /** Toggles the muted state of a conversation. */
    fun toggleMute(id: String) {
        val muted = prefsOf(id)?.isMuted ?: false
        runPrefMutation { repository.setMutedOptimistic(id, !muted) }
    }

    /** Toggles the archived state of a conversation. */
    fun toggleArchive(id: String) {
        val archived = prefsOf(id)?.isArchived ?: false
        runPrefMutation { repository.setArchivedOptimistic(id, !archived) }
    }

    /** Marks a conversation read from the list (swipe action). */
    fun markRead(id: String) {
        runPrefMutation { repository.markReadOptimistic(id) }
    }

    /** Marks a conversation unread from the list (context menu, offered only on a read row). */
    fun markUnread(id: String) {
        runPrefMutation { repository.markUnreadOptimistic(id) }
    }

    /**
     * Reassigns a conversation to the user category [targetCategoryId] (context-menu
     * "move to category" / drag-to-category, parity iOS `setCategory`). The pure
     * [ConversationCategoryReassignment] SSOT gates the write: a drop onto the
     * category the row already sits in is inert (no optimistic write, no outbox row,
     * no flush), every other target reassigns optimistically and enqueues a snapshot.
     */
    fun reassignCategory(id: String, targetCategoryId: String) {
        when (val outcome =
            ConversationCategoryReassignment.resolve(prefsOf(id)?.categoryId, targetCategoryId)) {
            CategoryReassignment.Unchanged -> Unit
            is CategoryReassignment.AssignTo ->
                runPrefMutation { repository.setCategoryOptimistic(id, outcome.categoryId) }
        }
    }

    /**
     * Creates a new user category named [name] and assigns [id]'s conversation to
     * it — the picker field's "create" affordance
     * ([me.meeshy.sdk.model.CategorySubmit.Create]) driven end-to-end. A blank
     * [name] is inert (mirrors [ConversationCategoryPicker]'s `canCreate` guard,
     * which never offers the create row for a blank query, so this only defends
     * against a stray caller). The new category surfaces reactively through
     * [categoryRepository]'s stream once created; the assignment reuses
     * [reassignCategory]'s idempotency guard so it can never no-op here (a
     * freshly created category can never already be the conversation's current
     * one). A create failure surfaces [ConversationListUiState.errorMessage]
     * without touching the conversation's category.
     */
    fun createCategoryAndAssign(id: String, name: String) {
        if (name.isBlank()) return
        viewModelScope.launch {
            when (val result = categoryRepository.create(name)) {
                is NetworkResult.Success -> reassignCategory(id, result.data.id)
                is NetworkResult.Failure ->
                    _state.update { it.copy(errorMessage = result.error.message) }
            }
        }
    }

    /**
     * Discards a conversation's unsent draft (context-menu action, offered only on
     * a draft-bearing row). Optimistically drops the draft from state so the row
     * loses its "Brouillon : …" preview and sinks out of the floated group
     * immediately, then clears the durable store (the reactive `observeAll` stream
     * re-emits the same cleared map). A no-op when the row holds nothing meaningful;
     * a failed clear rolls the optimistic removal back.
     */
    fun discardDraft(id: String) {
        val snapshot = _state.value.drafts
        if (!DraftDiscard.isDiscardable(id, snapshot)) return
        _state.update { it.copy(drafts = DraftDiscard.afterDiscard(id, it.drafts)).withVisible(rawConversations) }
        viewModelScope.launch {
            try {
                draftStore.clear(id)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(drafts = snapshot, errorMessage = e.message).withVisible(rawConversations) }
            }
        }
    }

    /** Conversation ids with an in-flight [loadPreviewMessages] call — guards a double-load. */
    private val previewLoadingIds = mutableSetOf<String>()

    /**
     * Loads (once, cache-only) the most recent messages for [conversationId] into
     * [ConversationListUiState.previewMessages], for the hard-press preview card.
     * A no-op when the preview is already loaded or already in flight, so
     * re-opening the same row's menu never re-queries Room. Deliberately never
     * triggers a network refresh — see [MessageRepository.recentMessages].
     */
    fun loadPreviewMessages(conversationId: String) {
        if (_state.value.previewMessages.containsKey(conversationId)) return
        if (!previewLoadingIds.add(conversationId)) return
        viewModelScope.launch {
            try {
                val recent = messageRepository.recentMessages(conversationId)
                _state.update { it.copy(previewMessages = it.previewMessages + (conversationId to recent)) }
            } finally {
                previewLoadingIds -= conversationId
            }
        }
    }

    private fun prefsOf(id: String) =
        rawConversations.firstOrNull { it.id == id }?.resolvedPreferences

    /**
     * Runs an optimistic preference mutation and schedules an outbox flush only
     * when something was actually queued; a no-op mutation never wakes
     * WorkManager. Errors are swallowed — the cache write already rolled back
     * inside the repository transaction on failure.
     */
    private fun runPrefMutation(mutate: suspend () -> Boolean) {
        viewModelScope.launch {
            try {
                if (mutate()) {
                    workManager.enqueue(OutboxFlushWorker.buildRequest())
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(errorMessage = e.message) }
            }
        }
    }

    /** Pull-to-refresh: the visible spinner tracks the user gesture only —
     * background SWR revalidations stay silent ([ConversationListUiState.isSyncing]). */
    /**
     * Revalidation declenchee par un evenement socket : silencieuse par
     * construction. Un echec ici (session en cours de teardown — logout, bascule
     * magic link —, reseau coupe) laisse la liste en cache intacte ; avant cette
     * garde, un `conversation:updated` recu pendant un logout faisait remonter
     * ConversationSyncException jusqu'au main thread et TUAIT le process.
     */
    private suspend fun refreshSilently() {
        try {
            repository.refresh()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // Silencieux : la prochaine emission du cache ou le pull-to-refresh
            // resynchronisera.
        }
    }

    fun refresh() {
        _state.update { it.copy(errorMessage = null, isSyncing = true, isUserRefreshing = true) }
        viewModelScope.launch {
            try {
                repository.refresh()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update {
                    it.copy(errorMessage = e.message, showSkeleton = false)
                }
            } finally {
                _state.update { it.copy(isUserRefreshing = false, isSyncing = false) }
            }
        }
    }
}

/** Extracts the list carried by a [CacheResult], keeping [fallback] when a sync carries no value yet. */
private fun CacheResult<List<ApiConversation>>.rawListOr(
    fallback: List<ApiConversation>,
): List<ApiConversation> = when (this) {
    is CacheResult.Fresh -> value
    is CacheResult.Stale -> value
    is CacheResult.Syncing -> value ?: fallback
    CacheResult.Empty -> emptyList()
}

/**
 * Re-derives the visible (filtered + searched) list from the authoritative [raw]
 * cache list, applying the active filter, search query and current user identity.
 */
private fun ConversationListUiState.withVisible(raw: List<ApiConversation>): ConversationListUiState =
    copy(
        conversations = DraftAwareOrdering.apply(
            ConversationFilters.apply(raw, selectedFilter, searchText, currentUserId),
            drafts,
        ),
    )

/**
 * Maps a [CacheResult]'s SWR flags onto the screen state — skeleton only on a
 * cold, error-free empty cache. The visible list is computed separately by
 * [withVisible] so an active filter never triggers the cold-start skeleton.
 */
private fun ConversationListUiState.applyResultFlags(
    result: CacheResult<List<ApiConversation>>,
    raw: List<ApiConversation>,
): ConversationListUiState = when (result) {
    is CacheResult.Fresh -> copy(isSyncing = false, showSkeleton = false, errorMessage = null)
    is CacheResult.Stale -> copy(isSyncing = true, showSkeleton = false)
    is CacheResult.Syncing -> copy(
        isSyncing = true,
        showSkeleton = result.value == null && raw.isEmpty() && errorMessage == null,
    )
    CacheResult.Empty -> copy(isSyncing = false, showSkeleton = errorMessage == null)
}
