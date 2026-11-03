package me.meeshy.sdk.story

import me.meeshy.sdk.lang.LanguageResolver.ContentLanguagePreferences
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.model.StoryComment
import me.meeshy.sdk.model.StoryCommentPage
import me.meeshy.sdk.model.StoryCommentThreadState
import me.meeshy.sdk.model.toStoryComment
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.PagedResult
import me.meeshy.sdk.net.api.StoryApi
import me.meeshy.sdk.net.api.UpdateCommentRequest
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.net.apiCallUnit
import me.meeshy.sdk.net.pagedApiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Les commentaires d'une story — iso `StoryCommentSession` côté données : racines par pages de 50, réponses ASC par
 * pages de 20, cœur, édition et suppression. Le cache est servi d'abord ([cachedRoots]) ; une panne réseau ne
 * l'écrase jamais (seule une première page réussie le réécrit).
 */
@Singleton
class StoryCommentsRepository @Inject constructor(
    private val storyApi: StoryApi,
    private val cache: StoryCommentsCache,
) {
    /** La liste locale, sans réseau ; `null` à froid. */
    suspend fun cachedRoots(storyId: String, prefs: ContentLanguagePreferences): StoryCommentPage? =
        cache.read(storyId)?.let { snapshot ->
            StoryCommentPage(snapshot.roots.map { it.toStoryComment(prefs) }, snapshot.nextCursor, snapshot.hasMore)
        }

    suspend fun roots(
        storyId: String,
        cursor: String?,
        prefs: ContentLanguagePreferences,
        limit: Int = StoryCommentThreadState.ROOTS_PAGE_SIZE,
    ): NetworkResult<StoryCommentPage> =
        when (val result = pagedApiCall { storyApi.comments(storyId, cursor, limit) }) {
            is NetworkResult.Failure -> result
            is NetworkResult.Success -> {
                val page = result.data.toPage(limit)
                if (cursor == null) cache.write(storyId, StoryCommentsSnapshot(page.rows, page.nextCursor, page.hasMore))
                NetworkResult.Success(page.toStoryPage(prefs))
            }
        }

    suspend fun replies(
        storyId: String,
        rootId: String,
        cursor: String?,
        prefs: ContentLanguagePreferences,
        limit: Int = StoryCommentThreadState.REPLIES_PAGE_SIZE,
    ): NetworkResult<StoryCommentPage> =
        pagedApiCall { storyApi.commentReplies(storyId, rootId, cursor, limit) }.map { paged ->
            paged.toPage(limit).toStoryPage(prefs)
        }

    suspend fun like(storyId: String, commentId: String): NetworkResult<Unit> =
        apiCallUnit { storyApi.likeComment(storyId, commentId) }

    suspend fun unlike(storyId: String, commentId: String): NetworkResult<Unit> =
        apiCallUnit { storyApi.unlikeComment(storyId, commentId) }

    suspend fun edit(
        storyId: String,
        commentId: String,
        content: String,
        prefs: ContentLanguagePreferences,
    ): NetworkResult<StoryComment> =
        apiCall { storyApi.updateComment(storyId, commentId, UpdateCommentRequest(content = content)) }
            .map { it.toStoryComment(prefs) }

    suspend fun delete(storyId: String, commentId: String): NetworkResult<Unit> =
        apiCallUnit { storyApi.deleteComment(storyId, commentId) }

    private class WirePage(val rows: List<ApiPostComment>, val nextCursor: String?, val hasMore: Boolean) {
        fun toStoryPage(prefs: ContentLanguagePreferences) =
            StoryCommentPage(rows.map { it.toStoryComment(prefs) }, nextCursor, hasMore)
    }

    /** Le serveur dit s'il reste des pages ; sans enveloppe de pagination, une page pleine en promet une autre. */
    private fun PagedResult<List<ApiPostComment>>.toPage(limit: Int): WirePage {
        val served: Pagination? = pagination
        val more = served?.hasMore ?: (data.size >= limit)
        val cursor = served?.nextCursor ?: if (served == null && more) data.lastOrNull()?.id else null
        return WirePage(data, cursor, more && !cursor.isNullOrBlank())
    }
}
