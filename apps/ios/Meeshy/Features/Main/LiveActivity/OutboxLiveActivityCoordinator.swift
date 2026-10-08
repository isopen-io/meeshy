import Foundation
import Combine
import os
import MeeshySDK
#if canImport(ActivityKit)
@preconcurrency import ActivityKit
#endif

/// **Exécute `OutboxActivityLaw`** : ouvre, met à jour et ferme la Live
/// Activity d'envoi au fil de la file (#9680).
///
/// iOS 16.1+ et activités autorisées par l'utilisateur ; ailleurs, rien ne
/// s'ouvre et la pastille reste seule à parler. Les appels ActivityKit sont
/// chaînés (`pending`) : une mise à jour ne peut pas arriver APRÈS la
/// fermeture qui la suit.
@MainActor
final class OutboxLiveActivityCoordinator {
    nonisolated deinit {}

    static let shared = OutboxLiveActivityCoordinator()

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "live-activity")

    private var cancellable: AnyCancellable?
    private var running: OutboxActivityLaw.Running?
    private var activityID: String?
    private var pending: Task<Void, Never>?

    func start(
        queue: OfflineQueuePillProviding = OfflineQueue.shared,
        network: NetworkMonitorProviding = NetworkMonitor.shared
    ) {
        #if canImport(ActivityKit)
        guard cancellable == nil else { return }
        guard #available(iOS 16.1, *) else { return }
        endOrphans()
        cancellable = Publishers.CombineLatest(queue.pendingUIItemsPublisher, network.isOfflinePublisher)
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

    /// Une activité laissée par une session précédente (app tuée en plein
    /// envoi) ne dit plus rien de vrai : elle part sans s'afficher, et la loi
    /// en rouvre une si la file le demande.
    @available(iOS 16.1, *)
    private func endOrphans() {
        let orphans = Activity<OutboxActivityAttributes>.activities
        guard !orphans.isEmpty else { return }
        chain { @MainActor in
            for orphan in orphans {
                if #available(iOS 16.2, *) {
                    await orphan.end(nil, dismissalPolicy: .immediate)
                } else {
                    await orphan.end(using: nil, dismissalPolicy: .immediate)
                }
            }
        }
    }

    @available(iOS 16.1, *)
    private func perform(_ action: OutboxActivityLaw.Action) {
        switch action {
        case .none:
            return
        case .start(let snapshot):
            request(snapshot)
        case .update(let snapshot):
            guard let activity = currentActivity else { return }
            chain { @MainActor in
                if #available(iOS 16.2, *) {
                    await activity.update(ActivityContent(state: snapshot, staleDate: nil))
                } else {
                    await activity.update(using: snapshot)
                }
            }
        case .end(let snapshot):
            guard let activity = currentActivity else { return }
            activityID = nil
            let policy = ActivityUIDismissalPolicy.after(
                Date().addingTimeInterval(OutboxActivityLaw.dismissalDelay(for: snapshot.phase))
            )
            chain { @MainActor in
                if #available(iOS 16.2, *) {
                    await activity.end(ActivityContent(state: snapshot, staleDate: nil), dismissalPolicy: policy)
                } else {
                    await activity.end(using: snapshot, dismissalPolicy: policy)
                }
            }
        }
    }

    @available(iOS 16.1, *)
    private func request(_ snapshot: OutboxActivitySnapshot) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        do {
            let activity: Activity<OutboxActivityAttributes>
            if #available(iOS 16.2, *) {
                activity = try Activity.request(
                    attributes: OutboxActivityAttributes(),
                    content: ActivityContent(state: snapshot, staleDate: nil),
                    pushType: nil
                )
            } else {
                activity = try Activity.request(
                    attributes: OutboxActivityAttributes(),
                    contentState: snapshot,
                    pushType: nil
                )
            }
            activityID = activity.id
        } catch {
            Self.logger.info("Live Activity d'envoi non ouverte : \(error.localizedDescription, privacy: .public)")
        }
    }

    @available(iOS 16.1, *)
    private var currentActivity: Activity<OutboxActivityAttributes>? {
        guard let activityID else { return nil }
        return Activity<OutboxActivityAttributes>.activities.first { $0.id == activityID }
    }

    private func chain(_ work: @escaping @MainActor () async -> Void) {
        let previous = pending
        pending = Task { @MainActor in
            await previous?.value
            await work()
        }
    }
    #endif
}
