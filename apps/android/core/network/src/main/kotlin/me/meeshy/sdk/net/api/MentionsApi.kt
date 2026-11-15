package me.meeshy.sdk.net.api

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.routes.ApiRoutesMentions
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

@Serializable
data class MentionTargetUser(
    val id: String,
    val username: String? = null,
    val displayName: String? = null,
    val avatar: String? = null,
)

/** Une mention d'un message (`GET mentions/messages/{id}`). */
@Serializable
data class MessageMention(
    val id: String,
    val messageId: String? = null,
    val mentionedUserId: String? = null,
    val mentionedAt: String? = null,
    val mentionedUser: MentionTargetUser? = null,
)

@Serializable
data class MentionSenderRef(
    val id: String? = null,
    val username: String? = null,
    val displayName: String? = null,
    val avatar: String? = null,
)

@Serializable
data class MentionConversationRef(
    val id: String,
    val title: String? = null,
    val type: String? = null,
)

@Serializable
data class MentionMessageRef(
    val id: String,
    val content: String? = null,
    val conversationId: String? = null,
    val senderId: String? = null,
    val createdAt: String? = null,
    val sender: MentionSenderRef? = null,
    val conversation: MentionConversationRef? = null,
)

/** Une mention de l'utilisateur (`GET mentions/me`). */
@Serializable
data class UserMention(
    val id: String,
    val messageId: String? = null,
    val mentionedAt: String? = null,
    val message: MentionMessageRef? = null,
)

/**
 * Une suggestion de `GET mentions/suggestions` (#14053). La passerelle la range déjà —
 * connaissances, personnes du contexte, contacts, annuaire — et dit son [group] depuis #14052 ;
 * une passerelle antérieure l'omet, d'où le défaut `null`.
 */
@Serializable
data class MentionSuggestionDto(
    val id: String,
    val username: String? = null,
    val displayName: String? = null,
    val avatar: String? = null,
    val badge: String? = null,
    val inConversation: Boolean = false,
    val isFriend: Boolean = false,
    val group: String? = null,
)

interface MentionsApi {
    @GET("mentions/me")
    suspend fun mine(@Query("limit") limit: Int? = null): ApiResponse<List<UserMention>>

    @GET("mentions/messages/{messageId}")
    suspend fun forMessage(@Path("messageId") messageId: String): ApiResponse<List<MessageMention>>

    @GET(ApiRoutesMentions.SUGGESTIONS)
    suspend fun suggestions(
        @Query("contextId") contextId: String,
        @Query("contextType") contextType: String,
        @Query("query") query: String,
    ): ApiResponse<List<MentionSuggestionDto>>
}
