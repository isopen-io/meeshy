package me.meeshy.app.conversations

import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.CategoryOption
import me.meeshy.sdk.model.ConversationDraft
import me.meeshy.sdk.model.ConversationFilter
import me.meeshy.sdk.model.ConversationFilters
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.model.StoryGroup
import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.UserStatusEvent
import me.meeshy.sdk.socket.SocketConnectionState
import me.meeshy.sdk.theme.otherParticipantUserId
import me.meeshy.ui.component.StoryRingState

data class ConversationListUiState(
    val conversations: List<ApiConversation> = emptyList(),
    val isSyncing: Boolean = false,
    val isUserRefreshing: Boolean = false,
    val showSkeleton: Boolean = false,
    val errorMessage: String? = null,
    val connection: SocketConnectionState = SocketConnectionState.DISCONNECTED,
    /**
     * True while the socket is connected, or once the grace window of the current wait
     * (launch, or the last drop) has elapsed — only then may the strip announce it (see [bannerFor]).
     */
    val connectionSettled: Boolean = false,
    /** The DEVICE network, which outranks the socket: no network reads « Offline ». */
    val isNetworkOnline: Boolean = true,
    /** The socket connected at least once — a wait reads « Reconnecting », else « Connecting ». */
    val hasConnected: Boolean = false,
    /** The short « Online » confirmation after a down state the user saw. */
    val showBackOnline: Boolean = false,
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

    val banner: ConnectionBanner
        get() = bannerFor(
            connection = connection,
            isSyncing = isUserRefreshing,
            connectionSettled = connectionSettled,
            isNetworkOnline = isNetworkOnline,
            hasConnected = hasConnected,
            showBackOnline = showBackOnline,
        )

    /** The persisted draft for [conversationId], if the composer holds one — drives the row's "Draft: …" preview. */
    fun draftFor(conversationId: String): ConversationDraft? = drafts[conversationId]

    /**
     * The preview card's cached messages for [conversationId], or `null` while not yet loaded —
     * and always `null` for a locked conversation, whatever was loaded before the lock (parity
     * iOS `ConversationListPreviewLoader.state(for:)`: a lock set after a load leaves nothing readable).
     */
    fun previewFor(conversationId: String): List<LocalMessage>? =
        if (isLocked(conversationId)) null else previewMessages[conversationId]

    /**
     * The live presence state for [conversation]'s other participant, or `null` for a
     * group/community/channel/bot conversation, or when nothing has arrived for them yet.
     * A peer typing here is ALWAYS online, whatever the last presence frame said (product
     * rule; parity iOS `LentilleConversationRow`: `typingUsername != nil ? .online`).
     */
    fun presenceStateFor(conversation: ApiConversation, nowEpochMillis: Long): PresenceState? {
        val otherId = conversation.otherParticipantUserId(currentUserId) ?: return null
        if (typers[conversation.id]?.containsKey(otherId) == true) return PresenceState.ONLINE
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

/** Extracts the list carried by a [CacheResult], keeping [fallback] when a sync carries no value yet. */
internal fun CacheResult<List<ApiConversation>>.rawListOr(
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
internal fun ConversationListUiState.withVisible(raw: List<ApiConversation>): ConversationListUiState =
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
internal fun ConversationListUiState.applyResultFlags(
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
