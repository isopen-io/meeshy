package me.meeshy.app.contacts

import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.FriendRequestUser

/**
 * Une personne bloquée n'apparaît que dans l'onglet Bloqués : ni parmi les contacts, ni parmi les
 * demandes reçues ou envoyées. Le filtre s'applique à la SOURCE, avant que les listes servies ne
 * nourrissent l'état de l'écran, le cache d'amitié et la persistance.
 */
internal object BlockedExclusion {

    fun friends(friends: List<FriendRequestUser>, blockedIds: Set<String>): List<FriendRequestUser> =
        if (blockedIds.isEmpty()) friends else friends.filterNot { it.id in blockedIds }

    /** Une demande est écartée dès que l'un de ses deux bouts est bloqué (l'utilisateur courant ne peut pas l'être). */
    fun requests(requests: List<FriendRequest>, blockedIds: Set<String>): List<FriendRequest> =
        if (blockedIds.isEmpty()) {
            requests
        } else {
            requests.filterNot { it.senderId in blockedIds || it.receiverId in blockedIds }
        }
}
