import AVFoundation
import CoreGraphics

/// **Ce que la machine de capture COMMANDE à l'objectif** (#9464) — `CameraModel`
/// en production, une doublure dans les témoins. Les vues lisent toujours
/// `CameraModel` (session, trames, permission) ; seules les commandes passent ici.
protocol ComposerCaptureCameraProviding: AnyObject {
    var currentPosition: AVCaptureDevice.Position { get }
    /// Une bascule est en cours : le bouton se tait.
    var isSwitchingCamera: Bool { get }
    /// Le cadrage, en facteur AFFICHÉ (#9350).
    var zoomFactor: CGFloat { get }
    var zoomRange: ClosedRange<CGFloat> { get }
    /// Bascule avant ↔ arrière ; `then` reçoit l'objectif en place, une fois
    /// la bascule finie.
    func switchCamera(then: @escaping @MainActor @Sendable (AVCaptureDevice.Position) -> Void)
    func setZoom(_ factor: CGFloat)
    func setTorch(_ mode: AVCaptureDevice.TorchMode, level: Double)
    func takePhoto(flash: AVCaptureDevice.FlashMode)
    /// Vise ce point du capteur ; `false` ⇒ l'objectif n'a rien réglé.
    /// `smooth` : la netteté glisse (pendant une prise).
    func focus(at devicePoint: CGPoint, smooth: Bool) -> Bool
    /// La luminosité visée, en EV — le curseur vertical du viseur (Task 15).
    func setExposureBias(_ bias: Float)
}

/// **La lumière d'une prise suit l'objectif qui bascule** (#9464).
///
/// Pendant une prise, revenir à l'arrière rallume la torche (le nouvel objectif
/// naît éteint) et rend la luminosité de l'écran ; passer à l'avant éteint la
/// torche et allume l'écran si le flash est actif. Hors prise, rien : le sol
/// blanc suit déjà l'objectif publié, et la torche n'éclaire qu'une vidéo.
nonisolated struct ComposerCameraSwitchFollow: Equatable, Sendable {

    enum Screen: Equatable, Sendable {
        case light
        case restore
        case untouched
    }

    /// `nil` ⇒ on ne touche pas la torche.
    let torch: AVCaptureDevice.TorchMode?
    let screen: Screen

    static func after(switchingTo position: AVCaptureDevice.Position,
                      flash: AVCaptureDevice.FlashMode,
                      stage: ComposerSceneCameraStage) -> ComposerCameraSwitchFollow {
        guard stage == .recording else { return ComposerCameraSwitchFollow(torch: nil, screen: .untouched) }
        let ecran: Screen = ComposerFrontFlash.lightsFloor(flash: flash, position: position, stage: stage)
            ? .light : .restore
        return ComposerCameraSwitchFollow(torch: ComposerFrontFlash.torch(flash: flash, position: position),
                                          screen: ecran)
    }
}
