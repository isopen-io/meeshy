package me.meeshy.sdk.preferences

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.cache.cacheFirstFlow
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.ConversationReorder
import me.meeshy.sdk.model.ConversationReorderBody
import me.meeshy.sdk.model.ConversationReorderItem
import me.meeshy.sdk.model.PreferenceCategory
import me.meeshy.sdk.model.UserPreferences
import me.meeshy.sdk.model.distinctSortedTags
import me.meeshy.sdk.model.routeSegment
import me.meeshy.sdk.model.withCategoryReset
import me.meeshy.sdk.model.withPatch
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ConversationPreferencesApi
import me.meeshy.sdk.net.api.PreferencesApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.net.apiCallUnit
import javax.inject.Inject
import javax.inject.Singleton

/** How a drag-to-reorder left the device (iOS `reorderConversations`, with an offline queue). */
public sealed interface ReorderOutcome {
    /** The gateway accepted the order. */
    public data object Sent : ReorderOutcome

    /** Offline: the order is held and rides the next reorder or [PreferencesRepository.flushPendingReorder]. */
    public data object Queued : ReorderOutcome

    /** The gateway refused it; nothing is held. */
    public data class Rejected(val message: String) : ReorderOutcome
}

/**
 * Cache-first owner of the account-level preference reads and writes (parity iOS
 * `PreferenceService`): the whole aggregate (`GET /me/preferences`), the user's
 * conversation tags, one conversation's row, per-block patch and reset, and the
 * conversation reorder. Reads go through [cacheFirstFlow] — the snapshot is served at once
 * and revalidated silently, a network failure never clears it.
 */
@Singleton
public class PreferencesRepository @Inject constructor(
    private val preferencesApi: PreferencesApi,
    private val conversationPreferencesApi: ConversationPreferencesApi,
    private val store: PreferenceSnapshotStore,
    private val json: Json,
    private val clock: CacheClock = SystemCacheClock,
) {
    private val pendingLock = Mutex()
    private var pendingReorder: List<ConversationReorderItem> = emptyList()

    private val allSource = PreferenceJsonCacheSource(
        store, ALL_KEY, UserPreferences.serializer(), json, clock,
    ) { apiCall { preferencesApi.getAll() } }

    private val tagsSource = PreferenceJsonCacheSource(
        store, TAGS_KEY, ListSerializer(String.serializer()), json, clock,
    ) {
        apiCall { conversationPreferencesApi.listPreferences(offset = 0, limit = TAGS_PAGE_SIZE) }
            .map { it.distinctSortedTags() }
    }

    public fun allPreferencesStream(
        policy: CachePolicy = CachePolicy.Default,
        onSyncError: (Throwable) -> Unit = {},
    ): Flow<CacheResult<UserPreferences>> =
        cacheFirstFlow(policy, allSource, clock = clock, onRevalidateError = onSyncError)

    public fun conversationTagsStream(
        policy: CachePolicy = CachePolicy.Default,
        onSyncError: (Throwable) -> Unit = {},
    ): Flow<CacheResult<List<String>>> =
        cacheFirstFlow(policy, tagsSource, clock = clock, onRevalidateError = onSyncError)

    public fun conversationPreferencesStream(
        conversationId: String,
        policy: CachePolicy = CachePolicy.Default,
        onSyncError: (Throwable) -> Unit = {},
    ): Flow<CacheResult<ApiConversationPreferences>> {
        val source = PreferenceJsonCacheSource(
            store, conversationKey(conversationId), ApiConversationPreferences.serializer(), json, clock,
        ) { apiCall { conversationPreferencesApi.getPreferences(conversationId) } }
        return cacheFirstFlow(policy, source, clock = clock, onRevalidateError = onSyncError)
    }

    /** Explicit refresh of the aggregate (pull-to-refresh / retry). Throws on failure. */
    public suspend fun refreshAllPreferences() {
        allSource.revalidate()
    }

    /**
     * Patches one block: applied to the cached aggregate first (instant feedback), sent,
     * and rolled back to the snapshot taken before when the gateway does not accept it.
     */
    public suspend fun patch(category: PreferenceCategory, patch: JsonObject): NetworkResult<Unit> {
        val before = cachedAll()
        before?.let { writeAll(it.withPatch(category, patch, json)) }
        val result = apiCallUnit { preferencesApi.patchBlock(category.routeSegment, patch) }
        if (result is NetworkResult.Failure) before?.let { writeAll(it) }
        return result
    }

    /**
     * Resets one block to the gateway defaults, then replaces the cache with what the
     * gateway now serves; when that re-read cannot happen (offline), the block is reset
     * locally to the model defaults so the cache never keeps the discarded values.
     */
    public suspend fun reset(category: PreferenceCategory): NetworkResult<Unit> {
        val result = apiCallUnit { preferencesApi.resetBlock(category.routeSegment) }
        if (result is NetworkResult.Failure) return result
        val reread = runCatching { allSource.revalidate() }
        if (reread.isFailure) cachedAll()?.let { writeAll(it.withCategoryReset(category)) }
        return result
    }

    /**
     * Sends the new `orderInCategory` of the rows a drag moved. Offline, the update is held
     * (latest order per conversation wins) and sent with the next call.
     */
    public suspend fun reorderConversations(updates: List<ConversationReorderItem>): ReorderOutcome =
        pendingLock.withLock {
            val batch = ConversationReorder.coalesce(pendingReorder, updates)
            if (batch.isEmpty()) return@withLock ReorderOutcome.Sent
            when (val result = apiCallUnit { conversationPreferencesApi.reorder(ConversationReorderBody(batch)) }) {
                is NetworkResult.Success -> {
                    pendingReorder = emptyList()
                    ReorderOutcome.Sent
                }
                is NetworkResult.Failure -> if (result.error.code == NETWORK_CODE) {
                    pendingReorder = batch
                    ReorderOutcome.Queued
                } else {
                    pendingReorder = emptyList()
                    ReorderOutcome.Rejected(result.error.message)
                }
            }
        }

    /** Retries a held reorder (reconnection hook). A no-op when nothing is held. */
    public suspend fun flushPendingReorder(): ReorderOutcome = reorderConversations(emptyList())

    private suspend fun cachedAll(): UserPreferences? =
        allSource.observe().first()

    private suspend fun writeAll(prefs: UserPreferences) {
        val stamp = store.lastSyncedAt(ALL_KEY).first() ?: clock.nowMillis()
        store.save(ALL_KEY, json.encodeToString(UserPreferences.serializer(), prefs), stamp)
    }

    private companion object {
        const val ALL_KEY = "all"
        const val TAGS_KEY = "tags"
        const val TAGS_PAGE_SIZE = 200
        const val NETWORK_CODE = "NETWORK"
        fun conversationKey(id: String) = "conversation:$id"
    }
}
