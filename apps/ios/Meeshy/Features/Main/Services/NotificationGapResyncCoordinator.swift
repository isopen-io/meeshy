import Foundation
import Combine
import MeeshySDK

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
    static let shared = NotificationGapResyncCoordinator()

    private let debounce: TimeInterval
    private let resync: @Sendable () async -> Void
    private let gapPublisher: AnyPublisher<Int64, Never>
    private var cancellables = Set<AnyCancellable>()
    private var debounceTask: Task<Void, Never>?

    init(
        gapPublisher: AnyPublisher<Int64, Never> = SyncSeqTracker.shared.gapDetected.publisher,
        debounce: TimeInterval = 0.3,
        resync: @escaping @Sendable () async -> Void = NotificationGapResyncCoordinator.defaultResync
    ) {
        self.gapPublisher = gapPublisher
        self.debounce = debounce
        self.resync = resync
    }

    /// Câblé une fois au boot (`MeeshyApp`). Idempotent : re-`start()` ne
    /// double pas l'abonnement (l'ancien est remplacé).
    func start() {
        cancellables.removeAll()
        gapPublisher
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

    /// Resync par défaut : refetch `/notifications` → remplace le cache `"all"`.
    /// Best-effort (`try?`) — un échec réseau laisse le cache tel quel, le
    /// prochain gap ou le reconnect réessaiera.
    static let defaultResync: @Sendable () async -> Void = {
        guard let response = try? await NotificationService.shared.list(limit: 30) else { return }
        try? await CacheCoordinator.shared.notifications.save(response.data, for: "all")
    }
}
