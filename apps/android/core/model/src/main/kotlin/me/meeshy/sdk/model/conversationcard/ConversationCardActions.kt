package me.meeshy.sdk.model.conversationcard

import me.meeshy.sdk.model.deeplink.ConversationCardTarget

/** Ce que la carte propose — règle pure, miroir d'iOS `ConversationCardActions`. */
sealed interface ConversationCardActions {
    /** Aucune action : lien expiré, carte privée, ou jonction refusée. */
    data object None : ConversationCardActions

    /** Non-membre sur un lien actif : « Rejoindre ? » puis « Anonyme » (quand le lien l'autorise) et le compte. */
    data class Join(val identifier: String, val allowsAnonymous: Boolean) : ConversationCardActions

    /** Membre : « Quitter » EN PREMIER, puis « Ouvrir ». */
    data class LeaveOrOpen(val conversationId: String) : ConversationCardActions

    companion object {
        /**
         * « Anonyme » suit le SEUL verdict du lien (`viewer.canJoinAnonymously`), que le lecteur ait un
         * compte ou non (directive porteur 2026-09-29, #8726). Un lien qui exige un compte ne propose
         * que le compte ; une carte directe ne propose jamais de rejoindre.
         */
        fun resolve(card: ConversationCard, target: ConversationCardTarget): ConversationCardActions {
            if (card.isLinkExpired) return None
            if (card.viewer.isMember) {
                val conversationId = card.conversationId ?: (target as? ConversationCardTarget.Direct)?.conversationId
                if (conversationId != null) return LeaveOrOpen(conversationId)
            }
            val allowsAnonymous = card.viewer.canJoinAnonymously
            if (card.kind != ConversationCardKind.SHARE_LINK) return None
            if (!card.viewer.canJoin && !allowsAnonymous) return None
            val identifier = card.link?.identifier ?: (target as? ConversationCardTarget.ShareLink)?.identifier
                ?: return None
            return Join(identifier, allowsAnonymous)
        }
    }
}
