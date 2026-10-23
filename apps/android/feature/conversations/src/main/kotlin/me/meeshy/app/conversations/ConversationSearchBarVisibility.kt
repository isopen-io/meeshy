package me.meeshy.app.conversations

import me.meeshy.sdk.model.conversationlist.ConversationSearchBarScrollLaw

/**
 * Visibilité de la barre flottante : la loi de profondeur décide du masquage,
 * la saisie (focus ou texte non vide) le suspend toujours.
 */
internal object ConversationSearchBarVisibility {

    fun isTyping(isFocused: Boolean, query: String): Boolean = isFocused || query.isNotBlank()

    fun isVisible(lawState: ConversationSearchBarScrollLaw.State, isFocused: Boolean, query: String): Boolean =
        ConversationSearchBarScrollLaw.isVisible(lawState, isTyping(isFocused, query))
}
