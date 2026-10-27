package me.meeshy.sdk.post

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.ApiHashtag
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.analytics.ContentSurface
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.HashtagApi
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.net.pagedApiCall
import me.meeshy.sdk.session.PerAccountCache

/**
 * Les posts d'un mot-dièse (pagination par curseur) et les mots-dièse en tendance. Les premières
 * pages gardées en mémoire sont vidées à la déconnexion ([PerAccountCache]) : un second compte
 * n'ouvre jamais un mot-dièse sur ce que le premier a vu.
 */
@Singleton
class PostHashtagRepository @Inject constructor(
    private val postApi: PostApi,
    private val hashtagApi: HashtagApi,
    private val listings: FeedListingRegistry,
) : PerAccountCache {
    private val firstPages = object : LinkedHashMap<String, PostPage>(CACHED_TAGS, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, PostPage>): Boolean =
            size > CACHED_TAGS
    }

    /** La première page déjà vue de [tag] (cache-first : l'écran s'ouvre dessus, puis se revalide), ou `null`. */
    fun cachedFirstPage(tag: String): PostPage? = synchronized(firstPages) { firstPages[normalizedTag(tag)] }

    suspend fun posts(tag: String, cursor: String? = null, limit: Int = PAGE_SIZE): NetworkResult<PostPage> =
        when (val result = pagedApiCall { postApi.getByHashtag(normalizedTag(tag), cursor, limit) }) {
            is NetworkResult.Failure -> result
            is NetworkResult.Success -> {
                val page = result.data
                listings.note(ContentSurface.HASHTAG, page.meta?.feedRequestId, page.data.map(ApiPost::id))
                val fetched = PostPage(
                    posts = page.data,
                    nextCursor = page.nextCursor,
                    hasMore = page.pagination?.hasMore ?: false,
                )
                if (cursor == null) synchronized(firstPages) { firstPages[normalizedTag(tag)] = fetched }
                NetworkResult.Success(fetched)
            }
        }

    override suspend fun clear() {
        synchronized(firstPages) { firstPages.clear() }
    }

    suspend fun trending(limit: Int = TRENDING_SIZE): NetworkResult<List<ApiHashtag>> =
        apiCall { hashtagApi.trending(limit) }

    /** Le serveur normalise aussi ; le client ne fait que retirer le `#` de tête pour ne pas l'encoder. */
    private fun normalizedTag(raw: String): String = raw.trim().removePrefix("#").lowercase()

    private companion object {
        const val PAGE_SIZE = 20
        const val TRENDING_SIZE = 20
        const val CACHED_TAGS = 12
    }
}
