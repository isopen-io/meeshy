import Foundation

/// **La capture suit la température de l'appareil** (#9349).
extension ComposerCaptureSession {

    func watchThermalState() {
        thermal.onStateChange = { [weak self] state in self?.applyThermal(state) }
        thermal.startMonitoring()
        applyThermal(thermal.currentState)
    }

    func stopWatchingThermalState() {
        thermal.onStateChange = nil
        thermal.stopMonitoring()
    }
}
