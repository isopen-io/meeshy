import Foundation
import Combine
import os

private let logger = MeeshyLog.logger(.notifications, subsystem: .sdk)

extension NotificationToastManager {
    /// Écrit l'état « lu » DANS LE CACHE durable, pas seulement dans les vues.
    ///
    /// Sans ça, `NotificationListViewModel.loadInitial()` — qui lit le cache
    /// avant le réseau, avec une fenêtre fraîche de 2 minutes — re-servait
    /// l'instantané d'avant le marquage : les notifications lues repartaient
    /// non lues à la réouverture de la cloche.
    /// `internal` (pas `private`) : les chemins de consommation vivent dans
    /// `NotificationConsumption.swift` — la responsabilité « marquer lu », qui
    /// a sa propre optimisation optimiste et son rollback, sortie d'ici pour
    /// tenir le budget de fichier.
    func applyReadToCache(_ scope: NotificationReadScope) {
        Task {
            await CacheCoordinator.shared.notifications.update(for: "all") { items in
                NotificationCachePatch.markingRead(items, scope: scope)
            }
        }
    }

    /// Le geste INVERSE — la seule chose qu'un rollback puisse écrire. Le
    /// réseau a refusé le marquage : la ligne doit redevenir non lue DANS LE
    /// CACHE, sans quoi la prochaine lecture de la cloche (`loadInitial()` lit
    /// le cache avant le réseau) re-servirait une ligne lue que le serveur
    /// n'a jamais marquée.
    func applyUnreadToCache(_ notificationId: String) {
        Task {
            await CacheCoordinator.shared.notifications.update(for: "all") { items in
                NotificationCachePatch.markingUnread(items, id: notificationId)
            }
        }
    }

    /// L'ÉCRITURE elle-même, séparée de son ORDONNANCEMENT — c'est la
    /// distinction qui compte pour le push de révocation (#3894) : le chemin
    /// socket peut la lancer sans l'attendre (l'app est vivante, le flush
    /// débounce de `GRDBCacheStore` a tout le temps de partir), le chemin push
    /// doit l'ATTENDRE (le processus est suspendu dans la seconde qui suit
    /// `completionHandler`).
    private static func removeFromCache(_ notificationId: String) async {
        await CacheCoordinator.shared.notifications.update(for: "all") { items in
            NotificationCachePatch.removing(items, id: notificationId)
        }
    }

    /// Retire durablement une ligne supprimée — même raison que ci-dessus : sans
    /// écriture cache, la notification supprimée réapparaissait au prochain
    /// `loadInitial()` servi par le cache.
    private func applyDeletionToCache(_ notificationId: String) {
        Task { await Self.removeFromCache(notificationId) }
    }

    /// Cache + republication pour UNE notification déjà retirée côté serveur —
    /// l'atome PARTAGÉ entre `delete()` (geste local) et
    /// `handleNotificationDeleted` (socket `notification:deleted`), tous deux
    /// joués app VIVANTE. Sa jumelle `applyRevocationDurably(_:)` sert le push
    /// (#3894), où l'écriture doit être attendue. La republication
    /// (`notificationWasDeleted`) est ce que `NotificationActionHandler.observeRevocations`
    /// traduit en retrait de bannière livrée. `internal` (pas `private`) :
    /// point d'entrée de test pour le comportement cache + publication sans
    /// déclencher le réseau de `refreshUnreadCount()`.
    func applyRevocationLocally(_ notificationId: String) {
        applyDeletionToCache(notificationId)
        notificationWasDeleted.send(notificationId)
    }

    /// Jumelle DURABLE de l'atome ci-dessus : même patch cache, même
    /// republication, mais l'écriture est ATTENDUE au lieu d'être confiée à un
    /// `Task` détaché.
    ///
    /// C'est la seule forme utilisable depuis un réveil en arrière-plan
    /// (#3894) : `applyDeletionToCache` rend la main avant que la mutation ait
    /// touché L1, et `GRDBCacheStore` ne pousse L1 vers SQLite qu'après un
    /// débounce de 2 s. Or le push de révocation appelle
    /// `completionHandler(.noData)` dès le retour — iOS suspend puis tue
    /// couramment un processus lancé en arrière-plan avant ce débounce, et la
    /// ligne révoquée ressuscitait au démarrage à froid suivant, servie par le
    /// cache. Le prix d'une ligne perdue est connu du dépôt : « l'oubli du
    /// store notifications perdait l'état "lu" au kill » (`GRDBDirtyFlushing`).
    func applyRevocationDurably(_ notificationId: String) async {
        await Self.removeFromCache(notificationId)
        notificationWasDeleted.send(notificationId)
    }

