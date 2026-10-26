package me.meeshy.app.notifications

import javax.inject.Inject
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.DirectConversationResolution
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.model.NotificationQuickAction
import me.meeshy.sdk.net.NetworkResult

sealed interface QuickActionOutcome {
    data object Connected : QuickActionOutcome
    data class OpenConversation(val conversationId: String) : QuickActionOutcome
    data object Failed : QuickActionOutcome
}

/**
 * Exécute les gestes de rangée par les flux EXISTANTS — la demande d'ami de [FriendRepository]
 * et le résolveur unique de conversation directe de [ConversationRepository] : miroir de
 * `NotificationQuickActionPerformer` (iOS). Le modèle dit quels gestes existent, ici se décide
 * ce qu'ils font.
 */
class NotificationQuickActionPerformer @Inject constructor(
    private val friends: FriendRepository,
    private val friendship: FriendshipCache,
    private val conversations: ConversationRepository,
) {
    fun friendIds(): Set<String> = friendship.currentFriendIds

    suspend fun perform(action: NotificationQuickAction): QuickActionOutcome = when (action) {
        is NotificationQuickAction.Connect -> connect(action.userId)
        is NotificationQuickAction.Write -> write(action.userId)
    }

    private suspend fun connect(userId: String): QuickActionOutcome =
        when (val result = friends.sendFriendRequest(receiverId = userId)) {
            is NetworkResult.Success -> {
                friendship.didSendRequest(userId, result.data.id)
                QuickActionOutcome.Connected
            }
            is NetworkResult.Failure -> QuickActionOutcome.Failed
        }

    private suspend fun write(userId: String): QuickActionOutcome =
        when (val resolution = conversations.directConversationWith(userId)) {
            is DirectConversationResolution.Found -> QuickActionOutcome.OpenConversation(resolution.conversation.id)
            is DirectConversationResolution.Created -> QuickActionOutcome.OpenConversation(resolution.conversation.id)
            is DirectConversationResolution.Queued, is DirectConversationResolution.Failed -> QuickActionOutcome.Failed
        }
}
