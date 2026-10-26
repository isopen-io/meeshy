package me.meeshy.app.chat

import android.content.Context

/**
 * Le régime de chiffrement que la bande dépliée annonce (miroir de `ConversationEncryptionBadge`
 * iOS) : `e2ee` → de bout en bout, `server` / `hybrid` → sur le serveur ; un mode inconnu ne
 * s'annonce pas. Casse et blancs ignorés.
 */
internal enum class ChatHeaderEncryptionBadge {
    END_TO_END,
    SERVER;

    companion object {
        fun of(encryptionMode: String?): ChatHeaderEncryptionBadge? =
            when (encryptionMode?.trim()?.lowercase()) {
                "e2ee" -> END_TO_END
                "server", "hybrid" -> SERVER
                else -> null
            }
    }
}

/**
 * La mémoire de l'en-tête, par conversation (miroir de `ConversationHeaderMemory` iOS) : l'ensemble
 * des conversations dont l'en-tête est DÉPLIÉ. Replié par défaut ; le choix survit à la sortie
 * de la conversation et au redémarrage.
 */
internal class ChatHeaderMemory(context: Context) {

    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun isExpanded(conversationId: String): Boolean =
        conversationId in prefs.getStringSet(EXPANDED_KEY, emptySet()).orEmpty()

    fun setExpanded(expanded: Boolean, conversationId: String) {
        if (conversationId.isEmpty()) return
        val ids = prefs.getStringSet(EXPANDED_KEY, emptySet()).orEmpty().toMutableSet()
        if (expanded) ids += conversationId else ids -= conversationId
        prefs.edit().putStringSet(EXPANDED_KEY, ids).apply()
    }

    private companion object {
        const val PREFS = "meeshy.conversationHeader"
        const val EXPANDED_KEY = "meeshy.conversationHeader.expanded"
    }
}
