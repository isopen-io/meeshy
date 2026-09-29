import AVFoundation
import Foundation
import UIKit

/// **Le flash qui ÉCLAIRE vraiment** (#8653, directive porteur 2026-09-29 :
/// « le flash doit activer vraiment le flash, et si la caméra est par devant,
/// alors transformer le sol, sombre ou de n'importe quelle couleur, en BLANC
/// brillant forte intensité ! »).
///
/// L'objectif ARRIÈRE a une lampe : `AVCapturePhotoSettings.flashMode` pour une
/// photo, la torche pour une vidéo — qui n'avait jusqu'ici aucun éclairage.
/// L'objectif AVANT n'en a pas : c'est l'ÉCRAN qui éclaire le visage, comme le
/// « Retina Flash » de l'appareil photo système — le sol passe en blanc et la
/// luminosité monte au maximum le temps de la prise.
nonisolated enum ComposerFrontFlash {

    /// Le sol blanc — flash actif (`on` ou `auto` : l'écran ne sait pas mesurer
    /// la lumière, donc « quand il faut » se lit « oui »), objectif avant,
    /// viseur ouvert. Il reste allumé tant que le viseur l'est : l'auteur voit
    /// son visage sous la lumière qui le prendra.
    static func lightsFloor(flash: AVCaptureDevice.FlashMode,
                            position: AVCaptureDevice.Position,
                            stage: ComposerSceneCameraStage) -> Bool {
        flash != .off && position == .front && stage != .off
    }

    /// La torche d'une VIDÉO à l'arrière ; jamais à l'avant, qui n'en a pas.
    static func torch(flash: AVCaptureDevice.FlashMode,
                      position: AVCaptureDevice.Position) -> AVCaptureDevice.TorchMode {
        guard position == .back else { return .off }
        switch flash {
        case .on:   return .on
        case .auto: return .auto
        default:    return .off
        }
    }

    /// En plein écran, l'aperçu couvre tout : il se retire d'un anneau pour
    /// que le sol blanc reste visible autour de lui.
    static let fullScreenRim: CGFloat = 28

    static func previewRect(_ rect: CGRect, size: ComposerSceneCameraSize, floorLit: Bool) -> CGRect {
        guard floorLit, size == .fullScreen else { return rect }
        return rect.insetBy(dx: fullScreenRim, dy: fullScreenRim)
    }

    /// Le temps que l'écran monte à pleine luminosité avant le déclenchement.
    static let brightnessRamp: TimeInterval = 0.25
    /// Ce que l'écran reste allumé après le déclenchement d'une photo.
    static let photoHold: TimeInterval = 0.45
}

/// Ce dont le flash d'écran a besoin : une luminosité qu'on lit et qu'on pose.
@MainActor
protocol ScreenBrightnessControlling: AnyObject {
    var brightness: CGFloat { get set }
}

extension UIScreen: ScreenBrightnessControlling {}

/// **La luminosité montée au maximum le temps de la prise, puis RENDUE.**
/// Un seul souvenir : allumer deux fois ne mémorise pas le maximum comme
/// « la luminosité d'avant ».
@MainActor
final class ComposerScreenFlash {
    static let shared = ComposerScreenFlash(screen: UIScreen.main)

    private let screen: ScreenBrightnessControlling
    private var before: CGFloat?

    init(screen: ScreenBrightnessControlling) {
        self.screen = screen
    }

    nonisolated deinit {}

    /// `level` vient du curseur d'intensité (#8671) ; rallumer à un autre
    /// niveau le RÈGLE sans oublier la luminosité d'avant.
    func light(level: Double = ComposerFlashIntensity.defaultLevel) {
        if before == nil { before = screen.brightness }
        screen.brightness = CGFloat(ComposerFlashIntensity.clamped(level))
    }

    /// Règle un écran DÉJÀ allumé ; n'allume rien.
    func adjust(level: Double) {
        guard before != nil else { return }
        screen.brightness = CGFloat(ComposerFlashIntensity.clamped(level))
    }

    func restore() {
        guard let before else { return }
        screen.brightness = before
        self.before = nil
    }
}

