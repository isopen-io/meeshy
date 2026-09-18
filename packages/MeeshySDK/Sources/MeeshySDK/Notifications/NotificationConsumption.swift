import Foundation

/// La RÉFÉRENCE d'une consommation — ce qu'on déclare avoir consommé.
///
/// C'est le `NotificationRef` de #6999, et c'est DÉLIBÉRÉMENT le même type que
/// la portée d'un marquage « lu » : `.id` / `.conversation` / `.post` /
/// `.types` / `.all` sont exactement les cinq cas de `NotificationReadScope`,
/// déjà consommés par `NotificationCachePatch` et par la traduction des
/// prédicats de masse (`NotificationBulkScopeMapping`). En déclarer un second,
/// jumeau, obligerait chaque site à convertir — et à diverger le jour où l'un
/// des deux gagne un cas.
public typealias NotificationRef = NotificationReadScope

/// Les marquages « lu » dont CET appareil est l'auteur, et pour lesquels le
/// compteur a DÉJÀ été décrémenté localement.
///
/// Le gateway diffuse `notification:read` à la room `user:<id>` — c'est-à-dire
/// à TOUS les appareils du compte, **y compris celui qui vient de marquer**
/// (`NotificationService.markAsRead`). Le client ne peut pas distinguer son
/// propre écho de celui d'un autre appareil : les deux portent le seul
/// `notificationId`. Sans ce registre, un tap sur une ligne de cloche faisait
/// donc `−1` local puis `−1` à l'écho — la pastille clignotait et sous-comptait
/// jusqu'au prochain `notification:counts`.
///
/// Un id reste réclamable pendant `window` : l'entrée n'est PAS retirée à la
/// première réclamation. Le gateway peut ré-émettre (mark-read idempotent
/// rejoué par une action rapide, par le widget, par un retry REST), et chaque
/// écho supplémentaire décrémenterait un compteur déjà à jour. Passée la
/// fenêtre, un `notification:read` sur le même id redevient ce qu'il est :
/// l'annonce d'une lecture faite AILLEURS, qui doit bien décrémenter.
///
/// Type PUR — aucune horloge implicite, aucun singleton : `now` est un
/// paramètre, ce qui rend la fenêtre témoignable sans attendre.
struct NotificationSelfReadLedger {
    /// Combien de temps un écho reste attribuable à notre propre geste. Large
    /// devant l'aller-retour socket (quelques dizaines de ms), court devant une
    /// lecture faite sur un autre appareil et qui mériterait, elle, son `−1`.
    static let defaultWindow: TimeInterval = 30

    private var readAt: [String: Date] = [:]
    private let window: TimeInterval

    init(window: TimeInterval = NotificationSelfReadLedger.defaultWindow) {
        self.window = window
    }

    /// Déclare que ce geste-ci a marqué `id` lu et a déjà appliqué son `−1`.
    mutating func register(_ id: String, at now: Date = Date()) {
        guard !id.isEmpty else { return }
        purge(before: now)
        readAt[id] = now
    }

    /// Annule la déclaration — le réseau a refusé, le `−1` a été rendu.
    /// L'écho qui suivrait (il n'y en aura pas) ne doit plus être ignoré.
    mutating func forget(_ id: String) {
        readAt.removeValue(forKey: id)
    }

    /// `true` quand cet écho est le NÔTRE : l'appelant l'ignore.
    mutating func claimsEcho(_ id: String, at now: Date = Date()) -> Bool {
        purge(before: now)
        return readAt[id] != nil
    }

    /// Vide sur logout — un compte ne lègue pas ses lectures au suivant.
    mutating func removeAll() {
        readAt.removeAll()
    }

    private mutating func purge(before now: Date) {
        readAt = readAt.filter { now.timeIntervalSince($0.value) < window }
    }
}
