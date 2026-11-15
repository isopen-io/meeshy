package me.meeshy.sdk.model.syncpill

import me.meeshy.sdk.model.TypingEvent
import me.meeshy.sdk.model.connection.SyncPillTyper

/**
 * « Qui écrit où », pour la pastille globale (miroir d'iOS `ConversationListViewModel.typingUsers`). État pur :
 * `conversationId → (userId → pseudo)`. Une conversation reste allumée tant qu'un pair y écrit ; le pseudo servi est
 * choisi de façon déterministe (le premier par ordre alphabétique) pour que la rotation ne saute pas. Chaque
 * transition inerte rend la MÊME instance, qu'un appelant détecte par référence.
 */
object SyncPillTypers {
    fun started(
        state: Map<String, Map<String, String>>,
        event: TypingEvent,
        selfId: String?,
    ): Map<String, Map<String, String>> {
        if (event.conversationId.isBlank() || event.userId.isBlank() || event.userId == selfId) return state
        val handle = listOf(event.username, event.displayName).firstNotNullOfOrNull { it?.trim()?.takeIf(String::isNotEmpty) }
            ?: event.userId
        val updated = state[event.conversationId].orEmpty() + (event.userId to handle)
        return state + (event.conversationId to updated)
    }

    fun stopped(
        state: Map<String, Map<String, String>>,
        conversationId: String,
        userId: String,
    ): Map<String, Map<String, String>> {
        val current = state[conversationId] ?: return state
        if (userId !in current) return state
        val remaining = current - userId
        return if (remaining.isEmpty()) state - conversationId else state + (conversationId to remaining)
    }

    fun typers(state: Map<String, Map<String, String>>): List<SyncPillTyper> =
        state.mapNotNull { (conversationId, byUser) ->
            byUser.values.minOrNull()?.let { SyncPillTyper(conversationId, it) }
        }
}
