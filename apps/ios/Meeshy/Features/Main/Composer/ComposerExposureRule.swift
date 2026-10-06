import CoreGraphics
import Foundation

/// **La luminosité du viseur, en curseur vertical sous le flash** (#9351,
/// décision porteur 2026-10-05 : « le slide de luminosité en verticale »).
///
/// Elle règle la compensation d'exposition de l'objectif, en EV : bornée à
/// ±2 EV (l'objectif la borne encore à ce qu'il sert), neutre à 0, et revenue à
/// 0 quand l'objectif change ou que le viseur se rouvre. Glisser vers le HAUT
/// éclaire. Le curseur ne paraît que viseur armé : pendant une prise il se
/// cache, et l'édition n'a plus de caméra.
nonisolated enum ComposerExposureRule {

    static let limit: Float = 2
    static let neutral: Float = 0
    /// Le pas d'un balayage VoiceOver : un tiers d'EV, celui des appareils photo.
    static let accessibilityStep: Float = 1.0 / 3.0

    static func clamped(_ bias: Float) -> Float {
        guard bias.isFinite else { return neutral }
        return min(limit, max(-limit, bias))
    }

    /// Un pas VoiceOver, posé sur la grille des tiers d'EV.
    static func stepped(_ bias: Float, up: Bool) -> Float {
        let cran = (clamped(bias) / accessibilityStep).rounded() + (up ? 1 : -1)
        return clamped(cran * accessibilityStep)
    }

    /// La position du doigt sur la piste, du HAUT (+2 EV) au BAS (−2 EV).
    static func bias(atY y: CGFloat, height: CGFloat) -> Float {
        guard height > 0 else { return neutral }
        let part = Float(min(max(y / height, 0), 1))
        return clamped(limit - part * 2 * limit)
    }

    /// Où se pose le bouton sur la piste, de 0 (en haut) à 1 (en bas).
    static func thumbPosition(_ bias: Float) -> CGFloat {
        CGFloat((limit - clamped(bias)) / (2 * limit))
    }

    /// Le curseur ne règle que l'objectif qui vise : ni pendant une prise, ni
    /// en édition, ni viseur éteint.
    static func shows(stage: ComposerSceneCameraStage, editing: Bool) -> Bool {
        stage == .armed && !editing
    }

    /// Ce que VoiceOver lit : « +1 EV », « 0 EV », « −0,7 EV ».
    static func spokenValue(_ bias: Float) -> String {
        let valeur = Double(clamped(bias))
        let texte = valeur.formatted(.number.precision(.fractionLength(0...1)).sign(strategy: .always(includingZero: false)))
        return texte + " EV"
    }
}
