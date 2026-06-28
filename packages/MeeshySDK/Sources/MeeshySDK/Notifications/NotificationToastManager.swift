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
    public static let shared = NotificationToastManager()

    /// Mirrors `NotificationCoordinator.inAppNotificationUnread`. Kept as a
    /// `@Published` convenience so legacy SwiftUI views that observe
    /// `NotificationToastManager.shared` continue to refresh without changes.
    @Published public private(set) var unreadCount: Int = 0

    @Published public private(set) var currentToast: SocketNotificationEvent?
    @Published public private(set) var activeConversationId: String?
    @Published public var activePostId: String?

    public let newNotificationReceived = PassthroughSubject<SocketNotificationEvent, Never>()
    public let notificationMarkedRead = PassthroughSubject<String, Never>()
    public let notificationWasDeleted = PassthroughSubject<String, Never>()

    /// Émis quand toutes les notifications d'une conversation viennent d'être
    /// marquées lues (ouverture de la conversation). Permet à la liste in-app
    /// de mettre à jour ses lignes immédiatement, avant le refresh serveur.
    public let conversationNotificationsRead = PassthroughSubject<String, Never>()

    /// Optional hook the app target uses to inject the current iOS Focus
    /// filter snapshot. The SDK can't observe `SetFocusFilterIntent` directly
    /// (it lives in the app target), so we ask for a pull closure instead.
    public var focusFilterProvider: (@MainActor () -> FocusFilterSnapshot)?

    /// Présentation Local-First (nom renommé + emoji favori) d'une conversation
    /// pour les toasts in-app. Le SDK ne peut pas lire le snapshot local des
    /// conversations de l'app, donc la cible app injecte une closure de pull —
    /// même pattern que `focusFilterProvider`. Retourne `nil` → on retombe sur
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
        markConversationNotificationsRead(conversationId)
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
        } catch {
            logger.error("Failed to mark all as read: \(error.localizedDescription)")
        }
    }

    public func reset() {
        dismissToast()
        activeConversationId = nil
        conversationReadTasks.values.forEach { $0.cancel() }
        conversationReadTasks = [:]
        lastConversationReadAt = [:]
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

        // `notification:counts` is handled by NotificationCoordinator directly —
        // we used to duplicate the subscription here, but that race was the
        // source of the drift between the bell and the badge.
    }

    // MARK: - Event Handlers

    private func handleNewNotification(_ event: SocketNotificationEvent) {
        // Muting logic: suppress the in-app toast if the user is already
        // viewing the relevant content. Le contenu étant consommé en direct,
        // la notification ne doit pas rester non lue : on la marque lue côté
        // serveur (qui ré-émet `notification:counts`). On NE l'incrémente pas
        // localement (on sort avant `incrementInAppNotificationUnread`).
        if let convId = event.conversationId, convId == activeConversationId {
            let notificationId = event.id
            Task {
                try? await NotificationService.shared.markAsRead(notificationId: notificationId)
            }
            notificationMarkedRead.send(notificationId)
            return
        }

        if let postId = event.postId, postId == activePostId {
            return
        }

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
            try? await Task.sleep(nanoseconds: 2_000_000_000) // 2 seconds
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

        let prefs = UserPreferencesManager.shared.notification
        let focus = focusFilterProvider?() ?? .permissive
        let isDirect = event.isDirect
        if prefs.allowsNotification(
            type: event.notificationType,
            isDirectConversation: isDirect,
            focus: focus
        ) {
            showToast(event)
        }
    }

    /// Durably append the freshly received notification to the `notifications`
    /// cache so it survives an app restart / offline reopen. Strict no-op when the
    /// list cache was never populated (see `prependToExisting`): fabricating a
    /// single-item `.fresh` cache would suppress the next authoritative REST
    /// refresh. De-duplicated by id, so an APN + socket double-delivery (already
    /// guarded above) or a later REST refresh never doubles the row.
    private func persistToCache(_ event: SocketNotificationEvent) {
        // Built inline (not a static let) to stay clear of Swift 6 shared-mutable
        // -state diagnostics on the non-Sendable formatter; notifications are
        // infrequent so the allocation is negligible.
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let apiNotification = event.toAPINotification(createdAt: formatter.string(from: Date()))
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

    private func handleNotificationRead(_ event: NotificationReadEvent) {
        NotificationCoordinator.shared.decrementInAppNotificationUnread()
        notificationMarkedRead.send(event.notificationId)
    }

    private func handleNotificationDeleted(_ event: NotificationDeletedEvent) {
        notificationWasDeleted.send(event.notificationId)
    }

    // MARK: - Toast

    private func showToast(_ event: SocketNotificationEvent) {
        toastDismissTask?.cancel()
        currentToast = event

        toastDismissTask = Task {
            try? await Task.sleep(nanoseconds: Self.toastDuration)
            guard !Task.isCancelled else { return }
            currentToast = nil
        }
    }
}
