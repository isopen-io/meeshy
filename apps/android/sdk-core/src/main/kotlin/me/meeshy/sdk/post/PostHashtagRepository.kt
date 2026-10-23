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

/** Les posts d'un mot-dièse (pagination par curseur) et les mots-dièse en tendance. */
@Singleton
class PostHashtagRepository @Inject constructor(
    private val postApi: PostApi,
    private val hashtagApi: HashtagApi,
    private val listings: FeedListingRegistry,
) {
    suspend fun posts(tag: String, cursor: String? = null, limit: Int = PAGE_SIZE): NetworkResult<PostPage> =
        when (val result = pagedApiCall { postApi.getByHashtag(normalizedTag(tag), cursor, limit) }) {
            is NetworkResult.Failure -> result
            is NetworkResult.Success -> {
                val page = result.data
                listings.note(ContentSurface.HASHTAG, page.meta?.feedRequestId, page.data.map(ApiPost::id))
                NetworkResult.Success(
                    PostPage(
                        posts = page.data,
                        nextCursor = page.nextCursor,
                        hasMore = page.pagination?.hasMore ?: false,
                    ),
                )
            }
        }

    suspend fun trending(limit: Int = TRENDING_SIZE): NetworkResult<List<ApiHashtag>> =
        apiCall { hashtagApi.trending(limit) }

    /** Le serveur normalise aussi ; le client ne fait que retirer le `#` de tête pour ne pas l'encoder. */
    private fun normalizedTag(raw: String): String = raw.trim().removePrefix("#").lowercase()

    private companion object {
        const val PAGE_SIZE = 20
        const val TRENDING_SIZE = 20
    }
}
