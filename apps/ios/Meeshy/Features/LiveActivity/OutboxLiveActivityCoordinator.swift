import Foundation
import Combine
import MeeshySDK

/// **Exécute `OutboxActivityLaw`** : ouvre, met à jour et ferme la Live
/// Activity d'envoi au fil de la file (#9680).
///
/// iOS 16.1+ et activités autorisées par l'utilisateur ; ailleurs, rien ne
/// s'ouvre et la pastille reste seule à parler. ActivityKit est l'affaire de
/// `LiveActivityHost` (#11524) : rien ici ne lui parle sur le fil principal,
/// pas même au démarrage quand la file a des envois en attente.
@MainActor
final class OutboxLiveActivityCoordinator {
    nonisolated deinit {}

    static let shared = OutboxLiveActivityCoordinator()

    private var cancellable: AnyCancellable?
    private var running: OutboxActivityLaw.Running?
    private var host: (any LiveActivityHostProviding<OutboxActivitySnapshot>)?

    func start(
        queue: OfflineQueuePillProviding = OfflineQueue.shared,
        network: NetworkMonitorProviding = NetworkMonitor.shared
    ) {
        #if canImport(ActivityKit)
        guard cancellable == nil else { return }
        #if DEBUG
        SyncPillDebugFeed.arm()
        #endif
        guard #available(iOS 16.1, *) else { return }
        let host = LiveActivityHost<OutboxActivityAttributes, OutboxActivitySnapshot> { OutboxActivityAttributes() }
        self.host = host
        host.endOrphans()
        cancellable = Publishers.CombineLatest(
            SyncPillDebugFeed.items(queue.pendingUIItemsPublisher),
            SyncPillDebugFeed.isOffline(network.isOfflinePublisher)
        )
            .receive(on: DispatchQueue.main)
            .sink { [weak self] items, isOffline in
                self?.apply(items: items, isOffline: isOffline)
            }
        #endif
    }

    #if canImport(ActivityKit)
    private static var wording: OutboxActivityLaw.Wording {
        OutboxActivityLaw.Wording(
            label: { SyncPillLabels.operationLabel(for: $0) },
            sent: String(localized: "bubble.delivery.sent", defaultValue: "Envoyé", bundle: .main),
            failed: String(localized: "bubble.delivery.failed", defaultValue: "Échec de l'envoi", bundle: .main)
        )
    }

    private func apply(items: [OutboxUIItem], isOffline: Bool) {
        guard #available(iOS 16.1, *) else { return }
        let step = OutboxActivityLaw.step(running: running, items: items, isOffline: isOffline, wording: Self.wording)
        running = step.running
        perform(step.action)
    }

    private func perform(_ action: OutboxActivityLaw.Action) {
        guard let host else { return }
        switch action {
        case .none:
            return
        case .start(let snapshot):
            host.start(snapshot)
        case .update(let snapshot):
            host.update(snapshot)
        case .end(let snapshot):
            host.end(snapshot, dismissAfter: OutboxActivityLaw.dismissalDelay(for: snapshot.phase))
        }
    }
    #endif
}
