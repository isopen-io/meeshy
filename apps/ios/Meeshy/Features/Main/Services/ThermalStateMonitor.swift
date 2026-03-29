import Foundation
import os

protocol ThermalStateMonitorDelegate: AnyObject {
    func thermalStateDidChange(to state: ProcessInfo.ThermalState)
}

final class ThermalStateMonitor {
    weak var delegate: ThermalStateMonitorDelegate?

    private(set) var currentState: ProcessInfo.ThermalState = .nominal

    func startMonitoring() {
        currentState = ProcessInfo.processInfo.thermalState
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(thermalStateChanged),
            name: ProcessInfo.thermalStateDidChangeNotification,
            object: nil
        )
    }

    func stopMonitoring() {
        NotificationCenter.default.removeObserver(self)
    }

    @objc private func thermalStateChanged() {
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
    static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
