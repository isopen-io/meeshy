import CoreGraphics

// MARK: - Le soleil d'exposition (OPUS-5)

extension ComposerCaptureSession {

    /// **Le soleil paraît-il à côté de l'anneau ?** Seulement sur une image
    /// vivante, hors retouche, et si l'objectif règle son biais.
    var offersExposure: Bool {
        !phase.isEditing && stage != .off
            && ComposerCaptureExposure.usable(controls.exposureBiasRange) != nil
    }

    /// **Le doigt glisse sur le soleil** : le biais suit la course depuis le
    /// début du glissé. Revenir au neutre se sent sous le doigt.
    func dragExposure(translationY: CGFloat) {
        guard offersExposure else { return }
        let depart = exposureDragStart ?? exposureBias
        exposureDragStart = depart
        setExposure(ComposerCaptureExposure.bias(from: depart, dragY: translationY,
                                                 range: controls.exposureBiasRange))
    }

    func endExposureDrag() {
        exposureDragStart = nil
    }

    /// VoiceOver ne glisse pas : il incrémente d'un tiers d'EV.
    func stepExposure(up: Bool) {
        guard offersExposure else { return }
        setExposure(ComposerCaptureExposure.stepped(exposureBias, up: up, range: controls.exposureBiasRange))
    }

    /// **Le toucher suivant et la bascule repartent du neutre** — l'objectif
    /// a déjà rendu son biais à 0 (`CameraFocusControl.aim`, `openLens`).
    func forgetExposure() {
        exposureBias = 0
        exposureDragStart = nil
    }

    private func setExposure(_ ev: Float) {
        guard ev != exposureBias else { return }
        let neutre = ev == 0
        exposureBias = ev
        controls.setExposureBias(ev)
        if neutre { HapticFeedback.light() }
    }
}
