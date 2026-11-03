package me.meeshy.sdk.model

/**
 * Les liens `meeshy://` que l'assistant, les raccourcis et les widgets émettent (miroir de
 * `MeeshyAppIntents.swift`). Un identifiant vide ou illisible ne produit AUCUN lien : mieux vaut un
 * raccourci qui n'ouvre rien qu'une demande qui vise une conversation inventée. Lire ces liens est
 * l'affaire de `DeepLinkParser`.
 */
object AssistantDeepLink {
    private const val BASE: String = "meeshy://"

    /** La conversation la plus récente du cache (liste si le cache est vide). */
    fun recentConversation(): String = "${BASE}conversations/recent"

    /** La liste, filtre « Non lus » actif. */
    fun unreadConversations(): String = "${BASE}conversations/unread"

    /** La directe avec [message] prérempli en brouillon : jamais d'envoi automatique. Sans message, la directe seule. */
    fun send(contactId: String, message: String? = null): String? {
        val id = validId(contactId) ?: return null
        val draft = message?.takeIf { it.isNotBlank() }?.let { "&message=${DeepLinkQueryEncoder.encode(it)}" }.orEmpty()
        return "${BASE}send?contactId=${DeepLinkQueryEncoder.encode(id)}$draft"
    }

    /** L'appel d'un contact : audio par défaut, vidéo si [isVideo]. */
    fun call(contactId: String, isVideo: Boolean = false): String? {
        val id = validId(contactId) ?: return null
        return "${BASE}call?contactId=${DeepLinkQueryEncoder.encode(id)}&type=${if (isVideo) "video" else "audio"}"
    }

    private fun validId(raw: String): String? =
        raw.trim().takeIf { it.isNotEmpty() && it.none { c -> c.isWhitespace() || c.isISOControl() } }
}
