import Foundation
import os

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

/// Le `threadIdentifier` sous lequel iOS REGROUPE les bannières — celui que
/// l'extension de service pose sur chaque push (`MeeshyNotificationExtension`,
/// `applyThreading(to:)`).
///
/// C'est la seule clé qui permette de retirer du centre de notifications
/// TOUTES les bannières d'un fil qu'on vient de consommer. Les quick-actions
/// retiraient par `userInfo["conversationId"]`, ce qui rate toute bannière dont
/// la charge n'a pas porté la clé alors qu'iOS l'a bien rangée dans le fil, et
/// l'ouverture d'une conversation ne retirait RIEN.
///
/// **Sa jumelle vit dans la NSE, et ne peut pas appeler celle-ci** : une
/// extension de service ne lie pas MeeshySDK. La garde
/// `NotificationConsumptionWiringTests` relit donc la source de la NSE pour que
/// les deux formes ne divergent jamais en silence.
public enum NotificationThreadIdentifier {
    public static func conversation(_ id: String) -> String { "conversation:\(id)" }
    public static func post(_ id: String) -> String { "post:\(id)" }

    /// Le fil d'une référence de consommation — `nil` quand la référence n'en
    /// désigne aucun : une notification isolée (`.id`), une catégorie, la
    /// boîte entière. Ne JAMAIS y répondre par un repli : retirer « toutes les
    /// bannières » est exactement le geste que #7000 vient de supprimer.
    public static func resolve(for ref: NotificationRef) -> String? {
        switch ref {
        case .conversation(let id):
            return id.isEmpty ? nil : conversation(id)
        case .post(let id):
            return id.isEmpty ? nil : post(id)
        case .notification, .types, .all:
            return nil
        }
    }
}

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

// MARK: - La consommation

/// **UNE consommation, appelée par tous les chemins d'ouverture (#6999).**
///
/// Sept surfaces marquaient lu — ou ne marquaient pas — chacune à leur façon :
/// la ligne de cloche appelait `markRead(notificationId:)`, l'ouverture d'une
/// conversation `onConversationOpened`, celle d'un post `onPostOpened`, l'écran
/// des demandes `markRead(types:)`, « Tout lire » `markAllAsRead()` — et le tap
/// sur une bannière push, le tap sur un toast et les actions rapides
/// ami/commentaire ne marquaient RIEN. `consume(_:)` est le point unique : il
/// marque lu côté serveur, patche le cache durable, décrémente le compteur UNE
/// fois, et republie vers les vues montées.
///
/// Extension, et fichier séparé : `NotificationToastManager.swift` frôlait le
/// budget de 1000 lignes, et « marquer lu » est une responsabilité à part
/// entière — elle porte désormais son optimisme, son rollback et le registre
/// des échos.
extension NotificationToastManager {

    /// Consomme ce que `ref` désigne. Rend `false` quand le serveur a refusé
    /// (le rollback a été appliqué) ou qu'il n'y avait rien à consommer.
    @discardableResult
    public func consume(_ ref: NotificationRef) async -> Bool {
        switch ref {
        case .notification(let id):
            return await markRead(notificationId: id)
        case .conversation(let id):
            onConversationMarkedRead(id)
            return true
        case .post(let id):
            onPostConsumed(id)
            return true
        case .types(let types):
            return await markRead(types: types)
        case .all:
            return await markAllAsRead()
        }
    }

    // MARK: - Une notification

    /// Marque UNE notification lue : cache + vues + compteur D'ABORD, réseau
    /// ENSUITE, rollback en cas de refus (#7000).
    ///
    /// L'ordre était l'inverse : la pastille n'était touchée qu'APRÈS
    /// l'aller-retour REST, et un échec était un `return` muet. Sur un réseau
    /// lent, taper une ligne de cloche ne produisait rien pendant une seconde
    /// ou deux ; sur un réseau coupé, rien du tout, jamais, sans le moindre
    /// signal. La règle maison est l'inverse (`FeedViewModel` : instantané →
    /// réseau → rollback + toast).
    @discardableResult
    public func markRead(notificationId: String) async -> Bool {
        guard applyReadOptimistically(notificationId) else { return false }
        do {
            try await NotificationService.shared.markAsRead(notificationId: notificationId)
            return true
        } catch {
            consumptionLogger.error("Failed to mark notification \(notificationId) read: \(error.localizedDescription)")
            rollbackRead(notificationId)
            return false
        }
    }

    /// Les quatre écritures d'un marquage local, dans l'ordre où l'utilisateur
    /// les perçoit. Rend `false` — et n'écrit RIEN — quand cet appareil vient
    /// déjà de consommer cet id : deux chemins peuvent viser la même ligne
    /// (bannière push tapée puis ligne de cloche tapée), et le second ne doit
    /// pas re-décrémenter.
    ///
    /// `internal` : point d'entrée des tests, qui exercent l'optimisme et le
    /// rollback sans réseau.
    @discardableResult
    func applyReadOptimistically(_ notificationId: String) -> Bool {
        guard !notificationId.isEmpty else { return false }
        guard !selfReadLedger.claimsEcho(notificationId) else { return false }
        selfReadLedger.register(notificationId)
        applyReadToCache(.notification(id: notificationId))
        notificationMarkedRead.send(notificationId)
        NotificationCoordinator.shared.decrementInAppNotificationUnread()
        return true
    }

    /// Le geste INVERSE, exactement : le `−1` est rendu, la ligne redevient non
    /// lue dans le cache ET dans les vues montées, et l'id sort du registre —
    /// sans quoi un `notification:read` ultérieur, venu d'un autre appareil,
    /// serait pris pour notre propre écho et ignoré.
    ///
    /// `internal` : point d'entrée des tests.
    func rollbackRead(_ notificationId: String) {
        selfReadLedger.forget(notificationId)
        applyUnreadToCache(notificationId)
        NotificationCoordinator.shared.incrementInAppNotificationUnread()
        notificationReadRolledBack.send(notificationId)
    }

