package me.meeshy.sdk.post

import kotlinx.coroutines.flow.first
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import me.meeshy.core.database.dao.ProfileStatsCacheDao
import me.meeshy.core.database.entity.ProfileStatsCacheEntity
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.cache.classifyCache
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.session.commitOrWrite
import javax.inject.Inject
import javax.inject.Singleton

/** Les publications d'un auteur telles que gardées : la page, et le curseur qui reprend où elle s'arrête. */
@Serializable
data class UserPostsSnapshot(
    val posts: List<ApiPost> = emptyList(),
    val nextCursor: String? = null,
    val hasMore: Boolean = true,
)

/**
 * Le cache d'abord des publications d'UNE personne (clé `profile_posts:{userId}` de `profile_stats_cache`,
 * miroir de `CacheCoordinator.feed` / clé `user:{id}` d'iOS) : l'onglet Postes de sa fiche se peint
 * depuis ici avant le réseau. La table entière est déjà vidée au changement de compte par
 * `ProfileStatsCacheRepository` ; une charge illisible vaut un manque, jamais un plantage.
 */
@Singleton
class UserPostsCacheRepository @Inject constructor(
    private val dao: ProfileStatsCacheDao,
    private val clock: CacheClock = SystemCacheClock,
    private val fence: AccountFence? = null,
) {
    suspend fun ticket(): AccountTicket? = fence?.currentTicket()

    /** fresh / stale / expired (`Syncing`) / `Empty`, classé par [CachePolicy.Feed]. */
    suspend fun cached(userId: String): CacheResult<UserPostsSnapshot> {
        val row = dao.observe(key(userId)).first() ?: return CacheResult.Empty
        val snapshot = runCatching { MeeshyApi.json.decodeFromString<UserPostsSnapshot>(row.payload) }.getOrNull()
            ?: return CacheResult.Empty
        return classifyCache(snapshot, clock.nowMillis() - row.cachedAt, CachePolicy.Feed)
    }

    /** Garde les [MAX_CACHED] plus récentes (le listing est du plus récent au plus ancien) et leur curseur. */
    suspend fun persist(userId: String, snapshot: UserPostsSnapshot, ticket: AccountTicket?) {
        val bounded = snapshot.copy(posts = snapshot.posts.take(MAX_CACHED))
        fence.commitOrWrite(ticket) {
            dao.upsert(
                ProfileStatsCacheEntity(
                    cacheKey = key(userId),
                    payload = MeeshyApi.json.encodeToString(UserPostsSnapshot.serializer(), bounded),
                    cachedAt = clock.nowMillis(),
                ),
            )
        }
    }

    internal companion object {
        const val MAX_CACHED: Int = 100
        fun key(userId: String): String = "profile_posts:$userId"
    }
}
