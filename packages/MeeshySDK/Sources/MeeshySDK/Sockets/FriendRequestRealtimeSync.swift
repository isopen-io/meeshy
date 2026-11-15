import Foundation

/// Ce qu'un retrait ou un refus de demande d'ami, reçu en temps réel
/// (`friend-request:cancelled`, `friend-request:rejected`), change au cache
/// d'amitié. Sorti de `MessageSocketManager` : la socket ne fait que router
/// l'événement (`MessageSocketRoutes+Notifications`), la règle vit ici.
enum FriendRequestRealtimeSync {

    /// `friend-request:cancelled` ne porte que `{friendRequestId, cancelledBy}`
    /// et ne dit PAS de quel cote se trouve le lecteur — l'evenement part a
    /// l'user-room de l'AUTRE partie, donc `cancelledBy` est l'interlocuteur,
    /// que la demande ait ete emise ou recue. On retire dans les DEUX sens :
    /// chacune des deux methodes est un no-op quand la cle est absente.
    ///
    /// Muter `FriendshipCache` ne repeint PAS l'ecran Demandes : ses lignes
    /// viennent de GRDB (`PersistenceKeys.receivedRequests` / `sentRequests`),
    /// qui resterait `.fresh` avec la ligne retiree. D'ou l'invalidation
    /// EXPLICITE — `notifyChange()` ne fait qu'incrementer `version`.
    static func applyFriendRequestWithdrawal(otherUserId: String) async {
        FriendshipCache.shared.didCancelRequest(to: otherUserId)
        FriendshipCache.shared.didRejectRequest(from: otherUserId)
        await FriendshipCache.shared.invalidatePersistedFriendCaches()
    }

    /// `friend-request:rejected` arrive chez l'EXPEDITEUR d'origine : sa demande
    /// vit dans `_sentPending`, que `didCancelRequest(to:)` vide.
    /// `didRejectRequest(from:)` viderait `_receivedPending` — mauvaise
    /// direction, no-op garanti.
    static func applyFriendRequestRejection(rejecterId: String) async {
        FriendshipCache.shared.didCancelRequest(to: rejecterId)
        await FriendshipCache.shared.invalidatePersistedFriendCaches()
    }
}