    // MARK: - Une catégorie

    /// Marque lue toute une CATÉGORIE de notifications — appelé quand un écran
    /// dédié la consomme (demandes d'ajout). Serveur + cache + publication : le
    /// chemin direct par le service ne touchait ni le cache ni les vues, donc
    /// les lignes repartaient non lues à la réouverture de la cloche.
    @discardableResult
    public func markRead(types: [String]) async -> Bool {
        do {
            _ = try await NotificationService.shared.markRead(types: types)
        } catch {
            consumptionLogger.error("Failed to mark types \(types.joined(separator: ",")) read: \(error.localizedDescription)")
            return false
        }
        applyReadToCache(.types(types))
        typeNotificationsRead.send(types)
        await refreshUnreadCount()
        return true
    }

    // MARK: - Tout

    /// « Tout lire » — et SEULEMENT en cas de succès (#7000).
    ///
    /// L'échec était journalisé puis oublié : le compteur n'était pas remis à
    /// zéro (correct), mais l'appelant — `NotificationListView.markAllRead()` —
    /// patchait son tableau INCONDITIONNELLEMENT derrière l'`await`. La cloche
    /// affichait donc toutes ses lignes lues au-dessus d'un compteur inchangé,
    /// pour un serveur qui n'avait rien marqué. Le verdict remonte désormais à
    /// l'appelant.
    @discardableResult
    public func markAllAsRead() async -> Bool {
        do {
            _ = try await NotificationService.shared.markAllAsRead()
        } catch {
            consumptionLogger.error("Failed to mark all as read: \(error.localizedDescription)")
            return false
        }
        NotificationCoordinator.shared.setInAppNotificationUnread(0)
        applyReadToCache(.all)
        allNotificationsRead.send(())
        return true
    }

    // MARK: - Échos socket

    /// Une autre surface a marqué la notification lue : on répercute dans le
    /// cache durable, pas seulement dans les vues montées.
    ///
    /// **« Une autre surface » n'est PAS toujours un autre appareil (#7000).**
    /// Le gateway diffuse `notification:read` à la room `user:<id>`, donc
    /// aussi à l'acteur — ce qui refaisait un `−1` sur un compteur que
    /// `applyReadOptimistically` venait de décrémenter. Le registre tranche :
    /// un écho réclamé ne touche plus le compteur. Le patch cache et la
    /// republication, eux, restent joués dans les deux cas : ils sont
    /// idempotents, et une vue montée pendant l'aller-retour doit se peindre.
    ///
    /// `internal` (pas `private`) : point d'entrée des tests, faute de mock
    /// Socket.IO.
    func handleNotificationRead(_ event: NotificationReadEvent) {
        if !selfReadLedger.claimsEcho(event.notificationId) {
            NotificationCoordinator.shared.decrementInAppNotificationUnread()
        }
        applyReadToCache(.notification(id: event.notificationId))
        notificationMarkedRead.send(event.notificationId)
    }

    /// Un AUTRE appareil du même compte vient de marquer un LOT lu. Les chemins
    /// bulk du gateway ne rendent AUCUN id : ils annoncent le PRÉDICAT qu'ils
    /// viennent d'appliquer, que chaque client rejoue sur son propre cache.
    ///
    /// Une portée qu'on ne sait pas traduire n'est PAS appliquée : rejouer un
    /// prédicat approximatif marquerait lues des lignes qui ne le sont pas —
    /// pire que de ne rien faire, le refresh REST suivant rétablissant la
    /// vérité. Aucun refetch n'est déclenché ici : le compteur autoritatif
    /// arrive par `notification:counts`, déjà traité par
    /// `NotificationCoordinator`.
    ///
    /// Interne (pas `private`) : point d'entrée des tests, faute de mock
    /// Socket.IO.
    func handleNotificationReadBulk(_ event: NotificationReadBulkEvent) {
        guard let scope = NotificationBulkScopeMapping.readScope(from: event.scope) else {
            consumptionLogger.error("notification:read-bulk ignoré — portée non traduisible (kind: \(event.scope.kind))")
            return
        }
        applyReadToCache(scope)
        republishRead(scope)
    }

    /// Republication vers les vues MONTÉES : le patch cache ci-dessus est
    /// durable mais muet, et `NotificationListView` sert son tableau depuis sa
    /// propre copie mémoire. On réutilise les subjects par lesquels le geste
    /// LOCAL équivalent passe déjà.
    ///
    /// `.all` a désormais LE SIEN — `allNotificationsRead` (#7000). Le `break`
    /// qui tenait sa place était documenté comme une conséquence assumée :
    /// « créer un canal exigerait son abonné, hors de ce lot ». L'abonné est
    /// écrit, le canal existe, et une cloche montée se repeint au lieu de
    /// garder des lignes que le cache sait lues. Ne PAS fabriquer une portée de
    /// repli pour emprunter un autre canal — ce serait marquer lues des lignes
    /// hors portée.
    func republishRead(_ scope: NotificationReadScope) {
        switch scope {
        case .notification(let id):
            notificationMarkedRead.send(id)
        case .conversation(let id):
            conversationNotificationsRead.send(id)
        case .post(let id):
            postNotificationsRead.send(id)
        case .types(let types):
            typeNotificationsRead.send(types)
        case .all:
            allNotificationsRead.send(())
        }
    }
}

private let consumptionLogger = Logger(subsystem: "me.meeshy.sdk", category: "notifications")
