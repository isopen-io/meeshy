package me.meeshy.sdk.conversation

import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.SendMessageRequest
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.net.apiCall
import java.util.UUID

class MessageRepository(private val messageApi: MessageApi) {

    suspend fun list(
        conversationId: String,
        offset: Int = 0,
        limit: Int = 50,
    ): NetworkResult<List<ApiMessage>> =
        apiCall { messageApi.list(conversationId, offset, limit) }

    suspend fun send(
        conversationId: String,
        content: String,
        originalLanguage: String,
        replyToId: String? = null,
    ): NetworkResult<ApiMessage> =
        apiCall {
            messageApi.send(
                conversationId,
                SendMessageRequest(
                    content = content,
                    originalLanguage = originalLanguage,
                    replyToId = replyToId,
                    clientMessageId = UUID.randomUUID().toString(),
                ),
            )
        }
}
