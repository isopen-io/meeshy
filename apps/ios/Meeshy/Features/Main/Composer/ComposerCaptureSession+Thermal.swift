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

    /// Avec effet, la vue Metal seule ; sans, la couche système seule (#9349).
    var paintsWithMetal: Bool {
        ComposerCaptureSurfaceRule.paintsWithMetal(look: look, budget: thermalBudget, fixture: false)
    }

    /// La bande ouverte peint des miniatures VIVANTES : elle aussi veut les trames (#9351).
    var stripNeedsFeed: Bool { false }

    /// Le guet des trames ne s'arme que si quelqu'un les peint.
    func refreshFeed() {
        camera.liveFeed.isActive = paintsWithMetal || stripNeedsFeed
    }
}
