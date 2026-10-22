package me.meeshy.sdk.model

/**
 * Badge de livraison de la carte auteur de l'onglet « Envoyé » :
 * 0 envoi · 1 envoyé · 2 distribué · 3 lu · autre = échec.
 */
enum class MessageViewsDeliveryBadge {
    Sending, Sent, Delivered, Read, Failed;

    companion object {
        fun fromLevel(level: Int): MessageViewsDeliveryBadge = when (level) {
            0 -> Sending
            1 -> Sent
            2 -> Delivered
            3 -> Read
            else -> Failed
        }
    }
}
