package me.meeshy.sdk.conversation

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.ConversationEngagementSnapshot
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ConversationEngagementApi
import me.meeshy.sdk.net.apiCall

/**
 * Relecture de « N (M) 🔥 » (`GET /conversations/{id}/engagement`, gateway `conversations/engagement.ts`) :
 * l'instantané du LECTEUR, zéros tant qu'il n'a rien crédité ici. En ligne seulement — l'instantané
 * installé par la liste ([me.meeshy.sdk.model.ApiConversation.viewerEngagement]) sert le froid.
 */
@Singleton
class ConversationEngagementRepository @Inject constructor(
    private val api: ConversationEngagementApi,
) {
    suspend fun fetch(conversationId: String): NetworkResult<ConversationEngagementSnapshot> =
        apiCall { api.engagement(conversationId) }
}
