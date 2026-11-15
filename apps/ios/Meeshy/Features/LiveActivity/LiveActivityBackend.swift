import Foundation
#if canImport(ActivityKit)
@preconcurrency import ActivityKit
#endif

/// Une Live Activity OUVERTE, telle que l'hôte la garde (#11524).
///
/// L'hôte tient ce handle depuis son ouverture jusqu'à sa fermeture : il ne
/// redemande jamais au système « laquelle est la mienne ? », question qui se
/// paie par un XPC synchrone.
nonisolated protocol LiveActivityHandle<State>: Sendable {
    associatedtype State: Sendable
    var id: String { get }
    @concurrent func update(_ state: State) async
    @concurrent func end(_ state: State?, dismissAfter delay: TimeInterval) async
    /// Rend la main quand l'activité est fermée — par l'hôte, par
    /// l'utilisateur ou par le système.
    @concurrent func waitUntilClosed() async
}

/// **La seule frontière ActivityKit de l'app** (#11524).
///
/// Ses méthodes synchrones parlent au démon d'ActivityKit par XPC : l'hôte ne
/// les appelle que depuis une fonction `@concurrent`, jamais depuis le fil
/// principal. Une garde de source (`LiveActivityHostTests`) interdit à tout
/// autre fichier de nommer l'API d'ActivityKit.
nonisolated protocol LiveActivityBackend<Attributes, State>: Sendable {
    associatedtype Attributes: Sendable
    associatedtype State: Sendable
    func areEnabled() -> Bool
    func request(_ attributes: Attributes, state: State) throws -> any LiveActivityHandle<State>
    func openActivities(except keep: String?) -> [any LiveActivityHandle<State>]
}

#if canImport(ActivityKit)
@available(iOS 16.1, *)
nonisolated struct ActivityKitBackend<Attributes: ActivityAttributes & Sendable>: LiveActivityBackend
where Attributes.ContentState: Sendable {
    typealias State = Attributes.ContentState

    func areEnabled() -> Bool {
        ActivityAuthorizationInfo().areActivitiesEnabled
    }

    func request(_ attributes: Attributes, state: State) throws -> any LiveActivityHandle<State> {
        if #available(iOS 16.2, *) {
            return ActivityKitHandle(activity: try Activity.request(
                attributes: attributes,
                content: ActivityContent(state: state, staleDate: nil),
                pushType: nil
            ))
        }
        return ActivityKitHandle(activity: try Activity.request(attributes: attributes, contentState: state, pushType: nil))
    }

    func openActivities(except keep: String?) -> [any LiveActivityHandle<State>] {
        Activity<Attributes>.activities
            .filter { $0.id != keep }
            .map { ActivityKitHandle(activity: $0) }
    }
}

@available(iOS 16.1, *)
nonisolated struct ActivityKitHandle<Attributes: ActivityAttributes & Sendable>: LiveActivityHandle
where Attributes.ContentState: Sendable {
    typealias State = Attributes.ContentState

    let activity: Activity<Attributes>

    var id: String { activity.id }

    @concurrent func update(_ state: State) async {
        if #available(iOS 16.2, *) {
            await activity.update(ActivityContent(state: state, staleDate: nil))
        } else {
            await activity.update(using: state)
        }
    }

    @concurrent func end(_ state: State?, dismissAfter delay: TimeInterval) async {
        let policy: ActivityUIDismissalPolicy = delay <= 0
            ? .immediate
            : .after(Date().addingTimeInterval(delay))
        if #available(iOS 16.2, *) {
            await activity.end(state.map { ActivityContent(state: $0, staleDate: nil) }, dismissalPolicy: policy)
        } else {
            await activity.end(using: state, dismissalPolicy: policy)
        }
    }

    @concurrent func waitUntilClosed() async {
        for await state in activity.activityStateUpdates where state == .ended || state == .dismissed {
            return
        }
    }
}
#endif

#if canImport(ActivityKit)
@available(iOS 16.1, *)
extension LiveActivityHost where Attributes: ActivityAttributes, Attributes.ContentState == State {
    /// L'hôte d'une activité de l'îlot, branché sur ActivityKit.
    convenience init(activityKit attributes: @escaping () -> Attributes) {
        self.init(backend: ActivityKitBackend<Attributes>(), attributes: attributes)
    }
}
#endif
