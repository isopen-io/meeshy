package me.meeshy.app.conversations

/**
 * Ce que le toucher de l'avatar d'une ligne demande à l'hôte de navigation (#15989), à usage unique : le
 * profil du pair d'une directe, ou les détails de la conversation. Jamais le fil.
 */
sealed interface ConversationAvatarEffect {
    data class OpenProfile(val userId: String) : ConversationAvatarEffect

    data class OpenInfo(val conversationId: String) : ConversationAvatarEffect
}
