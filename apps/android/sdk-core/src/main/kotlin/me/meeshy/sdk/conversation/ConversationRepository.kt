package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.ConversationDao
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.cache.cacheFirstFlow
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipantProfile
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CreateConversationRequest
import me.meeshy.sdk.model.HistoryGrantUpdate
import me.meeshy.sdk.model.MemberRole
import me.meeshy.sdk.model.MemberRosterPage
import me.meeshy.sdk.model.UpdateConversationResponse
import me.meeshy.sdk.model.UpdateConversationSettingsRequest
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.AddParticipantRequest
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.net.api.ParticipantRightsUpdateResult
import me.meeshy.sdk.net.api.ParticipantRoleUpdate
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.net.apiCallUnit
import me.meeshy.sdk.outbox.ConversationPrefsPayload
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ConversationRepository @Inject constructor(
    private val conversationApi: ConversationApi,
    private val database: MeeshyDatabase,
    private val conversationDao: ConversationDao,
    syncMetaDao: SyncMetaDao,
    private val outboxRepository: OutboxRepository,
) {
    private val cacheSource = ConversationCacheSource(
        database = database,
        conversationDao = conversationDao,
        syncMetaDao = syncMetaDao,
        conversationApi = conversationApi,
        clock = SystemCacheClock,
    )

    /**
     * Cache-first conversation list (ARCHITECTURE.md §4): the cached list is
     * served immediately and revalidated in the background. [onSyncError]
     * surfaces a failed background revalidation so the UI can leave its skeleton.
     */
    fun conversationsStream(
        policy: CachePolicy = CachePolicy.Default,
        onSyncError: (Throwable) -> Unit = {},
    ): Flow<CacheResult<List<ApiConversation>>> =
        cacheFirstFlow(policy, cacheSource, onRevalidateError = onSyncError)

    /**
     * Cache-first single conversation: the Room row written by the list sync,
     * decoded on the fly. Emits null until the conversation is cached.
     */
    fun conversationStream(id: String): Flow<ApiConversation?> =
        conversationDao.observeById(id).map { row ->
            row?.let { MeeshyApi.json.decodeFromString<ApiConversation>(it.payload) }
        }

    /**
     * Local-only cached conversations — a plain Room read with **no** network
     * revalidation. Powers the home-screen widget (`:app` `UnreadCountWidget`),
     * which must render from whatever is already cached (possibly offline, no
     * connectivity guarantee at widget-refresh time) rather than block on a
     * fetch. An empty/never-synced cache resolves to an empty list, never a
     * fabricated placeholder.
     */
    fun cachedConversations(): Flow<List<ApiConversation>> =
        cacheSource.observe().map { it ?: emptyList() }

    /** Explicit refresh (pull-to-refresh / retry). Throws on failure. */
    suspend fun refresh() {
        cacheSource.revalidate()
    }

    suspend fun getById(id: String): NetworkResult<ApiConversation> =
        apiCall { conversationApi.getById(id) }

    suspend fun create(
        type: String,
        title: String?,
        participantIds: List<String>,
    ): NetworkResult<ApiConversation> =
        apiCall { conversationApi.create(CreateConversationRequest(type, title, participantIds)) }

    suspend fun markRead(id: String): NetworkResult<Unit> =
        apiCall { conversationApi.markRead(id) }

    /**
     * Persist an admin conversation-settings patch (write-role / announcement /
     * slow-mode / auto-translate). Online-only — the settings screen consumes the
     * [NetworkResult] directly; transport/HTTP errors fold into a [NetworkResult.Failure].
     */
    suspend fun updateSettings(
        id: String,
        request: UpdateConversationSettingsRequest,
    ): NetworkResult<UpdateConversationResponse> =
        apiCall { conversationApi.updateSettings(id, request) }

    /**
     * Leaves [id] (destructive, confirmed by the caller UI before invoking this).
     * No local cache mutation here: the gateway broadcasts `conversation:participant-left`
     * back to every one of the leaver's own devices, and [ConversationPurge]
     * ([me.meeshy.app.conversations]) already drops the row from the visible list
     * once that event round-trips — the same path already used when another
     * device of this same user leaves.
     */
    suspend fun leave(id: String): NetworkResult<Unit> =
        apiCall { conversationApi.leave(id) }

    /**
     * Permanently hides [id] for the calling user only (destructive, confirmed
     * by the caller UI). No local cache mutation here: the gateway broadcasts
     * `conversation:deleted` to every one of the caller's own devices, and
     * [ConversationPurge.onConversationDeleted] ([me.meeshy.app.conversations])
     * already drops the row once that event round-trips.
     */
    suspend fun deleteForMe(id: String): NetworkResult<Unit> =
        apiCall { conversationApi.deleteForMe(id) }

    /**
     * Ends [id] for EVERY participant (destructive, confirmed by the caller UI;
     * server-enforced creator-only — the client only gates the affordance). No
     * local cache mutation here: the gateway broadcasts `conversation:closed` to
     * every participant's devices, including the closer's own, and
     * [ConversationPurge.onConversationClosed] ([me.meeshy.app.conversations])
     * drops the row once that event round-trips — same shape as [deleteForMe].
     */
    suspend fun deleteForAll(id: String): NetworkResult<Unit> =
        apiCall { conversationApi.deleteForAll(id) }

    /**
     * One cursor page of [id]'s member roster, optionally filtered server-side by
     * [search]. Online-only — the members sheet consumes the [NetworkResult]
     * directly. The cursor-shaped wire envelope is adapted onto the shared
     * [apiCall] error handling here so transport/HTTP/parse failures all fold into
     * a [NetworkResult.Failure] exactly like every other call.
     */
    suspend fun participants(
        id: String,
        search: String? = null,
        cursor: String? = null,
        limit: Int = PARTICIPANTS_PAGE_SIZE,
    ): NetworkResult<MemberRosterPage> =
        apiCall {
            val response = conversationApi.participants(
                id = id,
                search = search?.takeIf { it.isNotBlank() },
                limit = limit,
                cursor = cursor,
            )
            ApiResponse(
                success = response.success,
                data = MemberRosterPage(
                    members = response.data,
                    nextCursor = response.pagination?.nextCursor,
                    hasMore = response.pagination?.hasMore ?: false,
                    totalCount = response.pagination?.totalCount,
                ),
            )
        }

    /**
     * Promotes or demotes [userId] in [id] (server-enforced creator/admin-only —
     * the client only gates the affordance via [me.meeshy.sdk.model.MemberModeration]).
     * The gateway broadcasts `participant:role-updated` to the whole roster, so
     * every other viewer's sheet follows without a refetch.
     */
    suspend fun updateParticipantRole(
        id: String,
        userId: String,
        role: MemberRole,
    ): NetworkResult<Unit> =
        apiCallUnit {
            conversationApi.updateParticipantRole(id, userId, ParticipantRoleUpdate(role.wireValue))
        }

    /**
     * Removes [userId] from [id] (destructive, confirmed by the caller UI;
     * server-enforced admin/moderator-only). The gateway broadcasts
     * `conversation:participant-left` so the removed member's own devices drop the
     * conversation through the existing [ConversationPurge] path.
     */
    suspend fun removeParticipant(id: String, userId: String): NetworkResult<Unit> =
        apiCallUnit { conversationApi.removeParticipant(id, userId) }

    /**
     * Adds [userId] to [id] (server-enforced creator/admin/moderator-only — the client
     * only gates the affordance). Mirror of iOS `AddParticipantSheet.addParticipant`.
     */
    suspend fun addParticipant(id: String, userId: String): NetworkResult<Unit> =
        apiCallUnit { conversationApi.addParticipant(id, AddParticipantRequest(userId)) }

    /**
     * Bans [userId] from [id] (server-enforced — the client only gates the affordance via
     * [me.meeshy.sdk.model.MemberModeration.canBan]). Mirror of iOS
     * `ConversationService.banParticipant`.
     */
    suspend fun banParticipant(id: String, userId: String): NetworkResult<Unit> =
        apiCallUnit { conversationApi.banParticipant(id, userId) }

    /**
     * La fiche d'UN participant (#3943) — identité, capacités d'entrée, réglages
     * du lien emprunté et octroi d'historique.
     *
     * **[participantId] est un `Participant.id`, jamais un `User.id`** : le
     * sujet est souvent un visiteur venu par un lien, qui n'a aucune ligne
     * `User`. Les méthodes voisines de cette classe prennent l'autre colonne —
     * la ressemblance des deux chemins est un piège, pas une symétrie.
     *
     * Pas de cache : la fiche porte des faits que le gateway gate PAR LECTEUR
     * (`email`, `entryLink`, `historyVisibleFrom`, `canGrantHistory`). Une
     * copie locale les servirait à un lecteur pour qui ils ont été masqués — la
     * garde vit côté serveur, et rien ici ne doit lui survivre.
     */
    suspend fun participantProfile(
        id: String,
        participantId: String,
    ): NetworkResult<ApiParticipantProfile> =
        apiCall { conversationApi.participantProfile(id, participantId) }

    /**
     * Pose ou retire « voit l'historique depuis le \<date\> » (#3877, #3943).
     *
     * [historyVisibleFrom] `null` RETIRE l'octroi — et c'est une valeur, pas une
     * absence : [HistoryGrantUpdate] force l'encodage de la clé pour que le
     * gateway puisse distinguer « retirer » de « ne rien dire ».
     *
     * Réservé aux admin/creator, arbitré par le SERVEUR ; le client ne fait que
     * gater l'affordance sur `canGrantHistory`, qu'il ne recalcule jamais.
     */
    suspend fun updateHistoryGrant(
        id: String,
        participantId: String,
        historyVisibleFrom: String?,
    ): NetworkResult<ParticipantRightsUpdateResult> =
        apiCall {
            conversationApi.updateHistoryGrant(
                id,
                participantId,
                HistoryGrantUpdate(historyVisibleFrom),
            )
        }

    /**
     * Optimistic mark-as-read (ARCHITECTURE.md §5): the cached badge drops to
     * zero instantly and a `READ_RECEIPT` mutation joins its outbox lane (the
     * coalescer merges repeats). No-op when the conversation is unknown or
     * already read. Returns whether anything was queued.
     */
    suspend fun markReadOptimistic(id: String): Boolean {
        val updated = database.withTransaction {
            val row = conversationDao.find(id) ?: return@withTransaction false
            val conversation = MeeshyApi.json.decodeFromString<ApiConversation>(row.payload)
            if (conversation.unreadCount == 0) return@withTransaction false
            conversationDao.upsertAll(
                listOf(
                    row.copy(
                        payload = MeeshyApi.json.encodeToString(conversation.copy(unreadCount = 0)),
                    ),
                ),
            )
            true
        }
        if (!updated) return false
        outboxRepository.enqueue(
            OutboxMutation(
                kind = OutboxKind.READ_RECEIPT,
                lane = OutboxLanes.READ_RECEIPT,
                targetId = id,
                payload = "{}",
            ),
        )
        return true
    }

    /**
     * Optimistic mark-as-unread (context-menu counterpart to [markReadOptimistic],
     * parity iOS `ConversationStore.markConversationUnreadLocally` + `.markAsUnread`
     * dispatch): the server stays authoritative on the exact count, so locally this
     * only hints `unreadCount = 1` (the badge appears at once) — never a no-op-to-
     * no-op write. No-op (returns false) when the conversation is unknown or already
     * unread (nothing to flip; the context menu only ever offers this action on an
     * already-read row). Shares the `READ_RECEIPT` outbox lane with [markReadOptimistic]
     * (both drain in the same FIFO), and its [OutboxKind.MARK_UNREAD] kind coalesces
     * against a pending [OutboxKind.READ_RECEIPT] as opposite terminal states
     * ([OutboxCoalescer] `terminalToggle`) rather than iOS's simpler always-replace
     * shared coalescing key — a quick read→unread undo cancels both mutations locally
     * instead of round-tripping a redundant "mark unread" the server would just
     * no-op anyway (same idempotent-terminal-state shape already used for
     * block/unblock and pin/unpin).
     */
    suspend fun markUnreadOptimistic(id: String): Boolean {
        val updated = database.withTransaction {
            val row = conversationDao.find(id) ?: return@withTransaction false
            val conversation = MeeshyApi.json.decodeFromString<ApiConversation>(row.payload)
            if (conversation.unreadCount > 0) return@withTransaction false
            conversationDao.upsertAll(
                listOf(
                    row.copy(
                        payload = MeeshyApi.json.encodeToString(conversation.copy(unreadCount = 1)),
                    ),
                ),
            )
            true
        }
        if (!updated) return false
        outboxRepository.enqueue(
            OutboxMutation(
                kind = OutboxKind.MARK_UNREAD,
                lane = OutboxLanes.READ_RECEIPT,
                targetId = id,
                payload = "{}",
            ),
        )
        return true
    }

    /** Optimistic pin/unpin toggle (swipe action + context menu). */
    suspend fun setPinnedOptimistic(id: String, pinned: Boolean): Boolean =
        updatePreferencesOptimistic(id) { it.copy(isPinned = pinned) }

    /** Optimistic mute/unmute toggle. */
    suspend fun setMutedOptimistic(id: String, muted: Boolean): Boolean =
        updatePreferencesOptimistic(id) { it.copy(isMuted = muted) }

    /** Optimistic archive/unarchive toggle. */
    suspend fun setArchivedOptimistic(id: String, archived: Boolean): Boolean =
        updatePreferencesOptimistic(id) { it.copy(isArchived = archived) }

    /**
     * Optimistic mentions-only toggle (parity iOS `ConversationOptionsViewModel
     * .setMentionsOnly`) — independent of [setMutedOptimistic]; the server treats
     * `isMuted = true` as taking priority, but the two flags are never coupled at
     * the mutation layer on either platform.
     */
    suspend fun setMentionsOnlyOptimistic(id: String, mentionsOnly: Boolean): Boolean =
        updatePreferencesOptimistic(id) { it.copy(mentionsOnly = mentionsOnly) }

    /**
     * Optimistic drag-to-category (re)assignment (parity iOS
     * `ConversationOptionsViewModel.setCategory`): the cached `categoryId` mutates
     * instantly — the section splitter re-buckets the row into [categoryId]'s
     * section — and the full-snapshot mutation joins the shared prefs lane. A no-op
     * (returns false) when the conversation is already in [categoryId].
     */
    suspend fun setCategoryOptimistic(id: String, categoryId: String): Boolean =
        updatePreferencesOptimistic(id) { it.copy(categoryId = categoryId) }

    /**
     * Optimistic per-conversation nickname (rename). Trims [name] and stores it
     * verbatim — including an empty string when the user clears the field — so
     * the outbox snapshot carries an explicit clear rather than a `null` the
     * `explicitNulls = false` encoder would silently drop. The read side
     * ([ApiConversation.displayTitle], `ConversationFilter`) already treats a
     * blank `customName` the same as absent.
     */
    suspend fun setCustomNameOptimistic(id: String, name: String): Boolean {
        val trimmed = name.trim()
        return updatePreferencesOptimistic(id) { it.copy(customName = trimmed) }
    }

    /**
     * Optimistic favorite-reaction toggle (drives the [ConversationFilter.FAVORITES]
     * tab). A `null` [emoji] clears the favorite and is stored as an explicit empty
     * string — same `explicitNulls = false` rationale as [setCustomNameOptimistic] —
     * which [ConversationFilters] already treats the same as absent.
     */
    suspend fun setReactionOptimistic(id: String, emoji: String?): Boolean {
        val value = emoji.orEmpty()
        return updatePreferencesOptimistic(id) { it.copy(reaction = value) }
    }

    /**
     * Optimistic tag-set replacement (the "Tags" context-menu dialog, parity
     * iOS `ConversationOptionsViewModel.setTags`) — trims, drops blanks, and
     * deduplicates (first occurrence wins) before comparing against the
     * cached set, so a no-op edit never enqueues a wasted snapshot. Unlike
     * [setCustomNameOptimistic]/[setReactionOptimistic], an empty list needs
     * no null-vs-empty-string sentinel: `[]` is a real, non-null JSON array
     * value the shared `explicitNulls = false` encoder never drops.
     */
    suspend fun setTagsOptimistic(id: String, tags: List<String>): Boolean {
        val normalized = tags.map { it.trim() }.filter { it.isNotEmpty() }.distinct()
        return updatePreferencesOptimistic(id) { it.copy(tags = normalized) }
    }

    /**
     * Optimistic per-conversation preference update (ARCHITECTURE.md §5): the
     * cached preferences mutate instantly (the filter re-derives the visible
     * list) and a full-snapshot `UPDATE_CONVERSATION_PREFS` mutation joins the
     * shared prefs lane, where the coalescer keeps only the latest snapshot per
     * conversation. No-op (returns false) when the conversation is unknown or
     * [transform] leaves the preferences unchanged.
     */
    private suspend fun updatePreferencesOptimistic(
        id: String,
        transform: (ApiConversationPreferences) -> ApiConversationPreferences,
    ): Boolean {
        val snapshot = database.withTransaction {
            val row = conversationDao.find(id) ?: return@withTransaction null
            val conversation = MeeshyApi.json.decodeFromString<ApiConversation>(row.payload)
            val current = conversation.resolvedPreferences ?: ApiConversationPreferences()
            val next = transform(current)
            if (next == current) return@withTransaction null
            conversationDao.upsertAll(
                listOf(
                    row.copy(
                        payload = MeeshyApi.json.encodeToString(conversation.copy(preferences = next)),
                    ),
                ),
            )
            next
        } ?: return false
        outboxRepository.enqueue(
            OutboxMutation(
                kind = OutboxKind.UPDATE_CONVERSATION_PREFS,
                lane = OutboxLanes.CONVERSATION_PREFS,
                targetId = id,
                payload = MeeshyApi.json.encodeToString(
                    ConversationPrefsPayload(
                        isPinned = snapshot.isPinned,
                        isMuted = snapshot.isMuted,
                        isArchived = snapshot.isArchived,
                        mentionsOnly = snapshot.mentionsOnly,
                        categoryId = snapshot.categoryId,
                        customName = snapshot.customName,
                        reaction = snapshot.reaction,
                        tags = snapshot.tags,
                    ),
                ),
            ),
        )
        return true
    }

    companion object {
        /**
         * Members fetched per roster page. The gateway defaults to 20 and caps at
         * 100; 30 fills a phone screen with headroom so the first "load more" only
         * fires on a genuinely long roster.
         */
        const val PARTICIPANTS_PAGE_SIZE: Int = 30
    }
}
