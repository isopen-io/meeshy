package me.meeshy.sdk.conversation

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.cache.classifyCache
import me.meeshy.sdk.model.MemberRoster
import me.meeshy.sdk.model.MemberRosterPage
import me.meeshy.sdk.net.NetworkResult

/** One network page of a conversation's roster: (conversationId, cursor, limit). */
typealias ParticipantPageFetcher = suspend (String, String?, Int) -> NetworkResult<MemberRosterPage>

/**
 * Cache-first roster of a conversation's members — Android port of iOS `ParticipantService`.
 *
 * The UNFILTERED roster (every page loaded so far, with its cursor, `hasMore` and `totalCount`)
 * is one JSON document per conversation; a search never goes through here.
 *
 * - [firstPage]: Fresh or Stale cache is served at once (Stale also revalidates silently);
 *   [forceRefresh] fetches THEN replaces — the cache is untouched until the network answered,
 *   so there is no empty interval and no concurrent write. A failed fetch re-serves the expired
 *   disk copy rather than an empty list.
 * - [nextPage]: always the network, deduplicated by id; once the last page is reached the disk
 *   copy is returned as is.
 * - [updateRole] / [removeParticipant] / [invalidate]: local, no network, and they never make the
 *   key look freshly fetched.
 */
class ParticipantCacheRepository(
    private val cache: KeyedJsonCache,
    private val fetchPage: ParticipantPageFetcher,
    private val scope: CoroutineScope,
    private val clock: CacheClock = SystemCacheClock,
    private val policy: CachePolicy = CachePolicy.Participants,
    private val pageSize: Int = PAGE_SIZE,
) {
    private val writeLock = Mutex()

    suspend fun firstPage(conversationId: String, forceRefresh: Boolean = false): NetworkResult<MemberRoster> {
        val cached = cache.get(NAMESPACE, conversationId, MemberRoster.serializer())
        if (!forceRefresh && cached != null && cached.value.members.isNotEmpty()) {
            val age = (clock.nowMillis() - cached.fetchedAt).coerceAtLeast(0L)
            when (classifyCache(cached.value, age, policy)) {
                is CacheResult.Fresh -> return NetworkResult.Success(cached.value)
                is CacheResult.Stale -> {
                    scope.launch { runCatchingNonCancel { replaceFromNetwork(conversationId) } }
                    return NetworkResult.Success(cached.value)
                }
                else -> Unit
            }
        }
        return when (val fetched = replaceFromNetwork(conversationId)) {
            is NetworkResult.Success -> fetched
            is NetworkResult.Failure ->
                cached?.value?.takeIf { it.members.isNotEmpty() }?.let { NetworkResult.Success(it) } ?: fetched
        }
    }

    suspend fun nextPage(conversationId: String): NetworkResult<MemberRoster> {
        val cached = cache.get(NAMESPACE, conversationId, MemberRoster.serializer())?.value
        val cursor = cached?.nextCursor
        if (cached == null || !cached.hasMore || cursor == null) {
            return NetworkResult.Success(cached ?: MemberRoster.EMPTY)
        }
        return when (val result = fetchPage(conversationId, cursor, pageSize)) {
            is NetworkResult.Failure -> result
            is NetworkResult.Success -> writeLock.withLock {
                val latest = cache.get(NAMESPACE, conversationId, MemberRoster.serializer())?.value ?: cached
                val merged = latest.withNextPage(result.data)
                cache.update(NAMESPACE, conversationId, MemberRoster.serializer()) { merged }
                NetworkResult.Success(merged)
            }
        }
    }

    /** The cached roster, re-emitted on every local or network change; `null` = never loaded. */
    fun observe(conversationId: String): Flow<MemberRoster?> =
        cache.observe(NAMESPACE, conversationId, MemberRoster.serializer()).map { it?.value }

    suspend fun updateRole(conversationId: String, userIdOrParticipantId: String, role: String) =
        mutate(conversationId) { it.withRoleName(userIdOrParticipantId, role) }

    suspend fun removeParticipant(conversationId: String, userIdOrParticipantId: String) =
        mutate(conversationId) { it.withoutUser(userIdOrParticipantId) }

    suspend fun invalidate(conversationId: String) = cache.clear(NAMESPACE, conversationId)

    private suspend fun mutate(conversationId: String, transform: (MemberRoster) -> MemberRoster) =
        writeLock.withLock { cache.update(NAMESPACE, conversationId, MemberRoster.serializer(), transform) }

    private suspend fun replaceFromNetwork(conversationId: String): NetworkResult<MemberRoster> =
        when (val result = fetchPage(conversationId, null, pageSize)) {
            is NetworkResult.Failure -> result
            is NetworkResult.Success -> writeLock.withLock {
                val roster = MemberRoster.EMPTY.withFirstPage(result.data)
                cache.put(NAMESPACE, conversationId, roster, MemberRoster.serializer())
                NetworkResult.Success(roster)
            }
        }

    private inline fun runCatchingNonCancel(block: () -> Unit) {
        try {
            block()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            Unit
        }
    }

    companion object {
        const val NAMESPACE = "participants"
        const val PAGE_SIZE = 30
    }
}
