import Foundation
import Network
import MeeshySDK
import os

/// Ce qu'un changement de chemin réseau commande pendant un appel : la règle
/// pure, sortie du rappel de `NWPathMonitor` pour se lire sans réseau (#11522).
struct CallNetworkPathChange: Equatable {
    enum Action: Equatable {
        case none
        case lost
        case recovered
        case handoff
    }

    let countsTransition: Bool
    let action: Action

    static func evaluate(
        previousStatus: NWPath.Status,
        previousInterface: NWInterface.InterfaceType?,
        status: NWPath.Status,
        interface: NWInterface.InterfaceType?,
        callState: CallState
    ) -> CallNetworkPathChange {
        let wasUnsatisfied = previousStatus != .satisfied
        let isNowSatisfied = status == .satisfied
        // `previousInterface == nil` means first observation — no actual
        // interface change happened, so exclude it from the ICE-restart trigger.
        let interfaceChanged = previousInterface != nil && interface != previousInterface

        // FSM §3.2 — mirrors CallReliabilityPolicy.reconnectingAllowed(from:):
        // .connecting (answer received, ICE negotiating) is reconnect-eligible
        // just like .connected/.reconnecting. Excluding it here left a WiFi↔
        // cellular handoff mid-answer unhandled until the connectingRestartSeconds
        // watchdog escalated, instead of triggering an immediate reconnect.
        let isInActiveCall: Bool
        switch callState {
        case .connected, .reconnecting, .connecting: isInActiveCall = true
        default: isInActiveCall = false
        }
        guard isInActiveCall else { return CallNetworkPathChange(countsTransition: false, action: .none) }
        let countsTransition = interfaceChanged
        if status != .satisfied { return CallNetworkPathChange(countsTransition: countsTransition, action: .lost) }
        if wasUnsatisfied && isNowSatisfied { return CallNetworkPathChange(countsTransition: countsTransition, action: .recovered) }
        if interfaceChanged { return CallNetworkPathChange(countsTransition: countsTransition, action: .handoff) }
        return CallNetworkPathChange(countsTransition: countsTransition, action: .none)
    }
}

/// La surveillance du réseau pendant un appel : un changement de chemin
/// (Wi-Fi ↔ cellulaire, perte, retour) déclenche la reconnexion. Le collaborateur
/// possède le moniteur, sa file dédiée et le dernier chemin vu, et tient l'appel
/// faiblement (#11522).
@MainActor
final class CallNetworkPathObserver: CallNetworkPathObserverProviding {
    nonisolated deinit {}

    private weak var call: CallManager?
    private let networkMonitor = NWPathMonitor()
    private let networkQueue = DispatchQueue(label: "me.meeshy.callmanager.network")
    private(set) var lastNetworkPath: NWPath.Status = .satisfied
    private(set) var lastNetworkInterfaceType: NWInterface.InterfaceType?

    var lastPathStatus: NWPath.Status { lastNetworkPath }

    func start(observing call: CallManager) {
        self.call = call
        networkMonitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor [weak self] in
                self?.handle(path: path)
            }
        }
        networkMonitor.start(queue: networkQueue)
    }

    private func handle(path: NWPath) {
        guard let call else { return }
        // Detect active interface type (WiFi > cellular > other). Used to
        // trigger ICE restart on WiFi↔cellular handoff — the path remains
        // "satisfied" across the transition so status alone is insufficient.
        let currentInterfaceType: NWInterface.InterfaceType?
        if path.usesInterfaceType(.wifi) { currentInterfaceType = .wifi }
        else if path.usesInterfaceType(.cellular) { currentInterfaceType = .cellular }
        else if path.usesInterfaceType(.wiredEthernet) { currentInterfaceType = .wiredEthernet }
        else { currentInterfaceType = path.availableInterfaces.first?.type }

        let change = CallNetworkPathChange.evaluate(
            previousStatus: lastNetworkPath,
            previousInterface: lastNetworkInterfaceType,
            status: path.status,
            interface: currentInterfaceType,
            callState: call.callState
        )
        lastNetworkPath = path.status
        lastNetworkInterfaceType = currentInterfaceType

        if change.countsTransition {
            call.analytics.networkTransitions += 1
        }
        switch change.action {
        case .none:
            return
        case .lost:
            Logger.calls.warning("Network lost during call — starting reconnection")
        case .recovered:
            Logger.calls.info("Network recovered during call — performing ICE restart")
        case .handoff:
            // WiFi ↔ cellular handoff: local IP addresses change, existing ICE
            // candidates go stale. Trigger ICE restart so WebRTC negotiates new
            // candidates on the active interface and the call stays alive.
            Logger.calls.info("Network interface changed to \(String(describing: currentInterfaceType)) — ICE restart for handoff")
        }
        call.reconnector.attemptReconnection()
    }
}

/// Déclaré après le type : les gardes de l'unité lisent la PREMIÈRE
/// occurrence de chaque signature, qui doit être son corps.
@MainActor
protocol CallNetworkPathObserverProviding: AnyObject {
    var lastPathStatus: NWPath.Status { get }
    func start(observing call: CallManager)
}

private extension Logger {
    nonisolated static let calls = MeeshyLog.logger(.calls)
}
