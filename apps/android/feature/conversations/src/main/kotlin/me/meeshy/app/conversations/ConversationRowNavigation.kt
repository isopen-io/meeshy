package me.meeshy.app.conversations

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import me.meeshy.sdk.model.ApiConversation

/**
 * Les destinations que le menu d'une ligne peut ouvrir, fournies par l'hôte de navigation.
 * Une destination absente (`null`) masque son entrée de menu : aucune action morte.
 */
@Immutable
data class ConversationRowNavigation(
    val onViewInfo: ((conversationId: String) -> Unit)? = null,
    val onViewProfile: ((userId: String) -> Unit)? = null,
    val onCreateShareLink: ((conversationId: String) -> Unit)? = null,
    /** La fiche des membres de la conversation, teintée de son accent (#12865). */
    val onManageMembers: ((conversationId: String, accent: Color) -> Unit)? = null,
    /** L'appel audio du pair d'un direct, composé tout de suite ; `null` = « Appeler » absent. */
    val onCall: ((conversationId: String, peerName: String) -> Unit)? = null,
    /** La fiche de la conversation HORS du fil (#15989), ouverte par son avatar ; `null` = l'avatar reste à la ligne. */
    val onViewConversationInfo: ((conversation: ApiConversation) -> Unit)? = null,
    /** La story du pair d'un direct, ouverte par son anneau ; `null` = l'anneau ne s'ouvre pas. */
    val onViewStory: ((userId: String) -> Unit)? = null,
    /** La bulle d'humeur du pair d'un direct, ouverte par son badge ; `null` = le badge ne réagit pas. */
    val onMoodBadgeTap: ((userId: String) -> Unit)? = null,
    /** L'humeur du pair vient d'être peinte sur l'avatar d'une ligne : une impression (mood_avatar). */
    val onMoodShown: ((userId: String) -> Unit)? = null,
) {
    companion object {
        val None = ConversationRowNavigation()
    }
}

/** Le toucher d'avatar résolu par le ViewModel, remis à sa destination : jamais le fil (#15989). */
internal fun ConversationRowNavigation.open(effect: ConversationAvatarEffect, conversationOf: (String) -> ApiConversation?) {
    when (effect) {
        is ConversationAvatarEffect.OpenProfile -> onViewProfile?.invoke(effect.userId)
        is ConversationAvatarEffect.OpenInfo -> conversationOf(effect.conversationId)?.let { onViewConversationInfo?.invoke(it) }
    }
}
