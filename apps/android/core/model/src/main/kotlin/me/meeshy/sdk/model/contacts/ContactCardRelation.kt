package me.meeshy.sdk.model.contacts

import me.meeshy.sdk.model.friend.FriendshipStatus

/**
 * La relation que la carte SERT pour un compte résolu : celle du serveur au moment de la résolution, corrigée par
 * le cache d'amitié vivant (une demande envoyée à l'instant, une amitié acceptée, une demande retirée après un
 * refus de la file). Soi reste soi ; un cache pas encore hydré ne contredit pas le serveur.
 */
object ContactCardRelation {
    fun served(resolved: ContactRelation, live: FriendshipStatus, cacheHydrated: Boolean): ContactRelation = when {
        resolved == ContactRelation.Self -> ContactRelation.Self
        live is FriendshipStatus.Friend -> ContactRelation.Friend
        live is FriendshipStatus.PendingSent -> ContactRelation.RequestSent
        live is FriendshipStatus.PendingReceived -> ContactRelation.RequestReceived
        cacheHydrated -> ContactRelation.None
        else -> resolved
    }
}
