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

    private var coordinator: AnyObject?
    private var lastAngle: CGFloat = ComposerCaptureMirrorRule.portraitAngle
    private var readsDeviceOrientation = false

    func follow(_ device: AVCaptureDevice) {
        if #available(iOS 17.0, *) {
            coordinator = AVCaptureDevice.RotationCoordinator(device: device, previewLayer: nil)
        } else if !readsDeviceOrientation {
            readsDeviceOrientation = true
            UIDevice.current.beginGeneratingDeviceOrientationNotifications()
        }
    }

    var captureAngle: CGFloat {
        if #available(iOS 17.0, *), let coordinator = coordinator as? AVCaptureDevice.RotationCoordinator {
            return coordinator.videoRotationAngleForHorizonLevelCapture
        }
        if let angle = ComposerCaptureHorizonRule.angle(for: UIDevice.current.orientation) {
            lastAngle = angle
        }
        return lastAngle
    }

    func level(_ connection: AVCaptureConnection?) {
        guard let connection else { return }
        let angle = captureAngle
        if #available(iOS 17.0, *) {
            guard connection.isVideoRotationAngleSupported(angle) else { return }
            connection.videoRotationAngle = angle
        } else if connection.isVideoOrientationSupported {
            connection.videoOrientation = ComposerCaptureHorizonRule.videoOrientation(for: angle)
        }
    }
}
