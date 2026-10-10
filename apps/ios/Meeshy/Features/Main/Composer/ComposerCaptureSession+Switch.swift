import AVFoundation

// MARK: - La bascule d'objectif (#9464)

extension ComposerCaptureSession {

    /// **Le bouton de bascule.** Muet pendant une bascule ; une fois le nouvel
    /// objectif en place, le zoom et la lumière le suivent.
    func flipCamera() {
        guard ComposerCameraSwitchRule.mayFlip(isSwitching: controls.isSwitchingCamera) else { return }
        controls.switchCamera { [weak self] position in self?.followSwitch(to: position) }
    }

    /// Le nouvel objectif s'ouvre à ×1 affiché, sans ancre héritée de
    /// l'ancien ; une prise en cours garde sa lumière —
    /// torche à l'arrière, écran à l'avant.
    func followSwitch(to position: AVCaptureDevice.Position) {
        zoomAnchor = nil
        pinchAnchor = nil
        controls.setZoom(1)
        let suite = ComposerCameraSwitchFollow.after(switchingTo: position, flash: flash, stage: stage)
        if let torche = suite.torch { controls.setTorch(torche, level: flashIntensity) }
        switch suite.screen {
        case .light: ComposerScreenFlash.shared.light(level: flashIntensity)
        case .restore: ComposerScreenFlash.shared.restore()
        case .untouched: break
        }
    }
}
