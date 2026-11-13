import AVFoundation
import os
import MeeshySDK

/// **Le bouton Camera Control règle le viseur de Meeshy** (OPUS-9, doc 08 § R7).
///
/// Sur iPhone 16 et suivants, le bouton latéral expose les curseurs que la
/// session lui confie. Meeshy lui donne le zoom et l'exposition du système, puis
/// le sélecteur « Ambiance » (les huit ambiances du viseur), recréés à chaque
/// objectif installé : un curseur reste attaché à l'appareil qui l'a fait
/// naître. Sans bouton (`supportsControls` faux) ou avant iOS 18, rien n'est
/// ajouté et le viseur ne change pas.
nonisolated enum CameraSystemControlsRule {

    enum Control: Equatable, Sendable {
        case zoom
        case exposure
        case ambiance
    }

    static func controls(supportsControls: Bool) -> [Control] {
        supportsControls ? [.zoom, .exposure, .ambiance] : []
    }

    /// Les ambiances du sélecteur, dans l'ordre de la bande.
    static let ambiances: [VideoFilterPreset] = VideoFilterPreset.catalog

    static func ambianceIndex(of preset: VideoFilterPreset) -> Int? {
        ambiances.firstIndex(of: preset)
    }

    static func ambiance(at index: Int) -> VideoFilterPreset? {
        ambiances.indices.contains(index) ? ambiances[index] : nil
    }

    /// Ce que la session admet encore : elle borne le nombre de contrôles.
    static func fitting(_ wanted: [Control], maxControls: Int) -> [Control] {
        Array(wanted.prefix(max(0, maxControls)))
    }
}

/// Pose les contrôles du bouton latéral ; ne fait rien avant iOS 18.
nonisolated enum CameraSystemControlsHost {

    /// **Dans la transaction qui installe `device`**, sur la file de la session.
    /// `onZoom` reçoit le facteur de l'APPAREIL, sur le fil principal.
    static func install(in session: AVCaptureSession, for device: AVCaptureDevice, ambiance: CameraAmbianceLink,
                        onZoom: @escaping @Sendable @MainActor (CGFloat) -> Void) {
        guard #available(iOS 18.0, *) else { return }
        CameraSystemControls.install(in: session, for: device, ambiance: ambiance, onZoom: onZoom)
    }
}

/// **Le sélecteur « Ambiance » relié au look du viseur** (OPUS-9) : un choix fait
/// au bouton latéral rejoint le look comme un choix de la bande, et la bande qui
/// choisit fait suivre le bouton. Le sélecteur renaît à chaque objectif, à
/// l'ambiance en cours.
nonisolated final class CameraAmbianceLink: Sendable {

    private struct State {
        var title = ""
        var titles: [String] = []
        var chosen = 0
        var onPick: (@MainActor @Sendable (VideoFilterPreset) -> Void)?
        var picker: AnyObject?
    }

    private let state = Locked<State>(uncheckedState: State())
    static let queue = DispatchQueue(label: "me.meeshy.camera.controls.ambiance")

    /// Sur le fil principal : les noms localisés, et ce qu'un choix du bouton fait.
    func connect(title: String, titles: [String], onPick: @escaping @MainActor @Sendable (VideoFilterPreset) -> Void) {
        state.mutateUnchecked { etat in
            etat.title = title
            etat.titles = titles
            etat.onPick = onPick
        }
    }

    /// L'ambiance du look a changé : le bouton la montre.
    func show(_ preset: VideoFilterPreset) {
        guard let index = CameraSystemControlsRule.ambianceIndex(of: preset) else { return }
        let change = state.mutateUnchecked { etat in
            defer { etat.chosen = index }
            return etat.chosen != index
        }
        guard change, #available(iOS 18.0, *) else { return }
        Self.queue.async { [state] in
            guard let picker = state.mutateUnchecked({ $0.picker }) as? AVCaptureIndexPicker,
                  picker.selectedIndex != index else { return }
            picker.selectedIndex = index
        }
    }

    /// Le sélecteur de l'objectif qui s'installe ; `nil` tant que les noms ne
    /// sont pas connus.
    @available(iOS 18.0, *)
    func makePicker() -> AVCaptureIndexPicker? {
        let (titre, noms, choisi) = state.mutateUnchecked { ($0.title, $0.titles, $0.chosen) }
        guard noms.count == CameraSystemControlsRule.ambiances.count else { return nil }
        let picker = AVCaptureIndexPicker(titre, symbolName: "camera.filters", localizedIndexTitles: noms)
        picker.selectedIndex = choisi
        picker.setActionQueue(Self.queue) { [weak self] index in self?.picked(index) }
        state.mutateUnchecked { $0.picker = picker }
        return picker
    }

    private func picked(_ index: Int) {
        guard let preset = CameraSystemControlsRule.ambiance(at: index) else { return }
        let onPick = state.mutateUnchecked { etat in
            etat.chosen = index
            return etat.onPick
        }
        guard let onPick else { return }
        Task { @MainActor in onPick(preset) }
    }
}

/// Le délégué des contrôles de session : la session l'exige pour les servir,
/// et le viseur n'a rien à faire quand ils paraissent ou disparaissent.
@available(iOS 18.0, *)
nonisolated final class CameraSystemControls: NSObject, AVCaptureSessionControlsDelegate, Sendable {

    static let delegate = CameraSystemControls()
    private static let queue = DispatchQueue(label: "me.meeshy.camera.controls")

    static func install(in session: AVCaptureSession, for device: AVCaptureDevice, ambiance: CameraAmbianceLink,
                        onZoom: @escaping @Sendable @MainActor (CGFloat) -> Void) {
        guard session.supportsControls else { return }
        session.controls.forEach { session.removeControl($0) }
        if session.controlsDelegate == nil { session.setControlsDelegate(delegate, queue: queue) }
        let voulus = CameraSystemControlsRule.fitting(
            CameraSystemControlsRule.controls(supportsControls: true), maxControls: session.maxControlsCount)
        for voulu in voulus {
            let controle: AVCaptureControl
            switch voulu {
            case .zoom:
                controle = AVCaptureSystemZoomSlider(device: device) { facteur in
                    Task { @MainActor in onZoom(facteur) }
                }
            case .exposure:
                controle = AVCaptureSystemExposureBiasSlider(device: device)
            case .ambiance:
                guard let picker = ambiance.makePicker() else { continue }
                controle = picker
            }
            guard session.canAddControl(controle) else {
                Logger.media.error("Camera Control refused by the session")
                continue
            }
            session.addControl(controle)
        }
    }

    func sessionControlsDidBecomeActive(_ session: AVCaptureSession) {}
    func sessionControlsWillEnterFullscreenAppearance(_ session: AVCaptureSession) {}
    func sessionControlsWillExitFullscreenAppearance(_ session: AVCaptureSession) {}
    func sessionControlsDidBecomeInactive(_ session: AVCaptureSession) {}
}
