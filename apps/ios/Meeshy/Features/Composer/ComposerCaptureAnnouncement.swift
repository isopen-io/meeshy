import SwiftUI
import AVFoundation
import MeeshyUI

/// **Ce que le viseur dit à VoiceOver quand il change sans qu'on le voie** (CAM-12).
///
/// Un objectif qui bascule, un cran de zoom atteint, une photo prise, une vidéo
/// qui démarre ou s'arrête : l'image le montre, l'oreille ne l'apprend que par
/// une annonce. Le verrou, le retardateur, la chauffe et l'enregistrement dans
/// Photos ont déjà la leur ; ce site ne les répète pas.
nonisolated enum ComposerCaptureAnnouncement: Equatable, Sendable {
    case lens(front: Bool)
    case zoom(CGFloat)
    case photoTaken
    case recordingStarted
    case recordingStopped

    /// L'écart en deçà duquel un facteur EST le cran.
    static let presetTolerance: CGFloat = 0.01

    /// L'objectif en place après une bascule ; un objectif indéterminé se tait.
    static func lens(_ position: AVCaptureDevice.Position) -> Self? {
        switch position {
        case .front: .lens(front: true)
        case .back: .lens(front: false)
        default: nil
        }
    }

    /// Un cran ATTEINT se dit ; un pincement entre deux crans se tait, et la
    /// bascule d'objectif, qui remet le zoom à son départ, a déjà parlé.
    static func zoom(from old: CGFloat, to new: CGFloat, presets: [CGFloat], switchingLens: Bool) -> Self? {
        guard !switchingLens, let cran = preset(near: new, in: presets),
              preset(near: old, in: presets) != cran else { return nil }
        return .zoom(cran)
    }

    static func recording(from old: ComposerSceneCameraStage, to new: ComposerSceneCameraStage) -> Self? {
        guard old != new else { return nil }
        if new == .recording { return .recordingStarted }
        return old == .recording ? .recordingStopped : nil
    }

    private static func preset(near factor: CGFloat, in presets: [CGFloat]) -> CGFloat? {
        presets.first { abs($0 - factor) < presetTolerance }
    }

    @MainActor var text: String {
        switch self {
        case .lens(front: true):
            String(localized: "composer.camera.announce.frontLens", defaultValue: "Objectif avant", bundle: .main)
        case .lens(front: false):
            String(localized: "composer.camera.announce.backLens", defaultValue: "Objectif arrière", bundle: .main)
        case .zoom(let cran):
            ComposerSceneCameraCopy.zoomLabel + " " + ComposerSceneCameraCopy.zoomPresetValue(cran)
        case .photoTaken:
            String(localized: "composer.camera.announce.photoTaken", defaultValue: "Photo prise", bundle: .main)
        case .recordingStarted:
            String(localized: "composer.camera.announce.recordingStarted", defaultValue: "Vidéo démarrée", bundle: .main)
        case .recordingStopped:
            String(localized: "composer.camera.announce.recordingStopped", defaultValue: "Vidéo arrêtée", bundle: .main)
        }
    }
}

/// Écoute l'objectif par ses publications : aucune ne redessine le viseur.
struct ComposerCaptureAnnouncer: ViewModifier {
    let camera: CameraModel
    let stage: ComposerSceneCameraStage
    /// Le facteur déjà entendu ; `nil` avant la première publication, qui ne se dit pas.
    @State private var zoom: CGFloat?

    func body(content: Content) -> some View {
        content
            .onReceive(camera.$currentPosition.removeDuplicates().dropFirst()) { position in
                announce(ComposerCaptureAnnouncement.lens(position))
            }
            .onReceive(camera.$zoomFactor.removeDuplicates()) { facteur in
                defer { zoom = facteur }
                guard let ancien = zoom else { return }
                announce(ComposerCaptureAnnouncement.zoom(
                    from: ancien, to: facteur,
                    presets: ComposerCaptureZoomScale.presets(in: camera.zoomRange),
                    switchingLens: camera.isSwitchingCamera))
            }
            .onReceive(camera.$capturedPhotoId.dropFirst().compactMap { $0 }) { _ in
                announce(.photoTaken)
            }
            .adaptiveOnChange(of: stage) { ancienne, nouvelle in
                announce(ComposerCaptureAnnouncement.recording(from: ancienne, to: nouvelle))
            }
    }

    private func announce(_ annonce: ComposerCaptureAnnouncement?) {
        guard let annonce, UIAccessibility.isVoiceOverRunning else { return }
        UIAccessibility.post(notification: .announcement, argument: annonce.text)
    }
}
