import CoreGraphics
import Foundation

/// **La mise au point du viseur : automatique, et là où l'on touche**
/// (#9295, directive porteur 2026-10-04 ; le toucher SIMPLE depuis #9464).
///
/// > « L'appareil doit avoir l'auto mise au point et, lorsqu'on double tap à une
/// > position, elle fait la mise au point à cet emplacement. »
///
/// À l'ouverture, l'objectif suit le sujet tout seul (mise au point et
/// exposition CONTINUES). Le toucher fixe les deux sur le point touché,
/// UNE fois, puis surveille la scène : dès qu'elle change (l'auteur bouge,
/// le sujet sort), l'objectif repart en continu au centre — comme l'appareil
/// photo du système, et sans que l'auteur ait rien à défaire.
///
/// Les lois sont pures ; `CameraModel` traduit le plan en réglages AVFoundation
/// et le chrome du viseur (`ComposerCaptureChrome`), partagé par la scène et le
/// plein écran, porte le geste — les deux montages en profitent d'un coup.
nonisolated enum ComposerCaptureFocus {

    /// Ce que l'objectif actif sait faire — lu une fois par objectif.
    struct Capabilities: Equatable, Sendable {
        let focusPointOfInterest: Bool
        let autoFocus: Bool
        let continuousAutoFocus: Bool
        let exposurePointOfInterest: Bool
        let autoExpose: Bool
        let continuousAutoExposure: Bool

        /// Un objectif fixe (simulateur, certains objectifs avant) : rien à régler.
        static let none = Capabilities(focusPointOfInterest: false, autoFocus: false,
                                       continuousAutoFocus: false, exposurePointOfInterest: false,
                                       autoExpose: false, continuousAutoExposure: false)
    }

    /// Un réglage de mise au point ou d'exposition.
    enum Mode: Equatable, Sendable {
        /// L'objectif suit la scène tout seul, centré.
        case continuous
        /// L'objectif se règle une fois sur ce point du capteur, puis tient.
        case once(at: CGPoint)
    }

    /// Ce que l'objectif reçoit. `nil` ⇒ il ne sait pas faire, on n'y touche pas.
    struct Plan: Equatable, Sendable {
        let focus: Mode?
        let exposure: Mode?
        /// Surveiller la scène, pour repartir en continu quand elle change.
        let watchesSubjectArea: Bool
        /// Pendant une prise, la netteté glisse au lieu de pomper (#9464).
        var smoothFocus = false
    }

    /// Le centre du capteur — là où repart une mise au point continue.
    static let center = CGPoint(x: 0.5, y: 0.5)

    /// **À l'ouverture, et chaque fois que la scène change après un toucher.**
    /// `smooth` : pendant une prise, le retour au continu reste lissé (#9464).
    static func continuous(_ objectif: Capabilities, smooth: Bool = false) -> Plan {
        Plan(focus: objectif.continuousAutoFocus ? .continuous : nil,
             exposure: objectif.continuousAutoExposure ? .continuous : nil,
             watchesSubjectArea: false, smoothFocus: smooth)
    }

    /// **Le toucher** : mise au point ET exposition sur le point touché.
    /// Un objectif qui ne sait pas viser un point garde son réglage continu —
    /// le geste n'a alors aucun effet plutôt qu'un effet faux.
    static func focusing(at devicePoint: CGPoint, _ objectif: Capabilities, smooth: Bool = false) -> Plan {
        let point = clamped(devicePoint)
        let focus: Mode? = objectif.focusPointOfInterest && objectif.autoFocus
            ? .once(at: point)
            : (objectif.continuousAutoFocus ? .continuous : nil)
        let exposure: Mode? = objectif.exposurePointOfInterest && objectif.autoExpose
            ? .once(at: point)
            : (objectif.continuousAutoExposure ? .continuous : nil)
        return Plan(focus: focus, exposure: exposure,
                    watchesSubjectArea: isOnce(focus) || isOnce(exposure), smoothFocus: smooth)
    }

    /// **Le plan vise-t-il quelque chose ?** Faux ⇒ ni anneau ni vibration :
    /// l'objectif ne règle ni la netteté ni l'exposition sur un point (#9464).
    /// L'exposition seule (objectif avant) suffit.
    static func aims(_ plan: Plan) -> Bool {
        isOnce(plan.focus) || isOnce(plan.exposure)
    }

    /// Un point du capteur vit dans `0...1` sur les deux axes ; un toucher au
    /// ras du bord ne doit pas sortir du capteur.
    static func clamped(_ point: CGPoint) -> CGPoint {
        CGPoint(x: min(1, max(0, point.x)), y: min(1, max(0, point.y)))
    }

    /// Le toucher ne vise que quand l'image est là : viseur armé ou prise en
    /// cours — jamais sur une scène sans caméra.
    static func focusesOnTap(stage: ComposerSceneCameraStage) -> Bool {
        stage != .off
    }

    /// Le temps que l'anneau de mise au point reste visible.
    static let markLifetime: TimeInterval = 0.9

    private static func isOnce(_ mode: Mode?) -> Bool {
        if case .once = mode { return true }
        return false
    }
}

/// L'anneau qui montre OÙ l'objectif vient de viser — dans le repère du chrome.
nonisolated struct ComposerCaptureFocusMark: Equatable, Sendable {
    let id: UUID
    let location: CGPoint
}
