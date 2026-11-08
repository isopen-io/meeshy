package me.meeshy.sdk.story

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.StoryDao
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.cache.cacheFirstFlow
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.PostTranslationMerge
import me.meeshy.sdk.model.StoryRealtimeFold
import me.meeshy.sdk.model.StoryTranslationMerge
import me.meeshy.sdk.model.StoryUpdateMerge
import me.meeshy.sdk.model.ContentRemovalRequest
import me.meeshy.sdk.model.StoryViewer
import me.meeshy.sdk.model.StoryViewersOutcome
import me.meeshy.sdk.model.postTypeFromWire
import me.meeshy.sdk.model.toStoryViewer
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.deletionCall
import me.meeshy.sdk.net.api.StoryTranslationRequest
import me.meeshy.sdk.net.PagedResult
import me.meeshy.sdk.net.pagedApiCall
import me.meeshy.sdk.net.api.CreateCommentRequest
import me.meeshy.sdk.net.api.CreateStoryRequest
import me.meeshy.sdk.net.api.RepostPostRequest
import me.meeshy.sdk.net.api.StoryApi
import me.meeshy.sdk.net.api.StoryLikeRequest
import me.meeshy.sdk.net.api.TranslateRequest
import me.meeshy.sdk.net.api.TranslationApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.OutboxState
import me.meeshy.sdk.outbox.kindEnum
import me.meeshy.sdk.outbox.stateEnum
import me.meeshy.sdk.session.commitOrWrite
import timber.log.Timber
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/** Story feed, reactions and reposts — port of StoryService (StoryService.swift). */
@Singleton
class StoryRepository @Inject constructor(
    private val storyApi: StoryApi,
    database: MeeshyDatabase,
    storyDao: StoryDao,
    syncMetaDao: SyncMetaDao,
    private val outboxRepository: OutboxRepository,
    private val translationApi: TranslationApi,
    private val archiveCache: MyStoriesArchiveCache = InMemoryMyStoriesArchiveCache(),
    private val fence: me.meeshy.sdk.session.AccountFence? = null,
    private val postCache: StoryPostCache = StoryPostCache(),
    private val session: me.meeshy.sdk.session.SessionRepository? = null,
) {
    private val cacheSource = StoryCacheSource(
        database = database,
        storyDao = storyDao,
        syncMetaDao = syncMetaDao,
        storyApi = storyApi,
        clock = SystemCacheClock,
        fence = fence,
        viewerId = { session?.currentUserId },
    )

    /**
     * Cache-first stories tray stream (ARCHITECTURE.md §4): the cached feed is
     * served immediately (no cold spinner when rows exist) and revalidated in
     * the background. [onSyncError] surfaces a failed background revalidation so
     * the UI can leave its cold skeleton.
     */
    fun storiesStream(
        policy: CachePolicy = CachePolicy.Stories,
        onSyncError: (Throwable) -> Unit = {},
    ): Flow<CacheResult<List<ApiPost>>> =
        cacheFirstFlow(policy, cacheSource, onRevalidateError = onSyncError)

    /** Explicit refresh (pull-to-refresh / retry). Throws on failure. */
    suspend fun refresh() {
        cacheSource.revalidate()
    }

    /**
     * A story this device just published joins the tray cache at once, so its ring hands off
     * from the optimistic one without waiting for the next revalidation (iOS inserts the
     * published story on success). The next revalidation stays authoritative.
     */
    suspend fun adoptPublished(story: ApiPost) {
        cacheSource.upsertLocal(story, cacheSource.ticket())
    }

    /**
     * Folds a realtime `story:created` into the tray cache: an unknown story joins at once,
     * a story already held is left untouched — append-dedup, iOS
     * `insertOrMergeStoryGroups(replacingExisting: false)`. Re-writing a held row with the
     * broadcast payload would wipe the reader's monotone seen state (the payload carries no
     * `isViewedByMe`) and, for our own echoed publish, the copy already adopted. Returns
     * whether the cache changed.
     */
    suspend fun adoptAnnounced(story: ApiPost): Boolean {
        val ticket = cacheSource.ticket()
        if (cacheSource.findLocal(story.id) != null) return false
        cacheSource.upsertLocal(story, ticket)
        return true
    }

    /**
     * Folds a realtime `post:reposted` into the tray cache (#14466): the gateway announces a
     * republication only by `post:reposted`, never by `story:created`, to the reposter's
     * visibility-filtered audience. A repost served as a story joins the tray like an announced
     * story ([adoptAnnounced]); a repost into the feed stays out. Returns whether the cache changed.
     */
    suspend fun adoptAnnouncedRepost(repost: ApiPost): Boolean =
        postTypeFromWire(repost.type) == PostType.STORY && adoptAnnounced(repost)

    /**
     * Folds a realtime `story:deleted` into the authoritative Room cache so the tray
     * stream repaints without the removed story. Idempotent and inert for an unknown id
     * (over-broadcast delivery). Mirrors the viewer's `StoryPlayback.removingSlide`, but
     * for the Room-backed tray. Port of iOS `StoryViewModel.storyDeleted → purgeDeadStories`.
     */
    suspend fun removeCachedStory(storyId: String) {
        postCache.invalidate(setOf(storyId))
        cacheSource.deleteLocal(storyId, cacheSource.ticket())
    }

    /** [removeCachedStory] sous [ticket], pris AVANT la requête dont la réponse retire la story (#13560). */
    suspend fun removeCachedStory(storyId: String, ticket: me.meeshy.sdk.session.AccountTicket?) {
        postCache.invalidate(setOf(storyId))
        cacheSource.deleteLocal(storyId, ticket)
    }

    /**
     * Le compte auquel appartient un geste qui part MAINTENANT (#13560) : à prendre AVANT la requête dont la réponse
     * écrit l'archive « Mes stories » ([persistMyStories]) ou retire une story ([removeCachedStory]).
     */
    suspend fun ticket(): me.meeshy.sdk.session.AccountTicket? = cacheSource.ticket()

    /**
     * Folds a realtime `story:updated` into the authoritative Room cache so the tray stream
     * repaints with the edit. [engagementReset] `true` marks a content edit that wiped
     * views/reactions server-side (the ring reverts to unseen); `false` / metadata-only keeps
     * the reader's monotone seen state. [currentUserId] identifies the author exception (an
     * author's own seen state is client-only and survives a reset). Inert — nothing persisted,
     * returns `false` — for an unknown id (over-broadcast) or a no-op merge (a re-broadcast).
     * Port of iOS `StoryViewModel.storyUpdated`.
     */
    suspend fun applyStoryUpdate(
        updated: ApiPost,
        engagementReset: Boolean,
        currentUserId: String?,
    ): Boolean {
        val ticket = cacheSource.ticket()
        val previous = cacheSource.findLocal(updated.id) ?: return false
        val isOwnStory = currentUserId != null && updated.author?.id == currentUserId
        val merged = StoryUpdateMerge.merge(previous, updated, engagementReset, isOwnStory) ?: return false
        cacheSource.upsertLocal(merged, ticket)
        return true
    }

    /**
     * Balayage d'expiration (chaque minute, iOS) : retire du cache les stories devenues mortes, sauf celles du
     * lecteur, et rend leurs ids. Le plateau se repeint sans elles ; aucun réseau.
     */
    suspend fun sweepExpired(): List<String> =
        cacheSource.sweepExpired().also { postCache.invalidate(it.toSet()) }

    /** `story:viewed` : le total de vues autoritatif de l'événement, chez l'auteur qui regarde son compteur bouger. */
    suspend fun applyStoryViewed(storyId: String, viewCount: Int?): Boolean =
        foldLocal(storyId) { StoryRealtimeFold.viewed(it, viewCount) }

    /** `story:reacted` (+1) / `story:unreacted` (−1) : compteur par emoji, et mes réactions si l'acteur est le lecteur. */
    suspend fun applyStoryReaction(storyId: String, emoji: String, actorId: String, myId: String?, delta: Int): Boolean =
        foldLocal(storyId) { StoryRealtimeFold.reactionDelta(it, emoji, actorId, myId, delta) }

    /** `comment:added` / `comment:deleted` : le total de commentaires est autoritatif (jamais un ±1 qui dérive). */
    suspend fun applyStoryCommentCount(storyId: String, commentCount: Int): Boolean =
        foldLocal(storyId) { post -> post.takeIf { it.commentCount != commentCount }?.copy(commentCount = commentCount) }

    /** `post:translation-updated` d'une story tenue : sa légende gagne la langue sans nouvelle requête. */
    suspend fun applyStoryTranslation(storyId: String, language: String, entry: me.meeshy.sdk.model.ApiPostTranslationEntry): Boolean =
        foldLocal(storyId) { PostTranslationMerge.mergeTranslation(it, language, entry) }

    private suspend fun foldLocal(storyId: String, fold: (ApiPost) -> ApiPost?): Boolean {
        val ticket = cacheSource.ticket()
        val previous = cacheSource.findLocal(storyId) ?: return false
        val next = fold(previous) ?: return false
        cacheSource.upsertLocal(next, ticket)
        return true
    }

    /**
     * Les stories déjà en main dans le cache de la barre, sans réseau : le lecteur s'ouvre
     * sur ce que l'anneau touché montrait, hors ligne compris (iOS
     * `StoryViewerContainer.ensureGroupAvailable`, cache d'abord).
     */
    suspend fun cachedStories(): List<ApiPost> = cacheSource.readLocal()

    suspend fun list(cursor: String? = null, limit: Int = 50): NetworkResult<List<ApiPost>> =
        apiCall { storyApi.list(cursor, limit) }.alsoCaching()

    /**
     * Synchronisation par delta (iOS `StoryService.list(updatedSince:)`) : [updatedSince] est un instant
     * ISO8601 ; la passerelle ne rend que les stories créées ou modifiées depuis, et `meta.deletedStoryIds`
     * porte les disparitions. Les stories annoncées supprimées sont évincées du cache par id.
     */
    suspend fun listDelta(updatedSince: String, cursor: String? = null, limit: Int = 50): NetworkResult<StoryDelta> =
        when (val result = pagedApiCall { storyApi.list(cursor, limit, updatedSince) }) {
            is NetworkResult.Failure -> result
            is NetworkResult.Success -> {
                val page = result.data
                val tombstones = page.meta?.storyTombstones
                postCache.putAll(page.data)
                tombstones?.let { postCache.invalidate(it.ids.toSet()) }
                NetworkResult.Success(
                    StoryDelta(
                        posts = page.data,
                        tombstones = tombstones,
                        nextCursor = page.pagination?.nextCursor,
                        hasMore = page.pagination?.hasMore ?: false,
                    ),
                )
            }
        }

    private fun NetworkResult<List<ApiPost>>.alsoCaching(): NetworkResult<List<ApiPost>> {
        if (this is NetworkResult.Success) postCache.putAll(data)
        return this
    }

    /** La story déjà en mémoire par id (deep-link de notification), sans réseau. */
    fun cachedPost(id: String): ApiPost? = postCache.get(id)

    /** Pose une story dans le cache par id (ex. story préchargée par une notification). */
    fun cache(post: ApiPost) = postCache.put(post)

    /** Évince des stories du cache par id : une story supprimée ne ressuscite pas au premier lien. */
    fun invalidate(ids: Set<String>) = postCache.invalidate(ids)

    /** One cursor page of the caller's own stories (`GET posts/stories/mine`), pagination kept. */
    suspend fun listMine(cursor: String? = null, limit: Int = 50): NetworkResult<PagedResult<List<ApiPost>>> =
        pagedApiCall { storyApi.listMine(cursor, limit) }.also { result ->
            if (result is NetworkResult.Success) postCache.putAll(result.data.data)
        }

    /** The last drained « Mes stories » archive, served instantly while a drain revalidates. */
    suspend fun cachedMyStories(): List<ApiPost>? = archiveCache.read()

    /**
     * Drains the caller's whole story archive page by page and caches it ([MyStoriesArchiveCache.KEY]).
     * Stops on exhaustion (`hasMore` false or no `nextCursor`) or on stagnation — an empty page
     * or a page bringing no new id — and after [maxPages] as a hard stop. A failure on the first
     * page is a [NetworkResult.Failure]; a failure on a later page keeps what was already
     * drained. A drain that returned nothing never overwrites a non-empty cache.
     */
    suspend fun drainMyStories(limit: Int = 50, maxPages: Int = MAX_ARCHIVE_PAGES): NetworkResult<List<ApiPost>> {
        val ticket = cacheSource.ticket()
        val collected = LinkedHashMap<String, ApiPost>()
        var cursor: String? = null
        repeat(maxPages) { page ->
            val result = listMine(cursor, limit)
            val paged = when (result) {
                is NetworkResult.Success -> result.data
                is NetworkResult.Failure ->
                    return if (page == 0) result else finishDrain(collected, ticket)
            }
            val before = collected.size
            paged.data.forEach { collected.putIfAbsent(it.id, it) }
            val stagnant = paged.data.isEmpty() || collected.size == before
            val next = paged.pagination?.nextCursor
            if (stagnant || paged.pagination?.hasMore != true || next.isNullOrEmpty()) return finishDrain(collected, ticket)
            cursor = next
        }
        return finishDrain(collected, ticket)
    }

    private suspend fun finishDrain(
        collected: Map<String, ApiPost>,
        ticket: me.meeshy.sdk.session.AccountTicket?,
    ): NetworkResult<List<ApiPost>> {
        val posts = collected.values.toList()
        if (posts.isNotEmpty()) fence.commitOrWrite(ticket) { archiveCache.write(posts) }
        return NetworkResult.Success(posts)
    }

    /**
     * Persists the screen's current « Mes stories » list so a delete or republish survives a restart — under [ticket],
     * taken at the gesture BEFORE its request (#13560): A's answer never writes B's archive.
     */
    suspend fun persistMyStories(posts: List<ApiPost>, ticket: me.meeshy.sdk.session.AccountTicket?) {
        fence.commitOrWrite(ticket) { archiveCache.write(posts) }
    }

    /** `POST posts/{id}/republish` — the same story, fresh dates, zeroed engagement. */
    suspend fun republish(storyId: String): NetworkResult<ApiPost> =
        apiCall { storyApi.republish(storyId) }.also { result ->
            if (result is NetworkResult.Success) postCache.put(result.data)
        }

    /**
     * La vue est appliquée au cache de la barre AVANT l'appel réseau : l'anneau et ses
     * points se grisent dès le retour à la liste, et l'ordre (non vus d'abord) suit — même
     * hors ligne, comme iOS qui marque la story vue localement. La vue est monotone : la
     * revalidation et `story:updated` ne la défont pas ([StoryUpdateMerge]).
     */
    suspend fun markViewed(storyId: String): NetworkResult<Unit> {
        markViewedLocally(storyId)
        return apiCall { storyApi.markViewed(storyId) }
    }

    private suspend fun markViewedLocally(storyId: String) {
        val ticket = cacheSource.ticket()
        val cached = cacheSource.findLocal(storyId) ?: return
        if (cached.isViewedByMe == true) return
        cacheSource.upsertLocal(cached.copy(isViewedByMe = true), ticket)
    }

    suspend fun delete(storyId: String): NetworkResult<Unit> =
        apiCall { storyApi.delete(storyId) }.also { if (it is NetworkResult.Success) postCache.invalidate(setOf(storyId)) }

    /**
     * Retrait de la story d'un AUTRE avec son motif (#11151). Sans motif exploitable (absent ou blanc), le
     * DELETE part sans corps, à l'octet près comme [delete] — rétrocompatible avec une passerelle qui n'en lit pas.
     */
    suspend fun delete(storyId: String, reason: String?): NetworkResult<Unit> {
        val body = ContentRemovalRequest.forReason(reason) ?: return delete(storyId)
        return when (val result = deletionCall { storyApi.deleteWithReason(storyId, body) }) {
            is NetworkResult.Failure -> result
            is NetworkResult.Success -> {
                postCache.invalidate(setOf(storyId))
                NetworkResult.Success(Unit)
            }
        }
    }

    suspend fun react(storyId: String, emoji: String): NetworkResult<Unit> =
        apiCall { storyApi.react(storyId, StoryLikeRequest(emoji)) }

    /**
     * [react] avec son issue triée (iOS `StoryReactionRecovery`) : un REFUS du serveur (409
     * `REACTION_LIMIT_REACHED`, 403, 404…) se distingue d'une PANNE de transport, pour que l'appelant
     * rembobine l'un et mette l'autre en file.
     */
    suspend fun reactOutcome(storyId: String, emoji: String): StoryReactionOutcome =
        when (val result = react(storyId, emoji)) {
            is NetworkResult.Success -> StoryReactionOutcome.Applied
            is NetworkResult.Failure -> StoryReactionOutcome.of(result.error)
        }

    /**
     * Demande la traduction serveur d'une story (`POST /posts/:id/translate`), `force` rejouant une langue
     * DÉJÀ traduite (« Retraduire »). La charge arrive par le socket social : un 2xx suffit.
     */
    suspend fun requestTranslation(storyId: String, targetLanguage: String, force: Boolean = false): NetworkResult<Unit> {
        val target = targetLanguage.trim()
        if (target.isEmpty()) return NetworkResult.Failure(ApiError(message = "Empty target language", code = "INVALID_LANGUAGE"))
        val body = StoryTranslationRequest(target, force.takeIf { it })
        return when (val result = deletionCall { storyApi.requestTranslation(storyId, body) }) {
            is NetworkResult.Failure -> result
            is NetworkResult.Success -> NetworkResult.Success(Unit)
        }
    }

    suspend fun comment(storyId: String, content: String): NetworkResult<ApiPostComment> =
        apiCall { storyApi.comment(storyId, CreateCommentRequest(content)) }

    /** Fetches the comments under a story (oldest-first ordering is the overlay's job). */
    suspend fun comments(
        storyId: String,
        cursor: String? = null,
        limit: Int = 50,
    ): NetworkResult<List<ApiPostComment>> =
        apiCall { storyApi.comments(storyId, cursor, limit) }

    /**
     * Republie la story EN STORY (iOS `StoryDirectRepost`) : sans `targetType`, la passerelle en ferait un post. La story
     * que la passerelle rend en 201 rejoint aussitôt la barre (#14458) : une republication ne s'annonce que par
     * `post:reposted`, jamais par `story:created`, et rien d'autre ne l'apporterait avant la revalidation suivante.
     */
    suspend fun repost(storyId: String): NetworkResult<Unit> =
        when (val result = apiCall { storyApi.repost(storyId, RepostPostRequest(targetType = PostType.STORY.name)) }) {
            is NetworkResult.Failure -> result
            is NetworkResult.Success -> {
                adoptRepost(result.data)
                NetworkResult.Success(Unit)
            }
        }

    /** Une republication faite ne devient pas un échec parce que le cache local a refusé l'écriture. */
    internal suspend fun adoptRepost(story: ApiPost) {
        if (postTypeFromWire(story.type) != PostType.STORY) return
        try {
            adoptPublished(story)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Timber.w(e, "story repost: tray adoption failed")
        }
    }

    suspend fun fetchPost(id: String): NetworkResult<ApiPost> =
        apiCall { storyApi.fetchPost(id) }.also { result ->
            if (result is NetworkResult.Success) postCache.put(result.data)
        }

    /**
     * Durably enqueues a story publish on the outbox (ARCHITECTURE.md §5): the
     * request is persisted and delivered by `OutboxFlushWorker` on its own
     * [OutboxLanes.STORY] lane, so a slow upload never head-of-line-blocks
     * messages and the publish survives process death / offline. Each publish is
     * an independent row keyed by a fresh temp id (no coalescing across stories).
     *
     * @param dependsOn the `cmid`s of the prerequisite `UPLOAD_MEDIA` rows this
     *   publish must wait for (their placeholder media ids ride in `request.mediaIds`);
     *   the drainer holds the publish until **every** one delivers, then grafts each
     *   real id in. Empty for a publish with no offline-queued media. Several entries
     *   gate the publish on multiple offline uploads at once.
     * @return the queued row's `cmid` (drives optimistic-rollback observation).
     */
    suspend fun enqueuePublish(request: CreateStoryRequest, dependsOn: List<String> = emptyList()): String? {
        // A story reopened from « Publications non envoyées » (#13500) waits on the uploads of its first
        // publication: one that gave up is revived — the author publishes again — never sent a second time.
        dependsOn.filter { outboxRepository.stateOf(it) == OutboxState.EXHAUSTED }.forEach { outboxRepository.retry(it) }
        return outboxRepository.enqueue(
            OutboxMutation(
                kind = OutboxKind.PUBLISH_STORY,
                lane = OutboxLanes.STORY,
                targetId = "pending_${UUID.randomUUID()}",
                payload = MeeshyApi.json.encodeToString(sealedForPublication(request)),
                dependsOn = dependsOn.toSet(),
            ),
        )
    }

    /**
     * A published canvas may only designate media the post owns (#5280): a canvas
     * naming a row the post does not list paints BLANK for every viewer, with no
     * error anywhere. The orphans are journaled (ids only — never content), then
     * [PublishMediaWriteBack.seal] attaches everything the canvas designates —
     * pre-uploaded media, sounds, stickers — so the server does not sweep it a day
     * later as an abandoned upload. A caller that prefers to refuse the send asks
     * [PublishMediaWriteBack.coherenceOf] first.
     */
    private fun sealedForPublication(request: CreateStoryRequest): CreateStoryRequest {
        val coherence = PublishMediaWriteBack.coherenceOf(request)
        if (coherence is PublishCoherence.Orphans) {
            Timber.w("publish: canvas designates %d media the post did not list: %s", coherence.ids.size, coherence.ids)
        }
        return PublishMediaWriteBack.seal(request)
    }

    /**
     * The story-publish queue as a **single consistent snapshot** (ARCHITECTURE.md
     * §5): the live (`PENDING`/`INFLIGHT`) publishes for the optimistic self-ring
     * and the `EXHAUSTED` ones for the failure strip, both derived from **one**
     * `observeAll()` emission. Deriving them together matters: a publish that
     * transitions `PENDING → EXHAUSTED` leaves `pending` and enters `failed` in the
     * *same* emission, so a consumer can never observe a transient frame where the
     * row is in neither set (which would otherwise read as a spurious delivery).
     * Undecodable / blank-content rows are skipped defensively.
     */
    fun publishQueue(): Flow<StoryPublishQueue> =
        outboxRepository.observeAll().map { rows ->
            val storyRows = rows.filter { it.kindEnum == OutboxKind.PUBLISH_STORY }
            StoryPublishQueue(
                pending = storyRows
                    .filter { it.stateEnum in LIVE_PUBLISH_STATES }
                    .mapNotNull { it.toPendingStoryPublish() },
                failed = storyRows
                    .filter { it.stateEnum == OutboxState.EXHAUSTED }
                    .mapNotNull { it.toFailedStoryPublish() },
            )
        }

    /**
     * Live story publishes still in flight on the durable outbox, decoded for the
     * tray's optimistic self-ring — the `pending` projection of [publishQueue].
     * Only `PENDING`/`INFLIGHT` rows are surfaced; an exhausted row is **rolled
     * back** automatically, a delivered row is deleted and likewise drops out.
     */
    fun pendingPublishes(): Flow<List<PendingStoryPublish>> = publishQueue().map { it.pending }

    private fun OutboxEntity.toPendingStoryPublish(): PendingStoryPublish? {
        val request = decodeStoryPublish() ?: return null
        return PendingStoryPublish(
            tempId = targetId,
            content = request.content,
            visibility = request.visibility,
            originalLanguage = request.originalLanguage,
            createdAtMillis = createdAt,
            mediaIds = request.mediaIds,
            cmid = cmid,
        )
    }

    /**
     * Story publishes that **exhausted** their durable-outbox retries — the
     * `failed` projection of [publishQueue]. Each carries the `cmid` so the tray
     * can offer a user-initiated retry ([retryPublish]) or a discard
     * ([discardPublish]). Surpasses iOS, whose optimistic story silently
     * evaporates on failure with no recovery.
     */
    fun failedPublishes(): Flow<List<FailedStoryPublish>> = publishQueue().map { it.failed }

    /**
     * Revives an exhausted publish for a user-initiated retry — back to the live
     * queue with a fresh attempt budget, the uploads it waits on with it (#13417: an
     * upload that gave up keeps its bytes now, so the retry can actually run). The
     * caller kicks the drain worker.
     * @return `false` when the row no longer exists.
     */
    suspend fun retryPublish(cmid: String): Boolean = outboxRepository.retryWithPrerequisites(cmid)

    /** Permanently discards an exhausted publish the user no longer wants to retry. */
    suspend fun discardPublish(cmid: String) = outboxRepository.discard(cmid)

    /** Ce qu'un échec de publication portait, pour le reprendre en brouillon ; `null` si la ligne n'est plus un échec lisible. */
    suspend fun failedPublishRequest(cmid: String): StoryFailedRequest? {
        val row = outboxRepository.row(cmid)?.takeIf { it.kindEnum == OutboxKind.PUBLISH_STORY && it.stateEnum == OutboxState.EXHAUSTED }
            ?: return null
        val request = runCatching { MeeshyApi.json.decodeFromString<CreateStoryRequest>(row.payload) }.getOrNull() ?: return null
        return StoryFailedRequest(
            content = request.content,
            mediaIds = request.mediaIds.orEmpty(),
            visibility = request.visibility,
            visibilityUserIds = request.visibilityUserIds.orEmpty(),
            repostOfId = request.repostOfId,
        )
    }

    private fun OutboxEntity.toFailedStoryPublish(): FailedStoryPublish? {
        val request = decodeStoryPublish() ?: return null
        return FailedStoryPublish(
            cmid = cmid,
            tempId = targetId,
            content = request.content,
            visibility = request.visibility,
            originalLanguage = request.originalLanguage,
            createdAtMillis = createdAt,
            failedAtMillis = updatedAt,
            mediaIds = request.mediaIds,
        )
    }

    /**
     * A story publish decoded from this row's payload, or null if undecodable or
     * carrying nothing to show. A publish is shown when it has non-blank text OR at
     * least one non-blank media id: a media-only (RAW background) story is a
     * first-class publish (its [content] stays null), matching iOS, where an
     * image/video-only story queues just like a captioned one. A row with neither
     * text nor media is skipped defensively.
     */
    private fun OutboxEntity.decodeStoryPublish(): DecodedStoryPublish? {
        val request = runCatching {
            MeeshyApi.json.decodeFromString<CreateStoryRequest>(payload)
        }.getOrNull() ?: return null
        val content = request.content?.takeIf { it.isNotBlank() }
        val mediaIds = request.mediaIds.orEmpty().filter { it.isNotBlank() }
        if (content == null && mediaIds.isEmpty()) return null
        return DecodedStoryPublish(content, request.visibility, request.originalLanguage, mediaIds)
    }

    private data class DecodedStoryPublish(
        val content: String?,
        val visibility: String,
        val originalLanguage: String?,
        val mediaIds: List<String>,
    )

    /**
     * Fetches the viewers of a story (with their optional reaction), mapping the
     * wire payload to domain [StoryViewer]s. Port of iOS
     * `StoryInteractionService.loadViewers`.
     */
    suspend fun viewers(storyId: String): NetworkResult<List<StoryViewer>> =
        apiCall { storyApi.viewers(storyId) }.map { it.viewers.map { wire -> wire.toStoryViewer() } }

    /** La liste des vues à trois issues (iOS `loadViewerList`) : chargée, refusée (403) ou en panne. */
    suspend fun viewerList(storyId: String): StoryViewersOutcome =
        when (val result = viewers(storyId)) {
            is NetworkResult.Success -> StoryViewersOutcome.Loaded(result.data)
            is NetworkResult.Failure -> StoryViewersOutcome.failure(result.error.httpStatus)
        }

    /**
     * On-demand story translation (Prisme, pull side): the viewer tapped a configured
     * language the story has no content for yet. Blocking-translates [item]'s original
     * text into [targetLanguage] and returns the merged story the caller swaps in — the
     * story-shaped sibling of [me.meeshy.sdk.post.PostRepository.translatePost] (stories
     * carry no translation socket consumer, so the faithful move is pull-and-return, not
     * a socket wait).
     *
     * Returns `null` — inert, no state to change — when the target is blank, the story has
     * no source text, the network call fails, the translator returns a blank string, or the
     * translation already matches what is stored (idempotent), mirroring [StoryTranslationMerge].
     */
    suspend fun translateStory(item: StoryItem, targetLanguage: String): StoryItem? {
        val target = targetLanguage.trim()
        if (target.isEmpty()) return null
        val source = item.content?.takeIf { it.isNotBlank() } ?: return null

        val translated = when (
            val result = apiCall {
                translationApi.translate(
                    TranslateRequest(
                        text = source,
                        sourceLanguage = "",
                        targetLanguage = target,
                    ),
                )
            }
        ) {
            is NetworkResult.Success -> result.data.translatedText
            is NetworkResult.Failure -> return null
        }
        if (translated.isBlank()) return null
        return StoryTranslationMerge.mergeTranslation(item, target, translated)
    }

    private companion object {
        const val MAX_ARCHIVE_PAGES = 10

        /** Outbox states that still represent an un-rolled-back publish. */
        val LIVE_PUBLISH_STATES = setOf(OutboxState.PENDING, OutboxState.INFLIGHT)
    }
}
