import Foundation
import os

protocol ThermalStateMonitorDelegate: AnyObject {
    func thermalStateDidChange(to state: ProcessInfo.ThermalState)
}

final class ThermalStateMonitor {
    weak var delegate: ThermalStateMonitorDelegate?

    private(set) var currentState: ProcessInfo.ThermalState = .nominal

    /// Token de l'observateur bloc (l'API sélecteur ne permet pas de cibler la
    /// queue de livraison ni de hopper sur le main actor).
    private var thermalObserver: NSObjectProtocol?

    func startMonitoring() {
        currentState = ProcessInfo.processInfo.thermalState
        // ⚠️ Crash SIGTRAP : le système poste `thermalStateDidChangeNotification`
        // sur une queue de FOND (com.apple.root.user-interactive-qos). Cette classe
        // est @MainActor (target app, SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor) et
        // `thermalStateChanged()` mute `currentState`, lu par des computed @MainActor.
        // Un observateur sélecteur @MainActor invoqué sur ce thread de fond fait
        // échouer l'assertion d'isolation Swift 6 → l'app crashait après qu'un appel
        // long ait fait chauffer l'appareil (~5 min). On hoppe explicitement sur le
        // main actor (`MainActor.assumeIsolated` indispo en iOS 16 → `Task`).
        thermalObserver = NotificationCenter.default.addObserver(
            forName: ProcessInfo.thermalStateDidChangeNotification,
            object: nil,
            queue: nil
        ) { [weak self] _ in
            Task { @MainActor in self?.thermalStateChanged() }
        }
    }

    func stopMonitoring() {
        if let thermalObserver {
            NotificationCenter.default.removeObserver(thermalObserver)
            self.thermalObserver = nil
        }
    }

    private func thermalStateChanged() {
        let newState = ProcessInfo.processInfo.thermalState
        guard newState != currentState else { return }
        currentState = newState
        Logger.calls.info("Thermal state changed to: \(String(describing: newState))")
        delegate?.thermalStateDidChange(to: newState)
    }

    var recommendedMaxFps: Int {
        switch currentState {
        case .nominal: return 30
        case .fair: return 24
        case .serious: return 15
        case .critical: return 0
        @unknown default: return 15
        }
    }

    var recommendedMaxResolution: (width: Int, height: Int) {
        switch currentState {
        case .nominal: return (1280, 720)
        case .fair: return (960, 540)
        case .serious: return (640, 360)
        case .critical: return (0, 0)
        @unknown default: return (640, 360)
        }
    }

    var shouldDisableVideo: Bool {
        currentState == .critical
    }
}

// MARK: - Logger Extension

private extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
