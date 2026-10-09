import Foundation
import os
#if canImport(ActivityKit)
@preconcurrency import ActivityKit
#endif

/// Ce qu'un coordinateur de Live Activity demande à ActivityKit : ouvrir,
/// mettre à jour, fermer — rien d'autre. Les LOIS décident ; l'hôte exécute.
@MainActor
protocol LiveActivityHostProviding<State>: AnyObject {
    associatedtype State
    var isRunning: Bool { get }
    func endOrphans()
    func start(_ state: State)
    func update(_ state: State)
    func end(_ state: State, dismissAfter delay: TimeInterval)
}

#if canImport(ActivityKit)
/// **L'exécution ActivityKit d'une Live Activity** (#9782, #9783, #9784),
/// commune aux trois activités de l'îlot.
///
/// iOS 16.1+ et activités autorisées ; ailleurs, rien ne s'ouvre. Les appels
/// sont CHAÎNÉS (`pending`) : une mise à jour ne peut pas arriver après la
/// fermeture qui la suit. Une ouverture refusée (app pas au premier plan) est
/// retentée par le coordinateur au retour au premier plan — l'hôte ne garde
/// aucune activité qu'il n'a pas obtenue.
@available(iOS 16.1, *)
@MainActor
final class LiveActivityHost<Attributes: ActivityAttributes & Sendable>: LiveActivityHostProviding
where Attributes.ContentState: Sendable {
    nonisolated deinit {}

    private static var logger: Logger { Logger(subsystem: "me.meeshy.app", category: "live-activity") }

    private let attributes: () -> Attributes
    private var activityID: String?
    private var pending: Task<Void, Never>?

    init(attributes: @escaping () -> Attributes) {
        self.attributes = attributes
    }

    var isRunning: Bool { currentActivity != nil }

    /// Une activité laissée par une session précédente (app tuée en plein
    /// appel, en pleine lecture) ne dit plus rien de vrai : elle part sans
    /// s'afficher.
    func endOrphans() {
        let orphans = Activity<Attributes>.activities.filter { $0.id != activityID }
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

    func start(_ state: Attributes.ContentState) {
        guard currentActivity == nil else { return update(state) }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        do {
            let activity: Activity<Attributes>
            if #available(iOS 16.2, *) {
                activity = try Activity.request(
                    attributes: attributes(),
                    content: ActivityContent(state: state, staleDate: nil),
                    pushType: nil
                )
            } else {
                activity = try Activity.request(attributes: attributes(), contentState: state, pushType: nil)
            }
            activityID = activity.id
        } catch {
            Self.logger.info("Live Activity non ouverte : \(error.localizedDescription, privacy: .public)")
        }
    }

    func update(_ state: Attributes.ContentState) {
        guard let activity = currentActivity else { return }
        chain { @MainActor in
            if #available(iOS 16.2, *) {
                await activity.update(ActivityContent(state: state, staleDate: nil))
            } else {
                await activity.update(using: state)
            }
        }
    }

    func end(_ state: Attributes.ContentState, dismissAfter delay: TimeInterval) {
        guard let activity = currentActivity else { return }
        activityID = nil
        let policy: ActivityUIDismissalPolicy = delay <= 0
            ? .immediate
            : .after(Date().addingTimeInterval(delay))
        chain { @MainActor in
            if #available(iOS 16.2, *) {
                await activity.end(ActivityContent(state: state, staleDate: nil), dismissalPolicy: policy)
            } else {
                await activity.end(using: state, dismissalPolicy: policy)
            }
        }
    }

    private var currentActivity: Activity<Attributes>? {
        guard let activityID else { return nil }
        return Activity<Attributes>.activities.first { $0.id == activityID }
    }

    private func chain(_ work: @escaping @MainActor () async -> Void) {
        let previous = pending
        pending = Task { @MainActor in
            await previous?.value
            await work()
        }
    }
}
#endif
