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

    /** #19426 — the viewer's saved posts, kept like an author's page (iOS `bookmarks` key of the `feed` store). */
    suspend fun cachedBookmarks(): CacheResult<UserPostsSnapshot> = cached(BOOKMARKS)

    /**
     * Written only while the list fits [MAX_CACHED]: a longer one would be cut and its cursor would then skip the
     * rows between the cut and the cursor, so the previous (shorter, consistent) copy stays.
     */
    suspend fun persistBookmarks(snapshot: UserPostsSnapshot, ticket: AccountTicket?) {
        if (snapshot.posts.size <= MAX_CACHED) persist(BOOKMARKS, snapshot, ticket)
    }

    /**
     * #18931 — a live gesture on [postId] ([patch]: the gateway's absolute counts) reaches EVERY author's cached page that
     * holds it; each page keeps its own freshness (a gesture is not a reload).
     */
    suspend fun patchEverywhere(postId: String, patch: (ApiPost) -> ApiPost?, ticket: AccountTicket?) =
        rewriteEverywhere(postId, ticket) { snapshot ->
            val index = snapshot.posts.indexOfFirst { it.id == postId }
            snapshot.posts.getOrNull(index)?.let(patch)?.let { next ->
                snapshot.copy(posts = snapshot.posts.toMutableList().also { it[index] = next })
            }
        }

    /** #18931 — a post deleted elsewhere (`post:deleted`) leaves every author's cached page. */
    suspend fun removeEverywhere(postId: String, ticket: AccountTicket?) =
        rewriteEverywhere(postId, ticket) { snapshot ->
            if (snapshot.posts.none { it.id == postId }) null else snapshot.copy(posts = snapshot.posts.filterNot { it.id == postId })
        }

    /** #19426 — a post un-saved elsewhere (`post:bookmarked` false) leaves the saved posts only; the author pages keep it. */
    suspend fun removeFromBookmarks(postId: String, ticket: AccountTicket?) =
        rewriteEverywhere(postId, ticket, key(BOOKMARKS)) { snapshot ->
            if (snapshot.posts.none { it.id == postId }) null else snapshot.copy(posts = snapshot.posts.filterNot { it.id == postId })
        }

    private suspend fun rewriteEverywhere(
        postId: String,
        ticket: AccountTicket?,
        prefix: String = KEY_PREFIX,
        rewrite: (UserPostsSnapshot) -> UserPostsSnapshot?,
    ) {
        fence.commitOrWrite(ticket) {
            dao.namingUnderPrefix(prefix, postId).forEach { row ->
                val snapshot = runCatching { MeeshyApi.json.decodeFromString<UserPostsSnapshot>(row.payload) }.getOrNull()
                    ?: return@forEach
                val next = rewrite(snapshot) ?: return@forEach
                dao.upsert(row.copy(payload = MeeshyApi.json.encodeToString(UserPostsSnapshot.serializer(), next)))
            }
        }
    }

    internal companion object {
        const val MAX_CACHED: Int = 100
        private const val KEY_PREFIX = "profile_posts:"

        /** Not a user id (ObjectIds are hex): the saved posts live under their own key, in reach of [patchEverywhere]. */
        private const val BOOKMARKS = "bookmarks"
        fun key(userId: String): String = KEY_PREFIX + userId
    }
}