    /// Supprime UNE notification : serveur + cache + publication vers les vues.
    @discardableResult
    public func delete(notificationId: String) async -> Bool {
        do {
            try await NotificationService.shared.delete(notificationId: notificationId)
        } catch {
            logger.error("Failed to delete notification \(notificationId): \(error.localizedDescription)")
            return false
        }
        applyRevocationLocally(notificationId)
        await refreshUnreadCount()
        return true
    }

    /// Applique, pour un LOT de notifications déjà révoquées côté SERVEUR, le
    /// même geste que le socket `notification:deleted` fait une par une —
    /// cache + republication (retrait de bannière via
    /// `NotificationActionHandler.observeRevocations`) — PLUS le recalcul du
    /// compteur de la cloche.
    ///
    /// Point d'entrée du push de contrôle `notification_revoked`
    /// (`AppDelegate`, app fermée/arrière-plan, #3894) : ce canal n'a PAS le
    /// `notification:counts` compagnon que le socket reçoit pour recaler la
    /// cloche (un seul push de contrôle par révocation — voir
    /// `notificationRevocationPush.ts` côté gateway) ; cette méthode referme
    /// la boucle en le redemandant elle-même via `refreshUnreadCount()`, le
    /// MÊME appel que `delete()` utilise pour le geste local équivalent.
    ///
    /// La part locale est DURABLE (`applyServerRevocationLocally`, ci-dessous)
    /// et se joue AVANT le réseau : l'appelant rend la main à iOS
    /// (`completionHandler(.noData)`) dès le retour, et ce qui n'a pas atteint
    /// SQLite d'ici là ne l'atteindra peut-être jamais.
    public func applyServerRevocation(notificationIds: [String]) async {
        guard await applyServerRevocationLocally(notificationIds: notificationIds) else { return }
        await refreshUnreadCount()
    }

    /// La part LOCALE et DURABLE de la révocation — cache patché, écriture
    /// SQLite forcée, ids republiés — rendue `internal` pour que les tests
    /// l'exercent en comportement RÉEL sans déclencher le recalcul réseau du
    /// compteur (`NotificationToastManager` est un singleton pur, sans seam
    /// d'injection). Rend `false` quand il n'y avait rien à révoquer.
    ///
    /// Deux points que le lot d'origine n'avait pas :
    ///
    /// 1. **Les ids VIDES sont écartés ici, pas au parseur.**
    ///    `NotificationRevocationPayload.ids(from:)` ne filtre plus rien — le
    ///    RANG y porte un sens (`conversationIds[i]` qualifie
    ///    `notificationIds[i]`) — donc c'est au CONSOMMATEUR d'être honnête :
    ///    sans ce filtre, un `notificationIds` réduit à des vides (`""` →
    ///    `[""]`) passait le garde d'entrée, republiait un id vide sur
    ///    `notificationWasDeleted` (un aller-retour `getDeliveredNotifications`
    ///    pour rien) et émettait un `GET /notifications/unread-count` inutile.
    /// 2. **Le flush est explicite et précède le réseau.** La durabilité ne
    ///    doit pas être l'otage d'un GET lent : ce qu'iOS peut interrompre
    ///    après `completionHandler` doit déjà être sur le disque.
    func applyServerRevocationLocally(notificationIds: [String]) async -> Bool {
        let ids = notificationIds.filter { !$0.isEmpty }
        guard !ids.isEmpty else { return false }
        for id in ids {
            await applyRevocationDurably(id)
        }
        await CacheCoordinator.shared.notifications.flushDirtyKeys()
        return true
    }
}
