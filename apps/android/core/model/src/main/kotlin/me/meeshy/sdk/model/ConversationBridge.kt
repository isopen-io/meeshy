package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * Le pont ✦ — ce que le lecteur a manqué, sous une forme qui survit au Prisme Linguistique.
 * Miroir de `ConversationBridge` (iOS, `packages/shared/types/conversation-bridge.ts` §3.2).
 *
 * Deux étages, un seul champ : [KIND_FALLBACK] porte des DONNÉES ([data]) que le client formate
 * avec sa propre i18n ; [KIND_AGENT] porte une phrase ([text]) soumise au Prisme, avec la MÊME paire
 * que l'aperçu ([translations] + [originalLanguage]) pour être RE-résolue. Aucun résolveur ici :
 * l'étage agent se résout par `resolveLastMessagePreview`, jamais par une seconde loi de langue.
 *
 * Le champ est ABSENT quand `unreadCount == 0` : une ligne qui ne le porte pas se relit sans pont.
 */
@Serializable
data class ConversationBridge(
    /** [KIND_AGENT] | [KIND_FALLBACK] — une valeur inconnue est gardée telle quelle. */
    val kind: String,
    val unreadCount: Int = 0,
    /** [MODE_FOCAL] | [MODE_RESUME]. */
    val suggestedMode: String = MODE_RESUME,
    /** `null` = la fenêtre de calcul couvre TOUT l'intervalle non lu ; `false` = producteur borné. */
    val isComplete: Boolean? = null,
    val data: ConversationBridgeData? = null,
    val text: String? = null,
    val translations: Map<String, String>? = null,
    val originalLanguage: String? = null,
) {
    val isAgent: Boolean get() = kind == KIND_AGENT
    val isFallback: Boolean get() = kind == KIND_FALLBACK

    companion object {
        const val KIND_AGENT = "agent"
        const val KIND_FALLBACK = "fallback"
        const val MODE_FOCAL = "focal"
        const val MODE_RESUME = "resume"
    }
}

/** Les DONNÉES de l'étage `fallback` : jamais une phrase. `authors` est plafonné à 2 côté serveur. */
@Serializable
data class ConversationBridgeData(
    val authors: List<String> = emptyList(),
    val extraAuthorCount: Int = 0,
    val messageCount: Int = 0,
    val mediaCounts: ConversationBridgeMediaCounts? = null,
)

/** Décompte des médias de la fenêtre non lue ; chaque compteur est ABSENT quand rien à annoncer. */
@Serializable
data class ConversationBridgeMediaCounts(
    val images: Int? = null,
    val audio: Int? = null,
    val files: Int? = null,
)
