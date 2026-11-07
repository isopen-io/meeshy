import CoreGraphics
import Foundation

/// **Éclaircir ou assombrir après le toucher** (OPUS-5, audit CAM-3).
///
/// Le toucher vise la netteté ET l'exposition ; l'objectif choisit alors la
/// lumière qu'il juge juste, et un sujet en contre-jour reste sombre. Un petit
/// soleil paraît à côté de l'anneau : le glisser vers le haut éclaircit, vers
/// le bas assombrit — environ 1 EV pour 100 pt, borné à ±2 EV et à ce que
/// l'objectif sert. Le glissé DÉMARRE sur le soleil : celui de la scène zoome
/// ou range le viseur, il ne change pas de sens.
///
/// Le biais revient à 0 au toucher suivant (`CameraFocusControl.aim`) et à
/// l'ouverture d'un objectif (`CameraInputInstaller.openLens`, bascule comprise).
/// Les lois sont pures ; `ComposerCaptureSession` les câble, `CameraModel` les
/// écrit sur l'appareil.
nonisolated enum ComposerCaptureExposure {

    /// La course du doigt pour un EV.
    static let pointsPerEV: CGFloat = 100
    /// Au-delà, l'image brûle ou se bouche : l'appareil photo du système s'arrête aussi là.
    static let limit: Float = 2
    /// Un pas de VoiceOver : un tiers d'EV, le cran classique d'un boîtier.
    static let step: Float = 1.0 / 3
    /// Près de 0, le soleil s'aimante : revenir au neutre se sent sous le doigt.
    static let snap: Float = 0.08

    /// **La plage que le soleil parcourt** : ±2 EV, rognée à ce que l'objectif
    /// sert. `nil` ⇒ l'objectif ne règle pas son biais (simulateur, objectif
    /// fixe) : pas de soleil.
    static func usable(_ device: ClosedRange<Float>) -> ClosedRange<Float>? {
        let bas = max(-limit, device.lowerBound)
        let haut = min(limit, device.upperBound)
        guard bas < haut, bas <= 0, haut >= 0 else { return nil }
        return bas...haut
    }

    /// **Le biais suivi par le doigt** — depuis celui du début du glissé.
    /// Un doigt qui MONTE (`dragY` négatif) éclaircit.
    static func bias(from start: Float, dragY: CGFloat, range device: ClosedRange<Float>) -> Float {
        guard let plage = usable(device) else { return 0 }
        return settled(start - Float(dragY / pointsPerEV), in: plage)
    }

    /// **Le pas de VoiceOver**, qui ne glisse pas : un tiers d'EV.
    static func stepped(_ bias: Float, up: Bool, range device: ClosedRange<Float>) -> Float {
        guard let plage = usable(device) else { return 0 }
        return settled(bias + (up ? step : -step), in: plage)
    }

    private static func settled(_ valeur: Float, in plage: ClosedRange<Float>) -> Float {
        let borne = min(plage.upperBound, max(plage.lowerBound, valeur))
        return abs(borne) < snap ? 0 : borne
    }

    // MARK: - Le soleil

    /// Le soleil monte quand l'image s'éclaircit : il dit la lumière à l'œil.
    static let sunTravelPerEV: CGFloat = 18

    static func sunOffsetY(_ bias: Float) -> CGFloat {
        -CGFloat(bias) * sunTravelPerEV
    }

    /// L'écart entre le centre de l'anneau et celui du soleil.
    static func sunGap(ringDiameter: CGFloat) -> CGFloat {
        ringDiameter / 2 + 22
    }

    /// **À droite de l'anneau, sauf s'il sortirait de l'écran** : un toucher
    /// près du bord droit pose le soleil à gauche.
    static func sunX(ringX: CGFloat, ringDiameter: CGFloat, width: CGFloat) -> CGFloat {
        let ecart = sunGap(ringDiameter: ringDiameter)
        let marge: CGFloat = 22
        return ringX + ecart + marge <= width ? ringX + ecart : ringX - ecart
    }

    /// **Le temps que l'anneau et son soleil restent** : l'anneau seul passe
    /// vite ; avec un soleil, il faut le temps d'y poser le doigt, et bien plus
    /// sous VoiceOver, qui doit d'abord l'atteindre. Un glissé en cours le garde.
    static func markLifetime(adjustable: Bool, voiceOver: Bool) -> TimeInterval {
        guard adjustable else { return ComposerCaptureFocus.markLifetime }
        return voiceOver ? 8 : 2.5
    }

    /// Ce que VoiceOver lit : « +0.7 EV », « -1.0 EV », « 0 EV ».
    static func valueText(_ bias: Float, locale: Locale = .current) -> String {
        guard bias != 0 else { return "0 EV" }
        let format = NumberFormatter()
        format.locale = locale
        format.minimumFractionDigits = 1
        format.maximumFractionDigits = 1
        format.minimumIntegerDigits = 1
        let chiffre = format.string(from: NSNumber(value: abs(bias))) ?? String(abs(bias))
        return (bias > 0 ? "+" : "-") + chiffre + " EV"
    }
}
