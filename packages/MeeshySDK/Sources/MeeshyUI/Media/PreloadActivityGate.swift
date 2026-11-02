import Foundation
import UIKit
import MeeshySDK

/// **Quand un préchargement a le droit de tourner (#11284) — loi pure.**
///
/// Seule une app ACTIVE précharge. Inactive, l'écran est couvert (centre de
/// contrôle, centre de notifications, sélecteur d'apps, appel entrant) ; en
/// arrière-plan, personne ne regarde. `willEnterForeground` n'est pas un
/// retour : l'app ne l'est qu'à `didBecomeActive`.
public nonisolated enum PreloadActivityLaw {
    public nonisolated enum Signal: Sendable {
        case didBecomeActive
        case willResignActive
        case didEnterBackground
        case willEnterForeground
    }

    public static func isActive(after signal: Signal) -> Bool {
        signal == .didBecomeActive
    }

    public static func isActive(_ state: UIApplication.State) -> Bool {
        state == .active
    }
}

/// **Le portier des préchargements : il arrête une passe quand l'app quitte le
/// premier plan, et la relance au retour (#11284).**
///
/// Une passe est une fonction opaque — la fenêtre des réels, les voisines d'une
/// story. Le portier ne sait pas ce qu'elle prépare : il la lance si l'app est
/// active, l'annule dès qu'elle ne l'est plus, et la rejoue DEPUIS LE DÉBUT au
/// retour (ce qui est déjà en cache y est sauté par la passe elle-même). Le
/// téléchargement déjà parti s'achève dans son registre ; ce qui n'a pas
/// commencé ne commence plus.
@MainActor
public final class PreloadActivityGate {
    /// Le portier de l'app, branché sur les notifications de `UIApplication`.
    public static let shared: PreloadActivityGate = {
        let gate = PreloadActivityGate(isActive: PreloadActivityLaw.isActive(UIApplication.shared.applicationState))
        gate.observeApplication()
        return gate
    }()

    public private(set) var isActive: Bool
    private var passes: [UUID: Task<Void, Never>] = [:]
    private let activation = CancellableWaiters<Bool>()

    public init(isActive: Bool) {
        self.isActive = isActive
    }

    nonisolated deinit {}

    /// Joue `pass` tant que l'app est active. Rend quand une passe s'achève sans
    /// avoir été interrompue, ou quand l'appelant est annulé (sa passe l'est
    /// avec lui).
    public func runWhileActive(_ pass: @escaping @MainActor @Sendable () async -> Void) async {
        while !Task.isCancelled {
            guard await waitUntilActive() else { return }
            guard isActive else { continue }
            let id = UUID()
            let task = Task { @MainActor in await pass() }
            passes[id] = task
            await withTaskCancellationHandler {
                await task.value
            } onCancel: {
                task.cancel()
            }
            guard passes.removeValue(forKey: id) == nil else { return }
        }
    }

    /// L'entrée du cycle de vie : un signal d'`UIApplication`, lu par la loi.
    public func receive(_ signal: PreloadActivityLaw.Signal) {
        setActive(PreloadActivityLaw.isActive(after: signal))
    }

    /// Quitter le premier plan annule les passes en vol ; y revenir réveille
    /// celles qui attendent.
    public func setActive(_ active: Bool) {
        guard active != isActive else { return }
        isActive = active
        guard !active else {
            activation.resolveAll(with: true)
            return
        }
        let interrupted = passes
        passes = [:]
        interrupted.values.forEach { $0.cancel() }
    }

    /// `false` seulement quand l'appelant est annulé pendant l'attente.
    private func waitUntilActive() async -> Bool {
        guard !isActive else { return true }
        let ticket = activation.enroll()
        return await activation.suspendCancellable(ticket, cancelledValue: false)
    }

    private func observeApplication() {
        let signals: [(Notification.Name, PreloadActivityLaw.Signal)] = [
            (UIApplication.didBecomeActiveNotification, .didBecomeActive),
            (UIApplication.willResignActiveNotification, .willResignActive),
            (UIApplication.didEnterBackgroundNotification, .didEnterBackground),
        ]
        for (name, signal) in signals {
            _ = NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.receive(signal) }
            }
        }
    }
}
