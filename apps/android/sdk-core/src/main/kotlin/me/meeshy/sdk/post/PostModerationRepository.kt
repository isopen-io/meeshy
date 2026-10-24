package me.meeshy.sdk.post

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.ContentRemovalReason
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ContentRemovalBody
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.net.api.PublicationModerationRequest
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.net.apiCallUnit

/**
 * Les gestes de modération d'un contenu qu'on n'a pas écrit : retirer un post, retirer un commentaire,
 * rendre une publication privée. Le motif est validé (3 à 500 caractères après rognage) AVANT tout
 * appel ; un motif refusé ne touche jamais le réseau. La passerelle tranche le droit.
 */
@Singleton
class PostModerationRepository @Inject constructor(
    private val postApi: PostApi,
) {
    suspend fun removePost(postId: String, reason: String): NetworkResult<Unit> =
        withReason(reason) { clean -> apiCallUnit { postApi.deleteWithReason(postId, ContentRemovalBody(clean)) } }

    suspend fun removeComment(postId: String, commentId: String, reason: String): NetworkResult<Unit> =
        withReason(reason) { clean -> apiCallUnit { postApi.deleteCommentWithReason(postId, commentId, ContentRemovalBody(clean)) } }

    suspend fun makePrivate(postId: String, authorId: String, reason: String): NetworkResult<Unit> =
        withReason(reason) { clean ->
            val request = PublicationModerationRequest(action = MAKE_PRIVATE, postIds = listOf(postId), reason = clean)
            when (val result = apiCall { postApi.moderatePublications(authorId, request) }) {
                is NetworkResult.Failure -> result
                is NetworkResult.Success ->
                    if (result.data.isApplied(postId)) {
                        NetworkResult.Success(Unit)
                    } else {
                        NetworkResult.Failure(ApiError(message = "Moderation not applied", code = NOT_APPLIED))
                    }
            }
        }

    private suspend fun withReason(
        reason: String,
        call: suspend (String) -> NetworkResult<Unit>,
    ): NetworkResult<Unit> {
        val clean = ContentRemovalReason.normalized(reason)
            ?: return NetworkResult.Failure(ApiError(message = "Invalid removal reason", code = INVALID_REASON))
        return call(clean)
    }

    companion object {
        const val INVALID_REASON = "INVALID_REMOVAL_REASON"
        const val NOT_APPLIED = "MODERATION_NOT_APPLIED"
        private const val MAKE_PRIVATE = "make-private"
    }
}
