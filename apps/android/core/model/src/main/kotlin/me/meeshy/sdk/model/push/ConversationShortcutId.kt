package me.meeshy.sdk.model.push

/**
 * L'identifiant de raccourci (section « Conversations » du système) d'une bannière de message : l'identifiant BRUT
 * de la conversation, sans préfixe — celui que posent déjà les raccourcis existants (partage, lanceur), pour que la
 * bannière et le raccourci désignent la même conversation.
 */
public object ConversationShortcutId {
    public fun of(conversationId: String?): String? = conversationId?.trim()?.takeIf { it.isNotEmpty() }
}
