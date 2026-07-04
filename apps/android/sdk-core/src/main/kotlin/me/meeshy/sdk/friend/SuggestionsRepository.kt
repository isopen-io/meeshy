package me.meeshy.sdk.friend

import androidx.room.withTransaction
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.SuggestionDao
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.core.database.entity.SuggestionEntity
import me.meeshy.core.database.entity.SyncMetaEntity
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.SwrCacheSource
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.cache.cacheFirstFlow
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.user.UserRepository
import javax.inject.Inject
import javax.inject.Singleton

/** Thrown when a suggestions revalidation fails; carries the API error message. */
internal class SuggestionsSyncException(message: String) : Exception(message)

/**
 * Room-backed [SwrCacheSource] for the empty-query discover suggestions — the
 * Android analogue of the iOS `CacheCoordinator.userSearch` empty-query cache,
 * and the last in-memory-only cache to go durable (mirroring
 * [me.meeshy.sdk.call.CallHistoryCacheSource] / `FriendListRepository`).
 *
 * The gateway returns its "discover" list (recent-active / mutual friends) for an
 * empty search query — exactly what iOS `searchUsers(query: "")` hits — and the
 * last successful fetch is persisted so the Discover tab paints instantly on a
 * cold launch, before any network call, then revalidates in the background.
 *
 * Each suggestion is stored as a serialized payload plus a `sortIndex` that
 * preserves the gateway's ranking order (never re-derived in SQL); `sync_meta`
 * records freshness so an unchanged list is not rewritten and a synced-but-empty
 * list (a real "no one to suggest") is distinguished from a cold cache (`null`).
 *
 * A revalidation failure leaves the last good data in place (it throws so
 * [cacheFirstFlow]'s `onRevalidateError` surfaces the message); a cold failure
 * keeps the cache `null` so the UI can retry.
 */
internal class RoomSuggestionsSource(
    private val database: MeeshyDatabase,
    private val suggestionDao: SuggestionDao,
    private val syncMetaDao: SyncMetaDao,
    private val userRepository: UserRepository,
    private val clock: CacheClock,
) : SwrCacheSource<List<UserSearchResult>> {

    override fun observe(): Flow<List<UserSearchResult>?> =
        combine(
            suggestionDao.observeAll(),
            syncMetaDao.observe(RESOURCE_KEY),
        ) { rows, syncedAt ->
            if (rows.isEmpty() && syncedAt == null) {
                null
            } else {
                rows.map { MeeshyApi.json.decodeFromString<UserSearchResult>(it.payload) }
            }
        }

    override fun lastSyncedAt(): Flow<Long?> = syncMetaDao.observe(RESOURCE_KEY)

    override suspend fun revalidate() {
        when (val result = userRepository.searchUsers(SUGGESTIONS_QUERY, SUGGESTIONS_LIMIT, 0)) {
            is NetworkResult.Success -> persist(result.data)
            is NetworkResult.Failure -> throw SuggestionsSyncException(result.error.message)
        }
    }

    private suspend fun persist(users: List<UserSearchResult>) {
        val now = clock.nowMillis()
        val rows = users.mapIndexed { index, user ->
            SuggestionEntity(
                userId = user.id,
                payload = MeeshyApi.json.encodeToString(user),
                sortIndex = index,
                cachedAt = now,
            )
        }
        database.withTransaction {
            if (rows.isEmpty()) {
                suggestionDao.clear()
            } else {
                suggestionDao.upsertAll(rows)
                suggestionDao.deleteNotIn(rows.map { it.userId })
            }
            syncMetaDao.upsert(SyncMetaEntity(RESOURCE_KEY, now))
        }
    }

    internal companion object {
        const val RESOURCE_KEY: String = "discover_suggestions"

        /** Empty query — the gateway returns the discover suggestions list. */
        const val SUGGESTIONS_QUERY: String = ""
        const val SUGGESTIONS_LIMIT: Int = 20
    }
}

/**
 * The discover-suggestions surface — port of the iOS
 * `DiscoverViewModel.loadSuggestions` cache-first path. [suggestionsStream]
 * serves the last persisted suggestions immediately (no cold spinner, cold or
 * offline, surviving process death) and revalidates against the network in the
 * background.
 */
@Singleton
class SuggestionsRepository @Inject constructor(
    database: MeeshyDatabase,
    suggestionDao: SuggestionDao,
    syncMetaDao: SyncMetaDao,
    userRepository: UserRepository,
) {
    private val source = RoomSuggestionsSource(
        database = database,
        suggestionDao = suggestionDao,
        syncMetaDao = syncMetaDao,
        userRepository = userRepository,
        clock = SystemCacheClock,
    )

    fun suggestionsStream(
        onSyncError: (Throwable) -> Unit = {},
    ): Flow<CacheResult<List<UserSearchResult>>> =
        cacheFirstFlow(CachePolicy.Suggestions, source, onRevalidateError = onSyncError)
}
