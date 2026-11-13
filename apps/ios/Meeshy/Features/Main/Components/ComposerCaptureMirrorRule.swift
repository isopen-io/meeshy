import Combine
import AVFoundation
import CoreGraphics
import UIKit

/// **Le rendu après la prise est celui d'avant la prise** (#9464).
///
/// L'aperçu de l'objectif avant se voit EN MIROIR, comme dans l'appareil photo ;
/// la photo et la vidéo sortent donc en miroir elles aussi, et debout — le
/// système ne décide plus seul (`automaticallyAdjustsVideoMirroring`). Les
/// trames du look en direct restent brutes : `ComposerLiveLookRule.orientation`
/// les redresse déjà en miroir à l'affichage, les miroiter ici les remettrait
/// à l'endroit.
nonisolated enum ComposerCaptureMirrorRule {

    enum Output: Equatable, Sendable {
        case photo
        case movie
        case frames
    }

    /// L'angle d'une connexion debout (iOS 17 : `videoRotationAngle`).
    static let portraitAngle: CGFloat = 90

    static func mirrors(_ output: Output, position: AVCaptureDevice.Position) -> Bool {
        output != .frames && position == .front
    }

    /// Les trames gardent l'orientation du capteur : les tourner coûterait une
    /// rotation matérielle par image, et leur loi d'affichage les redresse.
    static func rotatesToPortrait(_ output: Output) -> Bool {
        output != .frames
    }
}

/// **La vidéo filmée en marchant reste posée** (OPUS-10, doc 08 § R9).
///
/// Sans réglage, la connexion du fichier vidéo n'est pas stabilisée. Le mode
/// `standard` est retenu des deux côtés : c'est celui qui recadre le moins et
/// ajoute le moins de délai, donc la vidéo garde le cadrage que l'aperçu
/// montrait. Les modes `cinematic` recadrent davantage sans que l'aperçu le
/// montre : ils attendent une recette sur iPhone. La photo n'est jamais
/// stabilisée par la connexion, et les trames du look en direct non plus : leur
/// délai se verrait dans le viseur.
nonisolated enum ComposerCaptureStabilizationRule {

    enum Mode: Equatable, Sendable {
        case off
        case standard
    }

    static func preferred(_ output: ComposerCaptureMirrorRule.Output, supportsStandard: Bool) -> Mode {
        guard output == .movie, supportsStandard else { return .off }
        return .standard
    }
}

/// **Une photo sort à l'HORIZON, comme l'appareil était tenu** — jamais couchée.
///
/// La connexion photo restait figée debout (`portraitAngle`) : un appareil tenu
/// en paysage rendait une photo tournée d'un quart de tour, et la caméra du jeu,
/// qui n'orientait rien, rendait l'orientation du capteur même tenue debout.
/// L'état de l'art (AVCam, iOS 17) lit l'angle de l'horizon au DÉCLENCHEMENT :
/// `AVCaptureDevice.RotationCoordinator.videoRotationAngleForHorizonLevelCapture`,
/// qui suit la gravité et non l'interface — une app verrouillée en portrait
/// photographie juste. Avant iOS 17, l'orientation physique de l'appareil en
/// tient lieu, avec la même table que `AVCaptureVideoOrientation`. À plat
/// (face au ciel ou au sol), l'orientation ne dit rien : la dernière connue reste.
nonisolated enum ComposerCaptureHorizonRule {

    /// L'angle de la connexion pour un appareil tenu ainsi ; `nil` quand la
    /// tenue ne désigne aucun horizon (à plat, inconnue).
    static func angle(for orientation: UIDeviceOrientation) -> CGFloat? {
        switch orientation {
        case .portrait: return 90
        case .landscapeLeft: return 0
        case .landscapeRight: return 180
        case .portraitUpsideDown: return 270
        default: return nil
        }
    }

    /// La tenue qui ne désigne aucun horizon garde l'angle de la dernière qui en
    /// désignait un : l'appareil posé à plat reste tenu comme il l'était.
    static func heldAngle(_ orientation: UIDeviceOrientation, last: CGFloat) -> CGFloat {
        angle(for: orientation) ?? last
    }

    /// L'équivalent d'avant iOS 17 (`videoOrientation`).
    static func videoOrientation(for angle: CGFloat) -> AVCaptureVideoOrientation {
        switch Int(angle.rounded()) {
        case 0: return .landscapeRight
        case 180: return .landscapeLeft
        case 270: return .portraitUpsideDown
        default: return .portrait
        }
    }
}

/// Lit l'horizon de l'objectif en service et le pose sur la connexion photo,
/// juste avant la prise. Un par caméra ; `follow` à chaque objectif installé.
@MainActor
final class ComposerCaptureHorizon {

    nonisolated deinit {
        guard readsDeviceOrientation else { return }
        Task { @MainActor in UIDevice.current.endGeneratingDeviceOrientationNotifications() }
    }

    private var coordinator: AnyObject?
    private var lastAngle: CGFloat = ComposerCaptureMirrorRule.portraitAngle
    private var readsDeviceOrientation = false
    private var holds: AnyCancellable?

    func follow(_ device: AVCaptureDevice) {
        if #available(iOS 17.0, *) {
            coordinator = AVCaptureDevice.RotationCoordinator(device: device, previewLayer: nil)
        } else if !readsDeviceOrientation {
            readsDeviceOrientation = true
            UIDevice.current.beginGeneratingDeviceOrientationNotifications()
            hold(UIDevice.current.orientation)
            holds = NotificationCenter.default.publisher(for: UIDevice.orientationDidChangeNotification)
                .receive(on: DispatchQueue.main)
                .sink { [weak self] _ in MainActor.assumeIsolated { self?.hold(UIDevice.current.orientation) } }
        }
    }

    var captureAngle: CGFloat {
        if #available(iOS 17.0, *), let coordinator = coordinator as? AVCaptureDevice.RotationCoordinator {
            return coordinator.videoRotationAngleForHorizonLevelCapture
        }
        hold(UIDevice.current.orientation)
        return lastAngle
    }

    private func hold(_ orientation: UIDeviceOrientation) {
        lastAngle = ComposerCaptureHorizonRule.heldAngle(orientation, last: lastAngle)
    }

    func level(_ connection: AVCaptureConnection?) {
        guard let connection else { return }
        Self.apply(captureAngle, to: connection)
    }

    /// Pose l'angle lu sur le fil principal, depuis la file de la session (#17433).
    nonisolated static func apply(_ angle: CGFloat, to connection: AVCaptureConnection) {
        if #available(iOS 17.0, *) {
            guard connection.isVideoRotationAngleSupported(angle) else { return }
            connection.videoRotationAngle = angle
        } else if connection.isVideoOrientationSupported {
            connection.videoOrientation = ComposerCaptureHorizonRule.videoOrientation(for: angle)
        }
    }
}