/// **Le vocabulaire du flash — un seul, pour la feuille ET le viseur en scène**
/// (#4080, vue `2b` : « ◐ FLASH AUTO »).
///
/// Ces trois règles vivaient en privé dans `CameraView`. La barre du viseur en
/// scène a besoin des mêmes ; les recopier aurait fait diverger le CYCLE au
/// premier réglage — et un cycle qui diffère entre deux écrans du même appareil
/// est le genre d'écart que personne ne remarque avant de le subir.
///
/// L'ordre du cycle est celui d'origine, et il n'est pas arbitraire : `off` est
/// le repos, `on` la contrainte explicite, `auto` la délégation. Passer de
/// « jamais » à « toujours » puis à « quand il faut » fait parcourir les trois
/// intentions dans l'ordre où on les envisage.
nonisolated enum ComposerCameraFlash {

    static func next(after mode: AVCaptureDevice.FlashMode) -> AVCaptureDevice.FlashMode {
        switch mode {
        case .off: return .on
        case .on:  return .auto
        default:   return .off
        }
    }

    static func symbol(for mode: AVCaptureDevice.FlashMode) -> String {
        switch mode {
        case .on:   return "bolt.fill"
        case .auto: return "bolt.badge.automatic.fill"
        default:    return "bolt.slash.fill"
        }
    }

    /// **Le libellé dit l'ÉTAT, pas l'action** — contrairement au chevron de la
    /// description, et pour une raison qui tient : un flash a trois positions,
    /// donc « activer » ne dirait pas laquelle vient ensuite. C'est l'état
    /// courant qui renseigne, et le trait `.isButton` dit déjà qu'un appui
    /// change quelque chose.
    @MainActor
    static func label(for mode: AVCaptureDevice.FlashMode) -> String {
        switch mode {
        case .on:
            return String(localized: "camera.flash.on",
                          defaultValue: "Flash activé", bundle: .main)
        case .auto:
            return String(localized: "camera.flash.auto",
                          defaultValue: "Flash automatique", bundle: .main)
        default:
            return String(localized: "camera.flash.off",
                          defaultValue: "Flash désactivé", bundle: .main)
        }
    }
}

/// **L'intensité du flash — un curseur de verre collé au bouton** (#8671,
/// directive porteur 2026-09-29 : « quand le flash est activé, une slide
/// liquid glass s'allonge à droite, collée au bouton, pour décider de
/// l'intensité du blanc du sol du composeur »).
///
/// Une seule valeur, deux lumières : le BLANC du sol et la luminosité de
/// l'écran à l'avant, la puissance de la torche à l'arrière. Elle est
/// mémorisée d'une ouverture du viseur à l'autre — un réglage qu'on refait à
/// chaque prise n'est pas un réglage.
nonisolated enum ComposerFlashIntensity {

    /// Le plancher : en dessous, le « blanc » serait un gris qui n'éclaire
    /// plus rien, et le flash mentirait sur ce qu'il fait.
    static let range: ClosedRange<Double> = 0.3...1
    static let defaultLevel: Double = 1
    static let storageKey = "composer.camera.flashIntensity"

    /// Le curseur ne s'allonge que flash actif : sans lumière, il n'y a pas
    /// d'intensité à régler.
    static func showsSlider(flash: AVCaptureDevice.FlashMode) -> Bool {
        flash != .off
    }

    static func clamped(_ level: Double) -> Double {
        guard level.isFinite else { return defaultLevel }
        return min(range.upperBound, max(range.lowerBound, level))
    }

    /// Le doigt posé à `x` sur une piste de `width` points.
    static func level(atX x: CGFloat, width: CGFloat) -> Double {
        guard width > 0 else { return defaultLevel }
        let part = Double(min(max(x / width, 0), 1))
        return range.lowerBound + part * (range.upperBound - range.lowerBound)
    }

    /// Ce que la piste REMPLIT pour un niveau — l'inverse de `level(atX:)`.
    static func fill(_ level: Double) -> Double {
        (clamped(level) - range.lowerBound) / (range.upperBound - range.lowerBound)
    }

    /// Le blanc du sol : le niveau lui-même, en luminance.
    static func floorWhite(_ level: Double) -> Double {
        clamped(level)
    }

    /// La puissance de la torche, bornée à ce que l'appareil sert et jamais
    /// nulle (`setTorchModeOn(level:)` refuse 0).
    static func torchLevel(_ level: Double, maxAvailable: Float) -> Float {
        let plafond = max(0.05, min(1, maxAvailable))
        return min(plafond, max(0.05, Float(clamped(level))))
    }

    /// Le pas d'un balayage VoiceOver.
    static let accessibilityStep: Double = 0.1

    static func stepped(_ level: Double, up: Bool) -> Double {
        clamped(level + (up ? accessibilityStep : -accessibilityStep))
    }

    /// La valeur dite par VoiceOver : un pourcentage.
    static func percent(_ level: Double) -> Int {
        Int((clamped(level) * 100).rounded())
    }
}
