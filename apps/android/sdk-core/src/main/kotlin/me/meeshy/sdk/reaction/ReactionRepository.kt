package me.meeshy.sdk.reaction

import me.meeshy.sdk.model.ReactionSyncResponse
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.AddReactionRequest
import me.meeshy.sdk.net.api.ReactionApi
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject
import javax.inject.Singleton

/** Message reactions — port of ReactionService (ReactionService.swift). */
@Singleton
class ReactionRepository @Inject constructor(
    private val reactionApi: ReactionApi,
) {
    suspend fun add(messageId: String, emoji: String): NetworkResult<Unit> =
        apiCall { reactionApi.add(AddReactionRequest(messageId = messageId, emoji = emoji)) }

    suspend fun remove(messageId: String, emoji: String): NetworkResult<Unit> =
        apiCall { reactionApi.remove(messageId, emoji) }

    suspend fun fetchDetails(messageId: String): NetworkResult<ReactionSyncResponse> =
        apiCall { reactionApi.fetchDetails(messageId) }
}
