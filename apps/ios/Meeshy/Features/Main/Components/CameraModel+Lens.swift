import AVFoundation
import os
import MeeshySDK

/// **Les réglages de l'objectif en place** : torche, zoom et mise au point. Ils
/// écrivent sur l'appareil actif, sous `lockForConfiguration`, et ne touchent ni
/// la session ni la prise.
extension CameraModel {

    // MARK: - La torche

    /// **La torche de l'objectif actif** — la lumière d'une VIDÉO, que
    /// `flashMode` n'éclaire pas. Sans lampe, ou sur un mode refusé, rien ne
    /// change : l'objectif avant n'en a pas, c'est l'écran qui l'éclaire.
    ///
    /// `level` vient du curseur d'intensité : une torche ALLUMÉE prend
    /// la puissance demandée, bornée à ce que l'appareil sert (une torche
    /// chaude en sert moins).
    func setTorch(_ mode: AVCaptureDevice.TorchMode, level: Double = ComposerFlashIntensity.defaultLevel) {
        guard let device = activeVideoDevice,
              device.hasTorch, device.isTorchModeSupported(mode)
        else { return }
        do {
            try device.lockForConfiguration()
            defer { device.unlockForConfiguration() }
            if mode == .on {
                try device.setTorchModeOn(level: ComposerFlashIntensity.torchLevel(
                    level, maxAvailable: AVCaptureDevice.maxAvailableTorchLevel))
            } else if device.torchMode != mode {
                device.torchMode = mode
            }
        } catch {
            Logger.media.error("Torch configuration failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - Le zoom

    /// Ce que l'objectif sert, en facteur AFFICHÉ. Sans objectif (simulateur),
    /// `1...1` : le geste de zoom n'y a aucun effet.
    var zoomRange: ClosedRange<CGFloat> {
        guard let device = activeVideoDevice else { return 1...1 }
        return zoomScale.displayedRange(deviceMin: device.minAvailableVideoZoomFactor,
                                        deviceMax: device.maxAvailableVideoZoomFactor)
    }

    /// `factor` est un facteur AFFICHÉ ; l'appareil reçoit sa conversion.
    /// Affectation directe sous `lockForConfiguration` : le doigt pilote déjà
    /// la progressivité, une rampe ajouterait un retard au geste.
    func setZoom(_ factor: CGFloat) {
        let plage = zoomRange
        let borne = min(plage.upperBound, max(plage.lowerBound, factor))
        let appareil = zoomScale.device(borne)
        guard let device = activeVideoDevice, appareil != device.videoZoomFactor else { return }
        do {
            try device.lockForConfiguration()
            device.videoZoomFactor = appareil
            device.unlockForConfiguration()
            zoomFactor = borne
        } catch {
            Logger.media.error("Zoom configuration failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - La mise au point

    /// **Le toucher vise ce point du capteur** — mise au point et exposition,
    /// une fois ; la scène qui change rend l'objectif au continu. `devicePoint`
    /// est en coordonnées capteur (`0...1`), converties selon l'image affichée
    /// (`ComposerCaptureFocusGeometry`).
    /// `false` ⇒ l'objectif ne règle ni la netteté ni l'exposition sur un point :
    /// rien n'a été visé, et l'écran ne doit pas le prétendre.
    @discardableResult
    func focus(at devicePoint: CGPoint, smooth: Bool) -> Bool {
        guard let device = activeVideoDevice else { return false }
        return CameraFocusControl.aim(at: devicePoint, smooth: smooth, on: device)
    }

    private func resumeContinuousFocus() {
        guard let device = activeVideoDevice else { return }
        CameraFocusControl.resumeContinuous(on: device, smooth: isRecordingVideo)
    }

    /// **La netteté glisse pendant TOUTE la prise** — posée à chaque
    /// segment (le nouvel objectif d'une bascule compris), retirée à la fin.
    func setSmoothFocus(_ lisse: Bool) {
        guard let device = activeVideoDevice, device.isSmoothAutoFocusSupported else { return }
        do {
            try device.lockForConfiguration()
            device.isSmoothAutoFocusEnabled = lisse
            device.unlockForConfiguration()
        } catch {
            Logger.media.error("Smooth focus failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Un observateur par objectif : changer d'objectif remplace le guet.
    func watchSubjectArea(of device: AVCaptureDevice) {
        stopWatchingSubjectArea()
        subjectAreaObserver = NotificationCenter.default.addObserver(
            forName: AVCaptureDevice.subjectAreaDidChangeNotification,
            object: device,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.resumeContinuousFocus() }
        }
    }

    func stopWatchingSubjectArea() {
        guard let subjectAreaObserver else { return }
        NotificationCenter.default.removeObserver(subjectAreaObserver)
        self.subjectAreaObserver = nil
    }
}
