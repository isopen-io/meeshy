package me.meeshy.sdk.conversation

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.CreateConversationRequest
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ConversationRepository @Inject constructor(
    private val conversationApi: ConversationApi,
) {

    suspend fun list(offset: Int = 0, limit: Int = 30): NetworkResult<List<ApiConversation>> =
        apiCall { conversationApi.list(offset, limit) }

    suspend fun getById(id: String): NetworkResult<ApiConversation> =
        apiCall { conversationApi.getById(id) }

    suspend fun create(
        type: String,
        title: String?,
        participantIds: List<String>,
    ): NetworkResult<ApiConversation> =
        apiCall { conversationApi.create(CreateConversationRequest(type, title, participantIds)) }

    suspend fun markRead(id: String): NetworkResult<Unit> =
        apiCall { conversationApi.markRead(id) }
}
