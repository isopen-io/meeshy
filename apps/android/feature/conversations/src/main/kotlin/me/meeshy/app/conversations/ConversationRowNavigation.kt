package me.meeshy.app.conversations

import androidx.compose.runtime.Immutable

/**
 * Les destinations que le menu d'une ligne peut ouvrir, fournies par l'hôte de navigation.
 * Une destination absente (`null`) masque son entrée de menu : aucune action morte.
 */
@Immutable
data class ConversationRowNavigation(
    val onViewInfo: ((conversationId: String) -> Unit)? = null,
    val onViewProfile: ((userId: String) -> Unit)? = null,
    val onCreateShareLink: ((conversationId: String) -> Unit)? = null,
) {
    companion object {
        val None = ConversationRowNavigation()
    }
}
