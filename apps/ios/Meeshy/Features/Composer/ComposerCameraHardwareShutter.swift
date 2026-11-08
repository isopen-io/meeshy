import AVKit
import MeeshySDK
import SwiftUI

/// **Les boutons de volume et le bouton Action déclenchent comme le rond** (CAM-6) :
/// appui bref = photo, maintenu = vidéo, relâché = fin. Volume haut et bas sont
/// identiques ; hors viseur armé, ils rendent au système le réglage du volume.
nonisolated enum ComposerHardwareShutter {
    enum Event: Equatable { case pressed, heldLong, released, cancelled }
    enum Press: Equatable { case none, waiting, filming, spent }
    enum Step: Equatable { case nothing, photo, film, release, stop }

    /// Le seuil de la tenue est celui du déclencheur à l'écran.
    static let holdDelay = ComposerShutterGesture.holdToFilm

    static func isActive(stage: ComposerSceneCameraStage, editing: Bool) -> Bool {
        !editing && (stage == .armed || stage == .recording)
    }

    static func next(_ event: Event, press: Press, stage: ComposerSceneCameraStage, editing: Bool,
                     allowsPhoto: Bool, allowsVideo: Bool) -> (step: Step, press: Press) {
        let arme = stage == .armed && !editing
        switch (event, press) {
        case (.pressed, .none) where stage == .recording && !editing:
            return (.stop, .spent)
        case (.pressed, .none):
            return (.nothing, arme ? .waiting : .spent)
        case (.heldLong, .waiting):
            return arme && allowsVideo ? (.film, .filming) : (.nothing, .waiting)
        case (.released, .waiting):
            return (arme && allowsPhoto ? .photo : .nothing, .none)
        case (.released, .filming), (.cancelled, .filming):
            return (.release, .none)
        case (.released, _), (.cancelled, _):
            return (.nothing, .none)
        default:
            return (.nothing, press)
        }
    }
}

/// L'interaction posée sur la vue du viseur (jamais dans `CameraModel`), active
/// seulement viseur armé ou en prise, et sans rien d'autre que le chemin du rond.
struct ComposerCameraHardwareButtons: UIViewRepresentable {
    let session: ComposerCaptureSession
    let active: Bool
    let allowsPhoto: Bool
    let allowsVideo: Bool

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> UIView {
        let vue = UIView()
        vue.isAccessibilityElement = false
        if #available(iOS 17.2, *) {
            let coordinateur = context.coordinator
            let interaction = AVCaptureEventInteraction { [weak coordinateur] evenement in
                coordinateur?.handle(Coordinator.event(of: evenement.phase))
            }
            vue.addInteraction(interaction)
            coordinateur.interaction = interaction
        }
        return vue
    }

    func updateUIView(_ vue: UIView, context: Context) {
        let coordinateur = context.coordinator
        coordinateur.session = session
        coordinateur.allowsPhoto = allowsPhoto
        coordinateur.allowsVideo = allowsVideo
        if #available(iOS 17.2, *) {
            (coordinateur.interaction as? AVCaptureEventInteraction)?.isEnabled = active
        }
    }

    final class Coordinator {
        weak var session: ComposerCaptureSession?
        var allowsPhoto = true
        var allowsVideo = true
        var interaction: AnyObject?
        private var press = ComposerHardwareShutter.Press.none
        private var holdTimer: Task<Void, Never>?

        // Deinit synthétisée ISOLÉE sous SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor :
        // elle tue xctest au démontage (garde : MainActorDeinitSourceGuardTests).
        nonisolated deinit {}

        // iOS 26.1 : une deinit synthétisée ISOLÉE au MainActor (SE-0466) fait un
        // double-free au démontage (#9694). Le minuteur tient `self` en `weak`.
        nonisolated deinit {}

        @available(iOS 17.2, *)
        static func event(of phase: AVCaptureEventPhase) -> ComposerHardwareShutter.Event {
            switch phase {
            case .began: return .pressed
            case .ended: return .released
            default: return .cancelled
            }
        }

        func handle(_ event: ComposerHardwareShutter.Event) {
            guard let session else { return }
            let (step, suivant) = ComposerHardwareShutter.next(
                event, press: press, stage: session.stage, editing: session.phase.isEditing,
                allowsPhoto: allowsPhoto, allowsVideo: allowsVideo)
            if suivant == .waiting, press != .waiting { armHoldTimer() }
            if suivant != .waiting { holdTimer?.cancel() }
            press = suivant
            switch step {
            case .photo: session.perform(.photoToEdit, item: nil)
            case .film: session.perform(.filmSegment, item: nil)
            case .release: session.endHold()
            case .stop: session.closeTake()
            case .nothing: break
            }
        }

        private func armHoldTimer() {
            holdTimer?.cancel()
            holdTimer = Task { @MainActor [weak self] in
                guard await cancellableSleep(for: .seconds(ComposerHardwareShutter.holdDelay)) else { return }
                self?.handle(.heldLong)
            }
        }
    }
}
