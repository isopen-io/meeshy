package me.meeshy.app.chat

import android.content.Context
import me.meeshy.sdk.model.engagement.HeaderMemoryIds

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
        write(EXPANDED_KEY, conversationId, expanded)
    }

    /** La Flamme masquée d'un toucher (#13297) : elle revient au prochain dépliement de l'en-tête. */
    fun isFlameDismissed(conversationId: String): Boolean =
        conversationId in prefs.getStringSet(FLAME_DISMISSED_KEY, emptySet()).orEmpty()

    fun setFlameDismissed(dismissed: Boolean, conversationId: String) {
        write(FLAME_DISMISSED_KEY, conversationId, dismissed)
    }

    private fun write(key: String, conversationId: String, isMember: Boolean) {
        val current = prefs.getStringSet(key, emptySet()).orEmpty()
        val next = HeaderMemoryIds.with(current, conversationId, isMember)
        if (next != current) prefs.edit().putStringSet(key, next).apply()
    }

    private companion object {
        const val PREFS = "meeshy.conversationHeader"
        const val EXPANDED_KEY = "meeshy.conversationHeader.expanded"
        const val FLAME_DISMISSED_KEY = "meeshy.conversationHeader.flameDismissed"
    }
}
