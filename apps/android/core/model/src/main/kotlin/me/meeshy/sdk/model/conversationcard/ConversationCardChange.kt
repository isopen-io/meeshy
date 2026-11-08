package me.meeshy.sdk.model.conversationcard

import me.meeshy.sdk.model.deeplink.ConversationCardTarget

/**
 * Une jonction ou un départ vient de changer l'appartenance du lecteur à une conversation : toute
 * carte qui la désigne est périmée (iOS `ConversationCardChange`, #8138). [origin] est la carte du
 * geste : elle connaît déjà son nouvel état.
 */
data class ConversationCardChange(
    val conversationId: String,
    val origin: ConversationCardTarget,
)

/**
 * Qui une carte désigne : sa cible (lien direct) ou ce que le serveur a servi (un lien de partage vu
 * par un membre). Un lien de partage vu par un NON-membre ne porte pas l'identifiant : c'est la carte
 * du geste de jonction, qui se met à jour elle-même.
 */
fun ConversationCardResolution.designates(conversationId: String, target: ConversationCardTarget): Boolean {
    if ((target as? ConversationCardTarget.Direct)?.conversationId == conversationId) return true
    return (this as? ConversationCardResolution.Card)?.card?.conversationId == conversationId
}
