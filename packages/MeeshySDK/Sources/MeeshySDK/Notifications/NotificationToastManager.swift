import Foundation
import Combine
import os

private let logger = Logger(subsystem: "me.meeshy.sdk", category: "notifications")

/// High-level orchestrator for in-app notifications.
///
/// Responsibilities split (read carefully before touching):
/// - **Toast / transient UI**: `currentToast` + dismiss timer — owned by this class.
/// - **Active conversation tracking**: suppresses self-authored toasts.
/// - **Unread count**: DELEGATED to `NotificationCoordinator`. Callers read
///   `unreadCount` here for API continuity, but the value is mirrored from the
///   coordinator — every mutation goes through the coordinator first.
///
/// The coordinator is the single source of truth for the notification bell, the
/// system badge and the widget data store. This class must not write directly to
/// `UIApplication.setBadgeCount` or to the App Group defaults.
@MainActor
public final class NotificationToastManager: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    public static let shared = NotificationToastManager()

    /// Mirrors `NotificationCoordinator.inAppNotificationUnread`. Kept as a
    /// `@Published` convenience so legacy SwiftUI views that observe
    /// `NotificationToastManager.shared` continue to refresh without changes.
    @Published public private(set) var unreadCount: Int = 0

    @Published public private(set) var currentToast: SocketNotificationEvent?

    /// Délibérément PAS `@Published` — aucune vue ne les observe.
    ///
    /// Ce sont des gardes de suppression, lues SYNCHRONIQUEMENT au moment de
    /// décider si une notification doit se signaler (`handleNewNotification`),
    /// et une fois par `FeedCommentsSheet` à l'ouverture. Personne n'en dérive
    /// d'affichage.
    ///
    /// Publiées, elles coûtaient très cher : `RootView` et `iPadRootView`
    /// observent ce singleton en `@ObservedObject`, donc CHAQUE ouverture ou
    /// fermeture de conversation, et chaque slide de story (`onPostOpened` est
    /// ré-annoncé à chaque révélation), ré-évaluait la racine entière. Cette
    /// ré-évaluation reconstruit un `ConversationViewModel` jetable — donc un
    /// `ConversationSocketHandler` jetable — dont la boucle create/destroy est
    /// documentée en tête de `ConversationSocketHandler.swift` (pic CPU, storm
    /// 429 sur `/read`) et n'était jusqu'ici que CONTENUE par des gardes
    /// idempotents, jamais tarie à la source.
    ///
    /// Même raisonnement, et même formulation, que
    /// `ConversationStateStore.messages`. Ne pas les republier sans montrer
    /// d'abord une vue qui les LIT.
    public private(set) var activeConversationId: String?
    public var activePostId: String?

    public let newNotificationReceived = PassthroughSubject<SocketNotificationEvent, Never>()
    public let notificationMarkedRead = PassthroughSubject<String, Never>()
    public let notificationWasDeleted = PassthroughSubject<String, Never>()

    /// Émis quand toutes les notifications d'une conversation viennent d'être
    /// marquées lues (ouverture de la conversation). Permet à la liste in-app
    /// de mettre à jour ses lignes immédiatement, avant le refresh serveur.
    public let conversationNotificationsRead = PassthroughSubject<String, Never>()

    /// Pendant du précédent pour un post — story, statut, post de feed.
    /// Émis à l'ouverture du contenu (`onPostOpened`).
    public let postNotificationsRead = PassthroughSubject<String, Never>()

    /// Émis quand une CATÉGORIE entière vient d'être consommée par un écran
    /// dédié (demandes d'ajout).
    public let typeNotificationsRead = PassthroughSubject<[String], Never>()

    /// Joueur d'haptique injecté par la cible app (le SDK core n'importe pas
    /// UIKit) — même pattern que `conversationPresentationProvider`. Appelé à l'apparition
    /// d'un toast, UNIQUEMENT si la préférence « Vibrations »
    /// (`vibrationEnabled`) est active : c'est le consommateur réel de ce
    /// toggle côté in-app.
    public var hapticPlayer: (@MainActor () -> Void)?

    /// Présentation Local-First (nom renommé + emoji favori) d'une conversation
    /// pour les toasts in-app. Le SDK ne peut pas lire le snapshot local des
    /// conversations de l'app, donc la cible app injecte une closure de pull —
    /// même pattern que `hapticPlayer`. Retourne `nil` → on retombe sur
    /// le titre serveur (`event.toastSubtitle`).
    public var conversationPresentationProvider: (@MainActor (_ conversationId: String) -> ConversationPresentation?)?

    /// Pièces de présentation d'une conversation, résolues par l'app et
    /// consommées par le toast. `name` = `customName ?? title` (renommage
    /// local), `favoriteEmoji` = classification favorite. Local-First : l'app
    /// les lit depuis ses préférences locales (possiblement non encore
    /// synchronisées backend).
    public struct ConversationPresentation: Sendable {
        public let name: String
        public let favoriteEmoji: String?

        public init(name: String, favoriteEmoji: String?) {
            self.name = name
            self.favoriteEmoji = favoriteEmoji
        }

        /// `<favori> <nom>` (favori en tête), ou `<nom>` sans favori — même
        /// ordre que les notifications push (favori d'abord).
        public var composedSubtitle: String {
            guard let fav = favoriteEmoji?.trimmingCharacters(in: .whitespaces),
                  !fav.isEmpty else { return name }
            return "\(fav) \(name)"
        }
    }

    /// Sous-titre à afficher sous le titre du toast. Pour un événement de
    /// conversation (qui a déjà un sous-titre = nom de groupe), préfère la
    /// présentation LOCALE (nom renommé + favori). Sinon retombe sur
    /// `event.toastSubtitle`. Les messages directs (sans sous-titre) restent
    /// inchangés.
    @MainActor
    public func resolvedToastSubtitle(for event: SocketNotificationEvent) -> String? {
        let base = event.toastSubtitle
        guard base != nil,
              let conversationId = event.conversationId,
              let presentation = conversationPresentationProvider?(conversationId) else {
            return base
        }
        return presentation.composedSubtitle
    }

    private var cancellables = Set<AnyCancellable>()
    private var toastDismissTask: Task<Void, Never>?
    private static let toastDuration: UInt64 = 7_000_000_000
    private static let refreshDelay: UInt64 = 500_000_000

    // Dedup set: évite d'afficher 2x la même notification (APN foreground + socket simultanés)
    private var recentNotificationIds = Set<String>()

    // Coalescing du compteur non-lu : `refreshUnreadCount` a 8 appelants (boot app,
    // login, RootView, iPadRootView, NotificationListView…) qui se déclenchent quasi
    // simultanément au démarrage → ~11 `GET /notifications/unread-count` en rafale.
    // On partage la Task en vol et on limite à 1 refresh par `unreadRefreshMinInterval`.
    private var unreadRefreshTask: Task<Void, Never>?
    private var lastUnreadRefreshAt: Date?
    private static let unreadRefreshMinInterval: TimeInterval = 1.5

    // Coalescing du mark-read par conversation : même protection que pour le
    // compteur non-lu. Un cycle open→close→open rapproché (re-render parent,
    // navigation aller-retour) ne doit produire qu'UN seul
    // `POST /notifications/conversation/:id/read` — sans ce gate, chaque
    // passage du guard `activeConversationId` émet un POST, et la rafale
    // sature le rate-limiter gateway (storm 429 observé sur device, chaque
    // requête retentée 3× amplifiant la saturation). Les notifications qui
    // arrivent pendant que la conversation est OUVERTE sont déjà marquées
    // unitairement par `handleNewNotification`, donc sauter un POST redondant
    // dans la fenêtre de cooldown n'introduit pas de dérive durable.
    private var conversationReadTasks: [String: Task<Void, Never>] = [:]
    private var lastConversationReadAt: [String: Date] = [:]
    private static let conversationReadMinInterval: TimeInterval = 5

    // Même protection anti-rafale pour les posts / stories : le viewer de story
    // ré-annonce la story courante à chaque révélation de slide et à chaque
    // retour d'interlude.
    private var postReadTasks: [String: Task<Void, Never>] = [:]
    private var lastPostReadAt: [String: Date] = [:]

    private init() {
        subscribeToCoordinator()
        subscribeToSocketEvents()
    }

    // MARK: - Public API

    public func refreshUnreadCount() async {
        // Coalesce les appelants concurrents : si un refresh est déjà en vol, on
        // l'attend au lieu d'émettre un second GET. Si un refresh vient d'aboutir
        // (< unreadRefreshMinInterval), on no-op — la valeur autoritative arrive
        // aussi via le socket `notification:counts`, donc sauter un GET redondant
        // n'introduit pas de dérive durable.
        if let task = unreadRefreshTask {
            await task.value
            return
        }
        if let last = lastUnreadRefreshAt,
           Date().timeIntervalSince(last) < Self.unreadRefreshMinInterval {
            return
        }

        let task = Task { [weak self] in
            do {
                let count = try await NotificationService.shared.unreadCount()
                NotificationCoordinator.shared.setInAppNotificationUnread(count)
            } catch {
                logger.error("Failed to refresh unread count: \(error.localizedDescription)")
            }
            self?.lastUnreadRefreshAt = Date()
            self?.unreadRefreshTask = nil
        }
        unreadRefreshTask = task
        await task.value
    }

    public func onConversationOpened(_ conversationId: String) {
        // Gate idempotent : un parent qui observe ce manager (RootView / iPadRootView)
        // se re-render à chaque mutation `@Published`, ce qui fait re-construire à
        // SwiftUI un `ConversationViewModel` jetable → un `ConversationSocketHandler`
        // jetable → un nouvel appel à `onConversationOpened` pour la conversation DÉJÀ
        // ouverte. Sans ce gate, chaque tour relance `markConversationRead` +
        // `refreshUnreadCount` ET re-publie `activeConversationId`/`unreadCount`, ce
        // qui re-render le parent → boucle auto-entretenue (storm 429 sur `/read`).
        // Re-ouvrir réellement une autre conversation, ou la même après
        // `onConversationClosed()` (→ nil), passe normalement.
        guard conversationId != activeConversationId else { return }

        activeConversationId = conversationId
        MessageSocketManager.shared.activeConversationId = conversationId

        if let toast = currentToast, toast.conversationId == conversationId {
            dismissToast()
        }

        // Le contenu de la conversation est consommé : ses notifications ne
        // doivent plus apparaître comme non lues. On informe d'abord la liste
        // in-app (mise à jour optimiste instantanée), puis on marque côté serveur
        // (qui ré-émet `notification:counts` → la cloche/badge se recalent), et
        // enfin on rafraîchit le compteur pour récupérer la valeur autoritative.
        conversationNotificationsRead.send(conversationId)
        applyReadToCache(.conversation(id: conversationId))
        markConversationNotificationsRead(conversationId)
    }

    /// Variante de `onConversationOpened` pour un marquage SANS ouverture : la
    /// quick-action « Marquer lu » d'une bannière push et l'action du widget
    /// consomment la conversation sans jamais l'afficher. Fait le même triplet
    /// (publisher in-app + patch du cache GRDB + marquage serveur coalescé)
    /// mais ne déclare PAS la conversation active — l'app peut être en
    /// arrière-plan, aucune surface n'est ouverte.
    public func onConversationMarkedRead(_ conversationId: String) {
        if let toast = currentToast, toast.conversationId == conversationId {
            dismissToast()
        }

        conversationNotificationsRead.send(conversationId)
        applyReadToCache(.conversation(id: conversationId))
        markConversationNotificationsRead(conversationId)
    }

    /// Pendant de `onConversationOpened` pour un contenu social : story, statut
    /// ou post de feed. Le contenu étant consommé, ses notifications (« X a
    /// publié une story », commentaires et réactions dessus) ne doivent plus
    /// apparaître comme non lues.
    ///
    /// Ne PAS confondre avec l'appel opportuniste que le gateway fait déjà
    /// depuis `POST /posts/:postId/view` : celui-là est borné à la PREMIÈRE vue,
    /// et le « vu » client est coalescé (binaire) donc une seconde ouverture ne
    /// repart même pas. Une notification arrivée après la première vue resterait
    /// non lue pour toujours.
    public func onPostOpened(_ postId: String) {
        guard postId != activePostId else { return }

        activePostId = postId

        if let toast = currentToast, toast.postId == postId {
            dismissToast()
        }

        postNotificationsRead.send(postId)
        applyReadToCache(.post(id: postId))
        markPostNotificationsRead(postId)
    }

    /// Relâche la déclaration de contenu actif — appelé à la fermeture du
    /// viewer. Conditionnel à l'identité pour rester correct sur un
    /// enchaînement rapide A→B où le `onDisappear` de A arrive après le
    /// `onAppear` de B.
    public func onPostClosed(_ postId: String? = nil) {
        guard postId == nil || postId == activePostId else { return }
        activePostId = nil
    }

    /// Même gate que `markConversationNotificationsRead` : au plus un POST par
    /// post et par fenêtre, jamais deux en vol.
    private func markPostNotificationsRead(_ postId: String) {
        guard postReadTasks[postId] == nil else { return }
        if let last = lastPostReadAt[postId],
           Date().timeIntervalSince(last) < Self.conversationReadMinInterval {
            return
        }
        postReadTasks[postId] = Task { [weak self] in
            // Chaque slide de story est un post distinct : sans ce filtre, une
            // story de dix slides émettrait dix POST. Quand le cache de la
            // cloche est peuplé et ne référence AUCUNE notification non lue pour
            // ce post, il n'y a rien à marquer. Cache vide ou inconnu → on
            // appelle quand même, le serveur fait autorité.
            if await Self.hasNoKnownUnreadNotification(forPost: postId) {
                self?.lastPostReadAt[postId] = Date()
                self?.postReadTasks[postId] = nil
                return
            }
            do {
                try await NotificationService.shared.markPostRead(postId: postId)
            } catch {
                logger.error("Failed to mark post \(postId) read: \(error.localizedDescription)")
            }
            await self?.refreshUnreadCount()
            self?.lastPostReadAt[postId] = Date()
            self?.postReadTasks[postId] = nil
        }
    }

    /// `true` seulement quand on SAIT qu'il n'y a rien à marquer — c'est-à-dire
    /// quand le cache de la cloche est peuplé et ne contient aucune ligne non
    /// lue portant ce `postId`. Un cache vide répond `false` (« je ne sais
    /// pas »), ce qui laisse partir la requête.
    private static func hasNoKnownUnreadNotification(forPost postId: String) async -> Bool {
        guard let cached = await CacheCoordinator.shared.notifications.loadIgnoringExpiry(for: "all"),
              !cached.items.isEmpty else { return false }
        return !cached.items.contains { !$0.isRead && $0.context?.postId == postId }
    }

    /// Écrit l'état « lu » DANS LE CACHE durable, pas seulement dans les vues.
    ///
    /// Sans ça, `NotificationListViewModel.loadInitial()` — qui lit le cache
    /// avant le réseau, avec une fenêtre fraîche de 2 minutes — re-servait
    /// l'instantané d'avant le marquage : les notifications lues repartaient
    /// non lues à la réouverture de la cloche.
    private func applyReadToCache(_ scope: NotificationReadScope) {
        Task {
            await CacheCoordinator.shared.notifications.update(for: "all") { items in
                NotificationCachePatch.markingRead(items, scope: scope)
            }
        }
    }

    /// Retire durablement une ligne supprimée — même raison que ci-dessus : sans
    /// écriture cache, la notification supprimée réapparaissait au prochain
    /// `loadInitial()` servi par le cache.
    private func applyDeletionToCache(_ notificationId: String) {
        Task {
            await CacheCoordinator.shared.notifications.update(for: "all") { items in
                NotificationCachePatch.removing(items, id: notificationId)
            }
        }
    }

    /// Cache + republication pour UNE notification déjà retirée côté serveur —
    /// l'atome PARTAGÉ entre `delete()` (geste local), `handleNotificationDeleted`
    /// (socket `notification:deleted`) et `applyServerRevocation(notificationIds:)`
    /// (push `notification_revoked`, #3894). La republication
    /// (`notificationWasDeleted`) est ce que `NotificationActionHandler.observeRevocations`
    /// traduit en retrait de bannière livrée. `internal` (pas `private`) :
    /// point d'entrée de test pour le comportement cache + publication sans
    /// déclencher le réseau de `refreshUnreadCount()`.
    func applyRevocationLocally(_ notificationId: String) {
        applyDeletionToCache(notificationId)
        notificationWasDeleted.send(notificationId)
    }

    /// Marque UNE notification lue : serveur + cache + publication vers les
    /// vues. Point d'entrée unique pour que les trois restent alignés (la liste
    /// in-app appelait le service directement et ne touchait que sa copie
    /// mémoire).
    public func markRead(notificationId: String) async {
        do {
            try await NotificationService.shared.markAsRead(notificationId: notificationId)
        } catch {
            logger.error("Failed to mark notification \(notificationId) read: \(error.localizedDescription)")
            return
        }
        applyReadToCache(.notification(id: notificationId))
        notificationMarkedRead.send(notificationId)
        NotificationCoordinator.shared.decrementInAppNotificationUnread()
    }

    /// Marque lue toute une CATÉGORIE de notifications — appelé quand un écran
    /// dédié la consomme (demandes d'ajout). Serveur + cache + publication : le
    /// chemin direct par le service ne touchait ni le cache ni les vues, donc
    /// les lignes repartaient non lues à la réouverture de la cloche.
    public func markRead(types: [String]) async {
        do {
            _ = try await NotificationService.shared.markRead(types: types)
        } catch {
            logger.error("Failed to mark types \(types.joined(separator: ",")) read: \(error.localizedDescription)")
            return
        }
        applyReadToCache(.types(types))
        typeNotificationsRead.send(types)
        await refreshUnreadCount()
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
    public func applyServerRevocation(notificationIds: [String]) async {
        guard !notificationIds.isEmpty else { return }
        notificationIds.forEach(applyRevocationLocally)
        await refreshUnreadCount()
    }

    /// Émet le `POST /notifications/conversation/:id/read` au plus une fois
    /// par conversation et par fenêtre de `conversationReadMinInterval`, et
    /// jamais deux fois en vol simultanément. Voir le commentaire des
    /// propriétés `conversationReadTasks` / `lastConversationReadAt`.
    private func markConversationNotificationsRead(_ conversationId: String) {
        guard conversationReadTasks[conversationId] == nil else { return }
        if let last = lastConversationReadAt[conversationId],
           Date().timeIntervalSince(last) < Self.conversationReadMinInterval {
            return
        }
        conversationReadTasks[conversationId] = Task { [weak self] in
            do {
                try await NotificationService.shared.markConversationRead(conversationId: conversationId)
            } catch {
                logger.error("Failed to mark conversation \(conversationId) read: \(error.localizedDescription)")
            }
            await self?.refreshUnreadCount()
            self?.lastConversationReadAt[conversationId] = Date()
            self?.conversationReadTasks[conversationId] = nil
        }
    }

    public func onConversationClosed() {
        activeConversationId = nil
        MessageSocketManager.shared.activeConversationId = nil
    }

    public func dismissToast() {
        toastDismissTask?.cancel()
        toastDismissTask = nil
        currentToast = nil
    }

    public func markAllAsRead() async {
        do {
            _ = try await NotificationService.shared.markAllAsRead()
            NotificationCoordinator.shared.setInAppNotificationUnread(0)
            applyReadToCache(.all)
        } catch {
            logger.error("Failed to mark all as read: \(error.localizedDescription)")
        }
    }

    public func reset() {
        dismissToast()
        activeConversationId = nil
        activePostId = nil
        conversationReadTasks.values.forEach { $0.cancel() }
        conversationReadTasks = [:]
        lastConversationReadAt = [:]
        postReadTasks.values.forEach { $0.cancel() }
        postReadTasks = [:]
        lastPostReadAt = [:]
        // Unread count cleared by NotificationCoordinator.reset() — do not
        // duplicate that write here or both paths will race.
    }

    // MARK: - Coordinator Mirror

    private func subscribeToCoordinator() {
        NotificationCoordinator.shared.$inAppNotificationUnread
            .receive(on: DispatchQueue.main)
            .assign(to: &$unreadCount)
    }

    // MARK: - Socket Subscriptions

    private func subscribeToSocketEvents() {
        let socket = MessageSocketManager.shared

        socket.notificationReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.handleNewNotification(event)
            }
            .store(in: &cancellables)

        socket.notificationRead
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.handleNotificationRead(event)
            }
            .store(in: &cancellables)

        socket.notificationDeleted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.handleNotificationDeleted(event)
            }
            .store(in: &cancellables)

        socket.notificationReadBulk
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.handleNotificationReadBulk(event)
            }
            .store(in: &cancellables)

        socket.notificationDeletedBulk
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.handleNotificationDeletedBulk(event)
            }
            .store(in: &cancellables)

        // `notification:counts` is handled by NotificationCoordinator directly —
        // we used to duplicate the subscription here, but that race was the
        // source of the drift between the bell and the badge.
    }

    // MARK: - Event Handlers

    // Interne (pas private) : point d'entrée des tests pour dérouler le
    // pipeline complet dedup → persist → prefs → toast/haptique.
    func handleNewNotification(_ event: SocketNotificationEvent) {
        // Muting logic: suppress the in-app toast if the user is already
        // viewing the relevant content. Le contenu étant consommé en direct,
        // la notification ne doit pas rester non lue : on la marque lue côté
        // serveur (qui ré-émet `notification:counts`). On NE l'incrémente pas
        // localement (on sort avant `incrementInAppNotificationUnread`).
        if let convId = event.conversationId, convId == activeConversationId {
            markConsumedOnArrival(event)
            return
        }

        // NOTE — un contenu social à l'écran (story ouverte, détail de post) ne
        // supprime PLUS la bannière. La règle produit ne connaît qu'UNE
        // exception, la conversation ouverte ci-dessus : tout le reste doit
        // remonter à l'utilisateur tant qu'il est dans l'application. Une story
        // ouverte reste donc signalée, et sa notification suit le chemin
        // nominal — persistée NON lue, comptée, affichée. `activePostId` garde
        // ses autres emplois (`onPostOpened` marque lu à l'OUVERTURE, ce qui
        // couvre le rattrapage du compteur).

        // Keep FriendshipCache in sync with real-time friend request events
        updateFriendshipCacheIfNeeded(event)

        // Dedup: APN foreground + socket `notification:new` can fire for the same
        // event within milliseconds of each other. Guard here — after friendship
        // cache update (which is idempotent and safe to run twice) but before the
        // unread increment and toast, which must fire exactly once per notification.
        guard !recentNotificationIds.contains(event.id) else {
            return
        }
        recentNotificationIds.insert(event.id)
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(2))
            self?.recentNotificationIds.remove(event.id)
        }

        // Durably persist the notification into the local cache so the bell list
        // shows it after a cold start / offline reopen — the toast is ephemeral.
        persistToCache(event)

        // The unread counter reflects what the *server* thinks — increment it
        // regardless of local prefs so the coordinator stays aligned with the
        // authoritative count. Local prefs only gate the TOAST surface.
        NotificationCoordinator.shared.incrementInAppNotificationUnread()
        newNotificationReceived.send(event)

        // La bannière in-app a sa propre règle, plus permissive que celle du
        // push : `allowsInAppBanner` n'applique que les interrupteurs PAR TYPE.
        // `pushEnabled`, la fenêtre « Ne pas déranger » et le Focus iOS
        // protègent l'attention de l'utilisateur ABSENT — ici il est devant
        // l'écran. Cf. le doc-comment de `allowsInAppBanner(type:)`.
        let prefs = UserPreferencesManager.shared.notification
        if prefs.allowsInAppBanner(type: event.notificationType) {
            showToast(event)
        }
    }

    /// Le contenu visé est DÉJÀ à l'écran : la notification naît consommée.
    /// On la persiste quand même (elle doit exister dans l'historique de la
    /// cloche), mais lue, et on la marque lue côté serveur — qui ré-émet
    /// `notification:counts`, recalant cloche et badge. On sort avant
    /// `incrementInAppNotificationUnread` : rien n'est en attente.
    private func markConsumedOnArrival(_ event: SocketNotificationEvent) {
        let notificationId = event.id
        persistToCache(event, isRead: true)
        Task {
            try? await NotificationService.shared.markAsRead(notificationId: notificationId)
        }
        notificationMarkedRead.send(notificationId)
    }

    /// Durably append the freshly received notification to the `notifications`
    /// cache so it survives an app restart / offline reopen. Strict no-op when the
    /// list cache was never populated (see `prependToExisting`): fabricating a
    /// single-item `.fresh` cache would suppress the next authoritative REST
    /// refresh. De-duplicated by id, so an APN + socket double-delivery (already
    /// guarded above) or a later REST refresh never doubles the row.
    private func persistToCache(_ event: SocketNotificationEvent, isRead: Bool = false) {
        let createdAtStr = Date().formatted(.iso8601.time(includingFractionalSeconds: true))
        let base = event.toAPINotification(createdAt: createdAtStr)
        let apiNotification = isRead ? base.withReadState(true) : base
        Task {
            await CacheCoordinator.shared.notifications.prependToExisting(apiNotification, for: "all")
        }
    }

    private func updateFriendshipCacheIfNeeded(_ event: SocketNotificationEvent) {
        let cacheChanged: Bool
        switch event.notificationType {
        case .friendRequest:
            guard let senderId = event.senderId,
                  let requestId = event.context?.friendRequestId else { return }
            FriendshipCache.shared.didReceiveRequest(from: senderId, requestId: requestId)
            cacheChanged = true
        case .friendAccepted:
            guard let accepterId = event.senderId else { return }
            FriendshipCache.shared.didAcceptRequest(from: accepterId)
            cacheChanged = true
        default:
            cacheChanged = false
        }
        // Real-time mutations from the gateway flip the in-memory FriendshipCache
        // but the persistent GRDB stores (friends list, received / sent requests)
        // would still serve `.fresh` data without the new state, masking the
        // event until the natural TTL elapses. Invalidate them so the next
        // `loadFriends()` / `loadReceived()` round-trips the gateway and writes
        // the freshly-mutated truth to SQLite. Fire-and-forget — the local
        // optimistic state in `FriendshipCache` already drives the UI.
        if cacheChanged {
            Task { await FriendshipCache.shared.invalidatePersistedFriendCaches() }
        }
    }

    /// Une autre surface (autre appareil, action rapide de la bannière push) a
    /// marqué la notification lue : on répercute dans le cache durable, pas
    /// seulement dans les vues montées.
    private func handleNotificationRead(_ event: NotificationReadEvent) {
        NotificationCoordinator.shared.decrementInAppNotificationUnread()
        applyReadToCache(.notification(id: event.notificationId))
        notificationMarkedRead.send(event.notificationId)
    }

    private func handleNotificationDeleted(_ event: NotificationDeletedEvent) {
        applyRevocationLocally(event.notificationId)
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
            logger.error("notification:read-bulk ignoré — portée non traduisible (kind: \(event.scope.kind))")
            return
        }
        applyReadToCache(scope)
        republishRead(scope)
    }

    /// Republication vers les vues MONTÉES : le patch cache ci-dessus est
    /// durable mais muet, et `NotificationListView` sert son tableau depuis sa
    /// propre copie mémoire. On réutilise les subjects par lesquels le geste
    /// LOCAL équivalent passe déjà — aucun canal neuf, donc aucun abonné à
    /// câbler.
    ///
    /// `.all` n'a AUCUN canal partiel : `NotificationReadScope.all` ne
    /// correspond à aucun subject existant, et en créer un exigerait son
    /// abonné dans `MeeshyUI/Notifications/NotificationListView.swift` (hors
    /// de ce lot). Conséquence assumée : une cloche DÉJÀ montée n'est pas
    /// repeinte sur ce chemin — contrairement au geste LOCAL, où
    /// `NotificationListView.markAllRead()` patche lui-même son tableau ;
    /// seul le cache est patché, la liste se recale à sa prochaine lecture.
    /// Ne PAS fabriquer une portée de repli pour emprunter un autre canal —
    /// ce serait marquer lues des lignes hors portée.
    private func republishRead(_ scope: NotificationReadScope) {
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
            break
        }
    }

    /// Jumeau côté PURGE. Cas plus fort que le précédent : `notification:counts`
    /// est MUET sur une purge des lues (`unread` est inchangé par
    /// construction), donc sans ce prédicat rien n'annoncerait la purge à cet
    /// appareil — les lignes purgées ressusciteraient à la prochaine lecture du
    /// cache.
    ///
    /// Les ids sont relevés AVANT l'écriture pour republier ligne à ligne par
    /// `notificationWasDeleted`, le canal que la liste montée écoute déjà :
    /// patcher le seul cache laisserait les lignes purgées à l'écran jusqu'au
    /// prochain chargement.
    ///
    /// Interne (pas `private`) : point d'entrée des tests.
    func handleNotificationDeletedBulk(_ event: NotificationDeletedBulkEvent) {
        guard NotificationBulkScopeMapping.purgesReadRows(event.scope) else {
            logger.error("notification:deleted-bulk ignoré — portée inconnue (kind: \(event.scope.kind))")
            return
        }
        Task { [weak self] in
            let cached = await CacheCoordinator.shared.notifications.loadIgnoringExpiry(for: "all")
            let purgedIds = (cached?.items ?? []).filter { $0.isRead }.map(\.id)
            guard !purgedIds.isEmpty else { return }
            await CacheCoordinator.shared.notifications.update(for: "all") { items in
                NotificationBulkScopeMapping.removingRead(items)
            }
            purgedIds.forEach { self?.notificationWasDeleted.send($0) }
        }
    }

    // MARK: - Toast

    private func showToast(_ event: SocketNotificationEvent) {
        if UserPreferencesManager.shared.notification.vibrationEnabled {
            hapticPlayer?()
        }
        toastDismissTask?.cancel()
        currentToast = event

        toastDismissTask = Task {
            try? await Task.sleep(for: .nanoseconds(Self.toastDuration))
            guard !Task.isCancelled else { return }
            currentToast = nil
        }
    }
}
