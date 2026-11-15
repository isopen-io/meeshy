package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ContentRemovalRequest
import me.meeshy.sdk.model.DeletionAcknowledgement
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.deletionCall
import javax.inject.Inject

/**
 * Plie les DELETE avec motif de [ContentRemovalApi] en [NetworkResult] : les couches au-dessus
 * (`:sdk-core`) ne voient jamais un type Retrofit. Un 2xx EST la confirmation du retrait.
 */
class ContentRemovalClient @Inject constructor(private val api: ContentRemovalApi) {
    suspend fun removeMessage(messageId: String, body: ContentRemovalRequest): NetworkResult<DeletionAcknowledgement> =
        deletionCall { api.removeMessage(messageId, body) }

    suspend fun removePost(postId: String, body: ContentRemovalRequest): NetworkResult<DeletionAcknowledgement> =
        deletionCall { api.removePost(postId, body) }

    suspend fun removeComment(
        postId: String,
        commentId: String,
        body: ContentRemovalRequest,
    ): NetworkResult<DeletionAcknowledgement> =
        deletionCall { api.removeComment(postId, commentId, body) }
}
