package me.meeshy.sdk.model.engagement

/**
 * La loi de la mémoire de l'en-tête (miroir de `ConversationHeaderMemory.write` iOS) : un ensemble
 * d'identifiants de conversation, où seules les conversations dépliées (ou à flamme masquée)
 * figurent. Pure : le support (DataStore, préférences) ne fait que persister le résultat.
 */
object HeaderMemoryIds {

    /** L'ensemble après avoir posé [conversationId] membre ou non ; un identifiant vide ne s'écrit jamais. */
    fun with(ids: Set<String>, conversationId: String, isMember: Boolean): Set<String> = when {
        conversationId.isEmpty() -> ids
        isMember -> ids + conversationId
        else -> ids - conversationId
    }
}
