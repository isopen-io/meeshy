import Foundation
import Combine
import MeeshySDK
import os

/// SyncEngine unifié (spec §7.5, sous-tâche A5.3) — orchestration UX APP-SIDE
/// (SDK purity : le SDK expose le hook `SyncSeqTracker.gapDetected` ; la
/// décision « refresh les notifications sur trou de séquence » vit ici).
///
/// S'abonne à `gapDetected` : quand le client a manqué des events
/// (`_seq > lastSeq + 1`), il re-tire la liste des notifications depuis le
/// serveur et remplace le cache `"all"`. Le refresh est IDEMPOTENT — `save`
/// écrit la vérité serveur (dédup par id inhérente), donc aucun doublon vs la
/// persistance temps réel (`NotificationToastManager.persistToCache` +
/// `prependToExisting`, elle aussi dédupliquée par id).
///
/// Les rafales de gaps sont coalescées par un débounce (une seule resync).
@MainActor
final class NotificationGapResyncCoordinator {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    static let shared = NotificationGapResyncCoordinator()

    private let debounce: TimeInterval
    private let resync: @Sendable () async -> Void
    private let gapPublisher: AnyPublisher<Int64, Never>
    private let reconnectPublisher: AnyPublisher<Void, Never>
    private let isAuthenticated: @MainActor () -> Bool
    private var cancellables = Set<AnyCancellable>()
    private var debounceTask: Task<Void, Never>?

    init(
        gapPublisher: AnyPublisher<Int64, Never> = SyncSeqTracker.shared.gapDetected.publisher,
        reconnectPublisher: AnyPublisher<Void, Never> = MessageSocketManager.shared.didReconnect.eraseToAnyPublisher(),
        debounce: TimeInterval = 0.3,
        isAuthenticated: @escaping @MainActor () -> Bool = { AuthManager.shared.isAuthenticated },
        resync: @escaping @Sendable () async -> Void = NotificationGapResyncCoordinator.defaultResync
    ) {
        self.gapPublisher = gapPublisher
        self.reconnectPublisher = reconnectPublisher
        self.debounce = debounce
        self.isAuthenticated = isAuthenticated
        self.resync = resync
    }

    /// **Retour au PREMIER PLAN** (#7000).
    ///
    /// `MeeshyApp` y appelait `removeAllDeliveredNotifications()` — l'effacement
    /// de TOUTES les bannières livrées, celles d'autres conversations
    /// comprises, y compris sans session ouverte — et ne rafraîchissait rien.
    /// Le centre de notifications était vidé pendant que la cloche et le badge
    /// gardaient l'état d'avant la suspension : le seul endroit où l'utilisateur
    /// pouvait encore lire ce qu'il avait manqué était le seul qu'on effaçait.
    ///
    /// Le geste juste est l'inverse : RELIRE. La suspension est exactement une
    /// fenêtre aveugle — la même que le reconnect couvre déjà — donc le même
    /// chemin, débouncé et idempotent. Les bannières, elles, ne partent plus
    /// qu'à la consommation de ce qu'elles annoncent (#6999).
    ///
    /// Sans session, rien : une resync non authentifiée est un 401 et un cache
    /// qu'on n'a pas le droit de peupler.
    func refreshOnForeground() {
        guard isAuthenticated() else { return }
        scheduleResync()
    }

    /// Câblé une fois au boot (`MeeshyApp`). Idempotent : re-`start()` ne
    /// double pas l'abonnement (l'ancien est remplacé).
    func start() {
        cancellables.removeAll()
        // Trou de séquence détecté pendant la session (A5.3).
        gapPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.scheduleResync() }
            .store(in: &cancellables)
        // A5.4 — reconnect : la coupure a créé une fenêtre aveugle (le gap
        // detection ne couvre que les events REÇUS) → refresh inconditionnel,
        // miroir de `syncMissedMessages` pour les messages. `didReconnect` ne
        // fire QUE sur un vrai reconnect (hadPreviousConnection), pas au cold
        // boot. La resync étant débouncée+idempotente, un double-déclenchement
        // gap+reconnect coalesce sans doublon.
        reconnectPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.scheduleResync() }
            .store(in: &cancellables)
    }

    private func scheduleResync() {
        debounceTask?.cancel()
        let work = resync
        let delay = debounce
        debounceTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard !Task.isCancelled, self != nil else { return }
            await work()
        }
    }

    /// Resync par défaut : refetch `/notifications` → remplace le cache `"all"`
    /// → **recale le COMPTEUR** (#7000).
    ///
    /// Le troisième geste manquait. La resync réécrivait la LISTE et laissait
    /// la pastille sur sa valeur d'avant la coupure : le gateway n'émet
    /// `notification:counts` qu'à la MUTATION, et une fenêtre aveugle ne
    /// mute rien — elle révèle. Deux surfaces du même non-lu, l'une fraîche et
    /// l'autre périmée, jusqu'à la prochaine notification reçue.
    ///
    /// Best-effort — un échec laisse le cache tel quel, le prochain gap ou le
    /// reconnect réessaiera ; l'échec est journalisé pour rester diagnosticable.
    /// Le compteur est demandé même quand l'écriture cache échoue : les deux
    /// lectures sont indépendantes, et une pastille juste vaut mieux qu'aucune.
    static let defaultResync: @Sendable () async -> Void = {
        let response: NotificationListResponse
        do {
            response = try await NotificationService.shared.list(limit: 30)
        } catch {
            Logger.notifResync.error("Notification gap resync fetch failed, cache left stale: \(error.localizedDescription, privacy: .public)")
            return
        }
        do {
            try await CacheCoordinator.shared.notifications.save(response.data, for: "all")
        } catch {
            Logger.notifResync.error("Notification cache not replaced after resync: \(error.localizedDescription, privacy: .public)")
        }
        await NotificationGapResyncCoordinator.refreshUnreadCount()
    }

    /// Le saut d'acteur, nommé : `defaultResync` est une closure `@Sendable`
    /// non isolée, et le compteur appartient au `@MainActor`.
    @MainActor
    private static func refreshUnreadCount() async {
        await NotificationToastManager.shared.refreshUnreadCount()
    }
}

// MARK: - Logger Extension

private extension Logger {
    nonisolated static let notifResync = Logger(subsystem: "me.meeshy.app", category: "notif-resync")
}
