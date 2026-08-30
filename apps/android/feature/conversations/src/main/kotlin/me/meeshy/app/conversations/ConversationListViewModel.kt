package me.meeshy.app.conversations

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.valueOrNull
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
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.model.StoryGroup
import me.meeshy.sdk.model.UserCategoryCatalog
import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.UserStatusEvent
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.CategorySocketManager
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.PreferencesSocketManager
import me.meeshy.sdk.socket.SocketConnectionState
import me.meeshy.sdk.socket.SocketManager
import me.meeshy.sdk.status.StatusBarCache
import me.meeshy.sdk.status.StatusFeedMode
import me.meeshy.sdk.story.StoryRepository
import me.meeshy.sdk.story.toStoryGroups
import me.meeshy.sdk.theme.otherParticipantUserId
import me.meeshy.ui.component.StoryRingState
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
     * Data plumbing only: content-hiding + the swipe-action swap remain deferred, but the
     * lock/unlock PIN flow is now live — see [lockPrompt].
     */
    val lockedConversationIds: Set<String> = emptySet(),
    /**
     * Whether a master PIN is currently configured — mirror of
     * [me.meeshy.sdk.lock.ConversationLockStore.hasMasterPin], refreshed whenever a lock
     * mutation or a master-PIN commit/removal flows through [ConversationListViewModel].
     * Gates the Settings-level change/remove affordances ([canChangeMasterPin] /
     * [canRemoveMasterPin]); a master PIN can exist with zero locks (set up, then every
     * lock dropped), so this can be `true` while [lockedConversationIds] is empty.
     */
    val hasMasterPin: Boolean = false,
    /**
     * The active conversation-lock PIN sheet, or `null` when none is shown. Driven by the
     * pure [LockPinReducer] (parity iOS `ConversationLockSheet`, whose logic Android lifts
     * out of the view into a covered reducer). The sheet renders [LockPinState] and forwards
     * digit/delete intents; a completed flow clears this back to `null` (or chains into the
     * lock code entry after a first-time master-PIN setup).
     */
    val lockPrompt: LockPinState? = null,
    /**
     * Live "who is typing where", keyed `conversationId → (userId → ConversationTyper)` —
     * port of iOS `ConversationListViewModel.typers`. Fed by `typing:start`/`typing:stop`
     * socket frames (self-excluded) and drained by a 15s safety timeout per typer. A row
     * surfaces the deterministic [typingDisplayNameFor] name as its top-priority preview line.
     */
    val typers: Map<String, Map<String, ConversationTyper>> = emptyMap(),
    /**
     * Live cache-first mirror of the tray's story groups (source:
     * [me.meeshy.sdk.story.StoryRepository.storiesStream]), keyed by author `userId`
     * to feed the per-row story ring — port of iOS `StoryViewModel.storyGroups` used
     * by `ConversationListView.storyRingState(for:)`. Empty until the first stream
     * emission carries any value; a group is dropped once it is fully expired
     * (parity iOS `StoryViewModel.storyRingState` `!group.isFullyExpired()` gate).
     */
    val storyGroups: List<StoryGroup> = emptyList(),
    /**
     * Best-effort mirror of the shared statuses bar's live mood entries (source:
     * [me.meeshy.sdk.status.StatusBarCache] FRIENDS bar), consumed by
     * [moodEmojiFor] to decorate a direct-row avatar with its peer's mood emoji —
     * port of iOS `StatusViewModel.statuses` read by
     * `ConversationListView.conversationMoodStatus(for:)`. Empty until the status
     * bar has ever loaded; a decorative affordance, never primary content, so it
     * is painted once from cache with no fetch of its own (mirrors
     * `ContactsListViewModel`).
     */
    val moodStatuses: List<StatusEntry> = emptyList(),
) {
    /** True when [conversationId] currently carries a PIN lock — drives the row's lock glyph. */
    fun isLocked(conversationId: String): Boolean = lockedConversationIds.contains(conversationId)

    /**
     * True when at least one conversation is locked — gates the "unlock all" affordance
     * (parity iOS Settings, which only offers unlock-all while a lock exists). A lock can
     * only be set after the master PIN is verified, so a non-empty set already implies a
     * master PIN is present; the sheet re-verifies it regardless.
     */
    val canUnlockAll: Boolean get() = lockedConversationIds.isNotEmpty()

    /**
     * True when the master PIN can be changed — i.e. one exists (parity iOS Settings,
     * which shows "Change master PIN" only once a PIN is configured).
     */
    val canChangeMasterPin: Boolean get() = hasMasterPin

    /**
     * True when the master PIN can be removed — it exists AND nothing is locked. SOTA
     * over iOS, which offers removal unconditionally and force-clears the PIN even while
     * conversation locks survive (orphaning them). Gating on "no locks" keeps every lock
     * authorisable and unlock-all reachable for as long as any lock exists.
     */
    val canRemoveMasterPin: Boolean get() = hasMasterPin && lockedConversationIds.isEmpty()

    /**
     * The single surfaced typer's display name for [conversationId] (deterministic), or `null`
     * when nobody there is composing — drives the row's "… is typing" preview line.
     */
    fun typingDisplayNameFor(conversationId: String): String? =
        ConversationTypingRoster.typingDisplayName(typers, conversationId)

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

    /**
     * The peer's story-ring state on [conversation]'s row avatar (parity iOS
     * `ConversationListView.storyRingState(for:)`), derived from the live
     * [storyGroups] mirror by [ConversationStoryRing]. `StoryRingState.None` for
     * a group/community/channel/bot conversation or when the peer has no active
     * story.
     */
    fun storyRingFor(conversation: ApiConversation, nowEpochMillis: Long): StoryRingState =
        ConversationStoryRing.ringFor(
            conversation = conversation,
            currentUserId = currentUserId,
            groups = storyGroups,
            nowMillis = nowEpochMillis,
        )

    /**
     * The mood emoji to overlay on [conversation]'s row avatar (parity iOS
     * `ConversationListView.conversationMoodStatus(for:)`), or `null` for a
     * group/community/channel/bot conversation or when the peer has no live mood
     * status. Derived from the live [moodStatuses] mirror by [ConversationMoodStatus].
     */
    fun moodEmojiFor(conversation: ApiConversation): String? =
        ConversationMoodStatus.moodEmojiFor(
            conversation = conversation,
            currentUserId = currentUserId,
            statuses = moodStatuses,
        )

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
    preferencesSocketManager: PreferencesSocketManager,
    socketManager: SocketManager,
    sessionRepository: SessionRepository,
    private val lockStore: ConversationLockStore,
    private val storyRepository: StoryRepository,
    private val statusBarCache: StatusBarCache,
) : ViewModel() {

    private val _state = MutableStateFlow(ConversationListUiState())
    val state: StateFlow<ConversationListUiState> = _state.asStateFlow()

    /**
     * One-shot "navigate into this conversation" requests. Emitted when a tap resolves
     * to an open — immediately for an unlocked row, or after the [LockPinMode.OPEN_CONVERSATION]
     * gate accepts the code (parity iOS `ConversationListView`'s `onSelect`). A [Channel]
     * (not a `StateFlow`) because navigation is an event, not state: re-collecting after a
     * config change must not re-navigate. Mirrors this file's existing [refreshRequests] idiom.
     */
    private val openConversationRequests = Channel<String>(Channel.BUFFERED)
    val openConversation: Flow<String> = openConversationRequests.receiveAsFlow()

    /** Authoritative, unfiltered cache list; [ConversationListUiState.conversations] is the filtered view. */
    private var rawConversations: List<ApiConversation> = emptyList()

    /** Read-only PIN checks for [lockPinReducer], backed by the encrypted lock store. */
    private val lockPinReducer = LockPinReducer(object : LockPinOracle {
        override fun verifyMasterPin(pin: String): Boolean = lockStore.verifyMasterPin(pin)
        override fun verifyLock(conversationId: String, pin: String): Boolean =
            lockStore.verifyLock(conversationId, pin)
    })

    /**
     * Set only while a first-time master-PIN [LockPinMode.SETUP_MASTER_PIN] sheet is open on
     * behalf of a lock the user asked for: once the master PIN is committed the flow chains
     * straight into the 4-digit code entry for this id (skipping a redundant master re-verify),
     * so tapping "Lock" once is enough even with no master PIN configured yet.
     */
    private var pendingLockConversationId: String? = null

    /**
     * The live category corpus (parity iOS `UserCategoryStore.categoriesById`). Cache-first
     * hydration re-seeds it from the server snapshot; real-time socket events fold onto it in
     * place. Its [UserCategoryCatalog.sorted] view is what the section splitter reads via
     * [ConversationListUiState.categories]. Both collectors run on the same (Main) dispatcher,
     * so the read-modify-write is serialized — the same single-writer discipline as
     * [rawConversations].
     */
    private var categoryCatalog: UserCategoryCatalog = UserCategoryCatalog.EMPTY

    /**
     * Demandes de revalidation de la liste, FUSIONNEES.
     *
     * Un seul message entrant vaut TROIS trames serveur — `message:new`,
     * `conversation:updated` et `conversation:unread-updated` sortent toutes du
     * meme `MessageHandler.broadcastNewMessage` pour le meme message. Repondre a
     * chacune par son propre [refreshSilently] payait donc TROIS fois, par
     * message recu, le prix fort : un `GET /conversations` complet, plus une
     * transaction Room `upsertAll` + `deleteNotIn`, plus la re-emission de toute
     * la liste vers l'UI. Dans un groupe actif, l'ecran de liste ouvert, cela
     * fait des dizaines de relectures completes par minute — reseau, batterie et
     * base, pour un resultat que la premiere relecture portait deja.
     *
     * [Channel.CONFLATED] ne retient que la DERNIERE demande en attente : une
     * rafale de trames arrivees pendant une relecture en vol se fond en une
     * seule relecture de queue. Bornes du contrat, dans les deux sens :
     *
     *  - **Rien n'est retarde.** Le canal est vide au repos, donc une trame
     *    isolee est servie immediatement — pas de `debounce`, pas de fenetre
     *    d'attente (principe Instant App : cache-first, network-second).
     *  - **Rien n'est perdu.** Toute trame arrivee pendant une relecture laisse
     *    une demande en attente, donc une relecture SUIVANTE la couvrira — la
     *    reponse en vol avait pu etre construite par le serveur avant elle.
     *
     * [trySend] ne suspend jamais : les collecteurs rendent la main aussitot, et
     * la dispatch des trames socket ne peut plus etre freinee par une requete
     * reseau en cours (les `SharedFlow` de [MessageSocketManager] sont bornes a
     * 64 et suspendent leur emetteur au-dela).
     */
    private val refreshRequests = Channel<Unit>(Channel.CONFLATED)

    /** Demande une revalidation silencieuse ; fusionnee par [refreshRequests]. */
    private fun requestRefresh() {
        refreshRequests.trySend(Unit)
    }

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
            // The StateFlow replays its current snapshot on subscription, so this both
            // seeds [ConversationListUiState.lockedConversationIds] at start-up and keeps
            // it live. `hasMasterPin` is refreshed alongside every lock mutation (a master
            // PIN is only ever set as part of a lock, so the two move together on that path);
            // the change/remove flows refresh it directly in [applyLockResult].
            lockStore.lockedConversationIdsFlow.collect { ids ->
                _state.update { it.copy(lockedConversationIds = ids, hasMasterPin = lockStore.hasMasterPin()) }
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
            // Les préférences de conversation changées sur un AUTRE appareil : la
            // ligne est par UTILISATEUR, donc épingler / mettre en sourdine /
            // archiver / recatégoriser depuis le web ou l'iPhone n'atteignait
            // Android par aucun chemin avant cet écouteur (#4127). L'écriture Room
            // suffit à repeindre : [conversationsStream] observe la table, et
            // `ConversationSections.of` re-range la ligne à l'émission suivante —
            // aucune relecture réseau n'est demandée.
            preferencesSocketManager.conversationPreferencesUpdated.collect { event ->
                repository.applyRemoteConversationPreferences(event)
            }
        }

        viewModelScope.launch {
            // La pompe : une relecture a la fois, la suivante ne partant qu'une
            // fois la precedente rendue. C'est ce qui donne la fusion — toute
            // trame arrivee entre-temps s'est deja fondue dans l'unique demande
            // que [refreshRequests] retient.
            launch {
                for (coalescedRequest in refreshRequests) {
                    refreshSilently()
                }
            }
            launch {
                messageSocketManager.unreadUpdated.collect { requestRefresh() }
            }
            launch {
                messageSocketManager.messageReceived.collect { requestRefresh() }
            }
            launch {
                messageSocketManager.conversationUpdated.collect { requestRefresh() }
            }
            launch {
                messageSocketManager.conversationDeleted.collect { event ->
                    ConversationPurge.onConversationDeleted(event)?.let(::purge)
                }
            }
            launch {
                messageSocketManager.conversationClosed.collect { event ->
                    ConversationPurge.onConversationClosed(event)?.let(::purge)
                }
            }
            launch {
                messageSocketManager.participantLeft.collect { event ->
                    ConversationPurge.onParticipantLeft(event, _state.value.currentUserId)?.let(::purge)
                }
            }
        }

        observePresence()
        observeTyping()
        observeStoryGroups()
        paintMoodStatusesFromCache()
    }

    /**
     * Best-effort read of whatever the shared FRIENDS statuses bar already has
     * cached ([StatusBarCache], populated whenever Feed's status bar has loaded) —
     * synchronous, no network call of its own, so a direct row can decorate its
     * peer's avatar with a live mood emoji the instant the list opens. Freshness is
     * irrelevant for a decorative badge, so [valueOrNull] collapses
     * Fresh/Stale/Syncing uniformly; a cold [CacheResult.Empty] just means no mood
     * badges yet, exactly like iOS before its status feed has ever loaded. Mirrors
     * the `ContactsListViewModel.paintMoodStatusesFromCache` precedent verbatim so
     * mood resolution is identical across surfaces.
     */
    private fun paintMoodStatusesFromCache() {
        val statuses = statusBarCache.load(StatusFeedMode.FRIENDS).valueOrNull.orEmpty()
        if (statuses != _state.value.moodStatuses) {
            _state.update { it.copy(moodStatuses = statuses) }
        }
    }

    /**
     * Cache-first mirror of [StoryRepository.storiesStream] into
     * [ConversationListUiState.storyGroups] — the row's story ring reads from state,
     * not from the repository directly (parity iOS `StoryViewModel.storyGroups`
     * observed by `ConversationListView.storyRingState(for:)`). Failures leave the
     * previous groups in place so a transient network hiccup never wipes the rings.
     */
    private fun observeStoryGroups() {
        viewModelScope.launch {
            storyRepository.storiesStream(onSyncError = { }).collect { result ->
                val posts = when (result) {
                    is CacheResult.Fresh -> result.value
                    is CacheResult.Stale -> result.value
                    is CacheResult.Syncing -> result.value
                    CacheResult.Empty -> null
                } ?: return@collect
                val groups = posts.toStoryGroups(currentUserId = _state.value.currentUserId)
                _state.update { it.copy(storyGroups = groups) }
            }
        }
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

    /**
     * Per-`(conversationId, userId)` safety-timeout jobs that clear a stuck typer. iOS arms a
     * 15s `Timer` on every `typing:start` because a `typing:stop` can be lost (peer backgrounded,
     * socket dropped mid-compose); without it a row would show "… is typing" forever. Each new
     * start re-arms (cancels + reschedules) the peer's own timer; a real stop cancels it.
     */
    private val typingCleanupJobs = mutableMapOf<String, Job>()

    /**
     * Overlays live `typing:start`/`typing:stop` frames into
     * [ConversationListUiState.typers] via the pure [ConversationTypingRoster]. Started eagerly
     * (like [observePresence]): [MessageSocketManager]'s typing flows are hot `SharedFlow`s with
     * no replay, so a late subscriber misses events. The local user is self-excluded so the reader
     * never sees themselves "typing" in a row they are composing in.
     */
    private fun observeTyping() {
        viewModelScope.launch {
            messageSocketManager.typingStarted.collect { event ->
                val before = _state.value.typers
                val after = ConversationTypingRoster.started(before, event, _state.value.currentUserId)
                if (after === before) return@collect
                _state.update { it.copy(typers = after) }
                armTypingCleanup(event.conversationId, event.userId)
            }
        }
        viewModelScope.launch {
            messageSocketManager.typingStopped.collect { event ->
                cancelTypingCleanup(event.conversationId, event.userId)
                _state.update {
                    it.copy(typers = ConversationTypingRoster.stopped(it.typers, event.conversationId, event.userId))
                }
            }
        }
    }

    private fun armTypingCleanup(conversationId: String, userId: String) {
        val key = "$conversationId $userId"
        typingCleanupJobs.remove(key)?.cancel()
        typingCleanupJobs[key] = viewModelScope.launch {
            delay(TYPING_SAFETY_TIMEOUT_MS)
            _state.update {
                it.copy(typers = ConversationTypingRoster.stopped(it.typers, conversationId, userId))
            }
            typingCleanupJobs.remove(key)
        }
    }

    private fun cancelTypingCleanup(conversationId: String, userId: String) {
        typingCleanupJobs.remove("$conversationId $userId")?.cancel()
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

    /** Toggles the mentions-only notification state of a conversation (context menu). */
    fun toggleMentionsOnly(id: String) {
        val mentionsOnly = prefsOf(id)?.mentionsOnly ?: false
        runPrefMutation { repository.setMentionsOnlyOptimistic(id, !mentionsOnly) }
    }

    /** Renames a conversation (context-menu "Rename", parity iOS `setCustomName`). */
    fun setCustomName(id: String, name: String) {
        runPrefMutation { repository.setCustomNameOptimistic(id, name) }
    }

    /**
     * Sets or clears (`emoji = null`) the conversation's favorite-reaction
     * emoji (context-menu "Favorite", parity iOS `setFavoriteReaction`) — the
     * write side of the [me.meeshy.sdk.model.ConversationFilter.FAVORITES] tab.
     */
    fun setReaction(id: String, emoji: String?) {
        runPrefMutation { repository.setReactionOptimistic(id, emoji) }
    }

    /** Replaces a conversation's full tag set (context-menu "Tags" dialog, parity iOS `setTags`). */
    fun setTags(id: String, tags: List<String>) {
        runPrefMutation { repository.setTagsOptimistic(id, tags) }
    }

    /**
     * Handles a tap on a conversation row (parity iOS `ConversationListView`'s row tap gate).
     * An unlocked row navigates straight through; a locked row opens the
     * [LockPinMode.OPEN_CONVERSATION] gate instead, so its content stays hidden until the
     * code is entered. The lock store is the authority (same synchronous read [onLockToggle]
     * uses), not the mirrored [ConversationListUiState.lockedConversationIds], so a tap can
     * never race a just-applied lock/unlock.
     */
    fun onConversationTap(id: String) {
        if (lockStore.isLocked(id)) {
            _state.update { it.copy(lockPrompt = LockPinState(LockPinMode.OPEN_CONVERSATION, id)) }
        } else {
            openConversationRequests.trySend(id)
        }
    }

    /**
     * Opens the lock PIN sheet for [id] in the right mode (context-menu "Lock"/"Unlock",
     * parity iOS `ConversationListView+Overlays`'s lock decision): a locked row prompts to
     * unlock; an unlocked row with a master PIN already set prompts for its code; an unlocked
     * row with no master PIN yet routes through first-time master-PIN setup, then chains into
     * the code entry ([pendingLockConversationId]) — where iOS instead dead-ends on a
     * "configure a master PIN in Settings" alert.
     */
    fun onLockToggle(id: String) {
        val prompt = when {
            lockStore.isLocked(id) -> LockPinState(LockPinMode.UNLOCK_CONVERSATION, id)
            lockStore.hasMasterPin() -> LockPinState(LockPinMode.LOCK_CONVERSATION, id)
            else -> {
                pendingLockConversationId = id
                LockPinState(LockPinMode.SETUP_MASTER_PIN, id)
            }
        }
        if (prompt.mode != LockPinMode.SETUP_MASTER_PIN) pendingLockConversationId = null
        _state.update { it.copy(lockPrompt = prompt) }
    }

    /**
     * Opens the master-PIN sheet to drop every conversation lock at once (parity iOS
     * Settings → `ConversationLockSheet.Mode.unlockAll`). Inert when nothing is locked —
     * the entry affordance is hidden then anyway ([ConversationListUiState.canUnlockAll]),
     * but the guard reads the authoritative store so a stale tap can never open an empty
     * unlock-all sheet. Any pending chained lock is dropped (this is not a lock flow).
     */
    fun onUnlockAll() {
        if (lockStore.lockedConversationIds.isEmpty()) return
        pendingLockConversationId = null
        _state.update { it.copy(lockPrompt = LockPinState(LockPinMode.UNLOCK_ALL, conversationId = null)) }
    }

    /**
     * Opens the master-PIN sheet to change the master PIN (parity iOS Settings →
     * `ConversationLockSheet.Mode.changeMasterPin`): verify the current PIN, enter a new
     * one, confirm it. Inert when no master PIN exists (the entry affordance is hidden
     * then — [ConversationListUiState.canChangeMasterPin]), but the guard reads the
     * authoritative store so a stale tap can never open the sheet with nothing to verify.
     * Any pending chained lock is dropped (this is not a lock flow).
     */
    fun onChangeMasterPin() {
        if (!lockStore.hasMasterPin()) return
        pendingLockConversationId = null
        _state.update { it.copy(lockPrompt = LockPinState(LockPinMode.CHANGE_MASTER_PIN, conversationId = null)) }
    }

    /**
     * Opens the master-PIN sheet to remove the master PIN (parity iOS Settings →
     * `ConversationLockSheet.Mode.removeMasterPin`). Offered only while a PIN exists AND
     * nothing is locked ([ConversationListUiState.canRemoveMasterPin]); the guard re-reads
     * the authoritative store so a stale tap can never open the sheet once a lock has
     * appeared. Any pending chained lock is dropped (this is not a lock flow).
     */
    fun onRemoveMasterPin() {
        if (!lockStore.hasMasterPin() || lockStore.lockedConversationIds.isNotEmpty()) return
        pendingLockConversationId = null
        _state.update { it.copy(lockPrompt = LockPinState(LockPinMode.REMOVE_MASTER_PIN, conversationId = null)) }
    }

    /** Feeds a digit tap into the open lock sheet; no-op when none is shown. */
    fun onLockDigit(digit: Int) {
        val current = _state.value.lockPrompt ?: return
        applyLockResult(lockPinReducer.onDigit(current, digit))
    }

    /** Deletes the last entered digit of the open lock sheet; no-op when none is shown. */
    fun onLockDelete() {
        val current = _state.value.lockPrompt ?: return
        _state.update { it.copy(lockPrompt = lockPinReducer.onDelete(current)) }
    }

    /** Dismisses the lock sheet without completing the flow (drops any pending chained lock). */
    fun dismissLockPrompt() {
        pendingLockConversationId = null
        _state.update { it.copy(lockPrompt = null) }
    }

    private fun applyLockResult(result: LockPinResult) {
        var nextPrompt: LockPinState? = result.state
        result.effects.forEach { effect ->
            when (effect) {
                is LockPinEffect.CommitMasterPin -> lockStore.setMasterPin(effect.pin)
                is LockPinEffect.CommitLock -> lockStore.setLock(effect.conversationId, effect.pin)
                is LockPinEffect.RemoveLock -> lockStore.removeLock(effect.conversationId)
                LockPinEffect.RemoveMasterPin -> lockStore.removeMasterPin()
                LockPinEffect.RemoveAllLocks -> lockStore.removeAllLocks()
                is LockPinEffect.OpenConversation -> openConversationRequests.trySend(effect.conversationId)
                LockPinEffect.Completed -> {
                    val pending = pendingLockConversationId
                    pendingLockConversationId = null
                    nextPrompt = if (result.state.mode == LockPinMode.SETUP_MASTER_PIN && pending != null) {
                        LockPinState(LockPinMode.LOCK_CONVERSATION, pending, step = 1)
                    } else {
                        null
                    }
                }
            }
        }
        // A CommitMasterPin (change) or RemoveMasterPin effect changes master-PIN presence
        // without touching the locked set, so the flow collector won't fire — refresh it here.
        _state.update { it.copy(lockPrompt = nextPrompt, hasMasterPin = lockStore.hasMasterPin()) }
    }

    /**
     * Leaves [id] (context menu, gated by a confirmation dialog in the caller UI).
     * No optimistic local removal: the socket-driven purge path
     * (`ConversationPurge.onParticipantLeft`) drops the row once the server
     * confirms and broadcasts the event back to this device.
     */
    fun leaveConversation(id: String) {
        viewModelScope.launch {
            when (val result = repository.leave(id)) {
                is NetworkResult.Success -> _state.update { it.copy(errorMessage = null) }
                is NetworkResult.Failure -> _state.update { it.copy(errorMessage = result.error.message) }
            }
        }
    }

    /**
     * Permanently hides [id] for this user only (context menu, gated by a
     * confirmation dialog in the caller UI). No optimistic local removal: the
     * socket-driven purge path (`ConversationPurge.onConversationDeleted`)
     * drops the row once the server confirms and broadcasts the event back to
     * this account's devices.
     */
    fun deleteConversationForMe(id: String) {
        viewModelScope.launch {
            when (val result = repository.deleteForMe(id)) {
                is NetworkResult.Success -> _state.update { it.copy(errorMessage = null) }
                is NetworkResult.Failure -> _state.update { it.copy(errorMessage = result.error.message) }
            }
        }
    }

    /**
     * Ends [id] for every participant (context menu, offered to the creator
     * only, gated by a confirmation dialog in the caller UI). No optimistic
     * local removal: the socket-driven purge path
     * (`ConversationPurge.onConversationClosed`) drops the row — for every
     * participant, including this device — once the server confirms and
     * broadcasts `conversation:closed`.
     */
    fun deleteConversationForAll(id: String) {
        viewModelScope.launch {
            when (val result = repository.deleteForAll(id)) {
                is NetworkResult.Success -> _state.update { it.copy(errorMessage = null) }
                is NetworkResult.Failure -> _state.update { it.copy(errorMessage = result.error.message) }
            }
        }
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
     *
     * Appelee par la seule pompe de [refreshRequests], jamais directement depuis
     * un collecteur : c'est cette serialisation qui fusionne les rafales. Sa
     * garde `catch` en devient d'autant plus critique — la pompe est desormais
     * UNIQUE, donc une exception qui s'en echapperait ne priverait pas une
     * famille de trames de sa relecture, mais TOUTES.
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

    private companion object {
        /** iOS parity: a typer with no `typing:stop` is force-cleared after 15 seconds. */
        const val TYPING_SAFETY_TIMEOUT_MS = 15_000L
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
