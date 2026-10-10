import AVFoundation
import CoreGraphics

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
