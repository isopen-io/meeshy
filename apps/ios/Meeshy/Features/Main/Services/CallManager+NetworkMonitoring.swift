import Foundation
import AVFoundation
@preconcurrency import CallKit
import Combine
import Network
import UIKit
import MeeshySDK
import MeeshyUI
@preconcurrency import WebRTC
import os

/// La surveillance du réseau pendant un appel : un changement de chemin
/// (Wi-Fi ↔ cellulaire, perte, retour) déclenche la reconnexion.

extension CallManager {

    // MARK: - Network Monitoring

    func startNetworkMonitoring() {
        networkMonitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor [weak self] in
                guard let self else { return }
                let wasUnsatisfied = self.lastNetworkPath != .satisfied
                let isNowSatisfied = path.status == .satisfied

                // Detect active interface type (WiFi > cellular > other). Used to
                // trigger ICE restart on WiFi↔cellular handoff — the path remains
                // "satisfied" across the transition so status alone is insufficient.
                let currentInterfaceType: NWInterface.InterfaceType?
                if path.usesInterfaceType(.wifi) { currentInterfaceType = .wifi }
                else if path.usesInterfaceType(.cellular) { currentInterfaceType = .cellular }
                else if path.usesInterfaceType(.wiredEthernet) { currentInterfaceType = .wiredEthernet }
                else { currentInterfaceType = path.availableInterfaces.first?.type }

                let previousInterfaceType = self.lastNetworkInterfaceType
                // `previousInterfaceType == nil` means first observation — no actual
                // interface change happened, so exclude it from the ICE-restart trigger.
                let interfaceChanged = previousInterfaceType != nil && currentInterfaceType != previousInterfaceType
                self.lastNetworkPath = path.status
                self.lastNetworkInterfaceType = currentInterfaceType

                // FSM §3.2 — mirrors CallReliabilityPolicy.reconnectingAllowed(from:):
                // .connecting (answer received, ICE negotiating) is reconnect-eligible
                // just like .connected/.reconnecting. Excluding it here left a WiFi↔
                // cellular handoff mid-answer unhandled until the connectingRestartSeconds
                // watchdog escalated, instead of triggering an immediate reconnect.
                let isInActiveCall: Bool
                switch self.callState {
                case .connected, .reconnecting, .connecting: isInActiveCall = true
                default: isInActiveCall = false
                }
                if interfaceChanged && isInActiveCall {
                    self.analyticsNetworkTransitions += 1
                }
                guard isInActiveCall else { return }

                if path.status != .satisfied {
                    Logger.calls.warning("Network lost during call — starting reconnection")
                    self.attemptReconnection()
                } else if wasUnsatisfied && isNowSatisfied {
                    Logger.calls.info("Network recovered during call — performing ICE restart")
                    self.attemptReconnection()
                } else if interfaceChanged {
                    // WiFi ↔ cellular handoff: local IP addresses change, existing ICE
                    // candidates go stale. Trigger ICE restart so WebRTC negotiates new
                    // candidates on the active interface and the call stays alive.
                    Logger.calls.info("Network interface changed to \(String(describing: currentInterfaceType)) — ICE restart for handoff")
                    self.attemptReconnection()
                }
            }
        }
        networkMonitor.start(queue: networkQueue)
    }

}

private extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
