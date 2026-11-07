package me.meeshy.sdk.post

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.PostCommentSettings
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CommentSettingsRequest
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.net.apiCall

/**
 * **Fermer ou rouvrir les commentaires d'une publication** (#16541, `PATCH /posts/:postId/comment-settings`). Le geste
 * est OPTIMISTE sur la ligne du fil : elle bascule avant le réseau, prend l'état que la passerelle a appliqué, ou revient
 * en arrière sur un refus — sauf si une diffusion (`post:updated`) a dit autre chose entre-temps. Rend l'état appliqué.
 */
@Singleton
class PostCommentSettingsRepository @Inject constructor(
    private val postApi: PostApi,
    private val posts: PostRepository,
) {
    suspend fun setCommentsDisabled(postId: String, disabled: Boolean): NetworkResult<Boolean> {
        val before = posts.cachedPost(postId)?.commentsDisabled
        if (before != null) fold(postId, disabled)
        val result = apiCall { postApi.updateCommentSettings(postId, CommentSettingsRequest(disabled)) }.map { it.commentsDisabled }
        when (result) {
            is NetworkResult.Success -> fold(postId, result.data)
            is NetworkResult.Failure -> if (before != null) {
                posts.cachedPost(postId)?.let { row -> fold(postId, PostCommentSettings.rolledBack(row.commentsDisabled, disabled, before)) }
            }
        }
        return result
    }

    private suspend fun fold(postId: String, disabled: Boolean) {
        val row = posts.cachedPost(postId) ?: return
        if (row.commentsDisabled != disabled) posts.applyPostUpdate(row.copy(commentsDisabled = disabled))
    }
}
