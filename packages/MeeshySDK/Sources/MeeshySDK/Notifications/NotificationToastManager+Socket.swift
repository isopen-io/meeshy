import Foundation
import Combine
import os

private let logger = MeeshyLog.logger(.notifications, subsystem: .sdk)

extension NotificationToastManager {
    // MARK: - Coordinator Mirror

    func subscribeToCoordinator() {
        NotificationCoordinator.shared.$inAppNotificationUnread
            .receive(on: DispatchQueue.main)
            .assign(to: &$unreadCount)
    }

    // MARK: - Socket Subscriptions

    func subscribeToSocketEvents() {
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
        if let convId = event.conversationId, isConversationOpen(convId) || convId == activeConversationId {
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
            _ = await cancellableSleep(for: .seconds(2))
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
        // #7000 — ce chemin marque lu SANS avoir incrémenté : on sort avant
        // `incrementInAppNotificationUnread`. L'écho `notification:read` que
        // le gateway renvoie derrière décrémentait pourtant, retirant du
        // compteur une notification qui n'y avait jamais été ajoutée. Le
        // registre le déclare pour que l'écho soit ignoré comme le nôtre.
        selfReadLedger.register(notificationId)
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
        let createdAtStr = WireDate.string(from: Date())
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

    func handleNotificationDeleted(_ event: NotificationDeletedEvent) {
        applyRevocationLocally(event.notificationId)
    }

    /// Jumeau côté PURGE de `handleNotificationReadBulk`
    /// (`NotificationConsumption.swift`). Cas plus fort que lui : `notification:counts`
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
}
