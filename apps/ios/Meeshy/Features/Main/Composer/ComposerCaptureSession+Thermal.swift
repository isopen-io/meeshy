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
        ComposerCaptureSurfaceRule.paintsWithMetal(look: look, budget: thermalBudget, fixture: camera.runsFixture)
    }

    /// **La bande ouverte est vivante, la miniature d'un look choisi aussi** —
    /// tant que le palier garde au moins une case (#9351). Sans filtre ni cadre
    /// et bande repliée, rien ne se peint : aucune trame n'est retenue (#9557).
    var stripNeedsFeed: Bool {
        stage != .off && thermalBudget.thumbnailCells > 0
            && ComposerLookStripRule.paintsLive(look: look, familyOpen: openFamily != nil)
    }

    /// Toucher une famille ouvre sa bande ; la retoucher la replie. Le look
    /// verrouillé (prise en cours, segments en attente) garde la bande telle
    /// quelle : la replier annulerait l'appui long qui tient la prise.
    func toggleFamily(_ family: ComposerLookFamily) {
        guard !lookIsLocked else { return }
        editTool = nil
        openFamily = openFamily == family ? nil : family
        HapticFeedback.light()
    }

    /// Le guet des trames ne s'arme que si quelqu'un les peint.
    func refreshFeed() {
        camera.liveFeed.isActive = paintsWithMetal || stripNeedsFeed
    }
}
