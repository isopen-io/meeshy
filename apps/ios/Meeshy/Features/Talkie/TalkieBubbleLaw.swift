import CoreGraphics
import Foundation
import SwiftUI

/// Le gabarit de la bulle (#20531) : `baseRadius` est le bord extérieur de l'anneau ou du cadre du héros, et
/// `maxAmplitude` la hauteur d'une bande à 1 — la bulle ne sort jamais de `baseRadius + maxAmplitude`.
nonisolated struct TalkieBubbleGeometry: Equatable, Sendable {
    let baseRadius: CGFloat
    let maxAmplitude: CGFloat
    var response: TalkieBubbleResponse = .linear
}

/// Ce qu'une bande devient avant de pousser le contour (2026-11-25). Le hero garde la bande telle quelle ; les orbes des
/// boutons répondent à la VOIX : une bande à −40 dBFS (0,2) atteint la moitié de l'amplitude, en racine, qui lève le
/// faible sans écraser le fort. Une valeur non finie compte pour 0, et le résultat reste dans 0…1.
nonisolated enum TalkieBubbleResponse: Equatable, Sendable {
    case linear
    case voice

    /// La bande qui atteint la moitié de l'amplitude sous la réponse « voix ».
    static let voiceHalfLevel: Float = 0.2

    func level(_ band: Float) -> CGFloat {
        guard band.isFinite else { return 0 }
        let clamped = min(1, max(0, band))
        switch self {
        case .linear:
            return CGFloat(clamped)
        case .voice:
            return CGFloat(min(1, clamped / (4 * Self.voiceHalfLevel)).squareRoot())
        }
    }
}

/// La forme de la bulle spectrale (#20531) : 120 bandes deviennent 120 pointes autour du héros, puis le contour
/// fermé qui les relie. Pure et appelée à chaque image : un seul tableau de 120 points, aucun état.
nonisolated enum TalkieBubbleLaw {

    static let bandCount = 120

    /// Une pointe par bande : la bande i est à `2π·i/120 − π/2` (le grave en haut, sens horaire vers l'aigu), au
    /// rayon `baseRadius + maxAmplitude·bande`. Une valeur non finie compte pour 0, une bande hors 0…1 est bornée,
    /// les bandes manquantes valent 0 et les surnuméraires sont ignorées.
    static func tips(bands: [Float], geometry: TalkieBubbleGeometry, center: CGPoint) -> [CGPoint] {
        (0..<bandCount).map { index in
            let level = index < bands.count ? geometry.response.level(bands[index]) : 0
            let radius = geometry.baseRadius + geometry.maxAmplitude * level
            let angle = 2 * Double.pi * Double(index) / Double(bandCount) - Double.pi / 2
            return CGPoint(x: center.x + radius * CGFloat(cos(angle)), y: center.y + radius * CGFloat(sin(angle)))
        }
    }

    /// Une Catmull-Rom fermée (tension 0,5) en Bézier cubiques, dont les points de contrôle sont bornés radialement à `[baseRadius, baseRadius + maxAmplitude]`
    /// autour du centre : une Bézier reste dans l'enveloppe convexe de ses points de contrôle, donc le contour ne
    /// sort jamais de la bulle ni ne rentre dans le héros. Le bornage peut rompre la continuité C1 aux marches du spectre, par construction.
    static func outline(tips: [CGPoint], geometry: TalkieBubbleGeometry, center: CGPoint) -> Path {
        let lowest = geometry.baseRadius
        let highest = geometry.baseRadius + geometry.maxAmplitude
        return outline(tips: tips) { control in
            let dx = control.x - center.x
            let dy = control.y - center.y
            let radius = hypot(dx, dy)
            guard radius > 0 else { return control }
            let bounded = min(highest, max(lowest, radius))
            guard bounded != radius else { return control }
            let scale = bounded / radius
            return CGPoint(x: center.x + dx * scale, y: center.y + dy * scale)
        }
    }

    /// L'épaisseur du trait quand le mouvement est réduit : de 2 pt (silence) à 6 pt (pleine voix).
    static func reducedMotionStroke(level: Float) -> CGFloat {
        2 + 4 * clampedLevel(level)
    }

    /// Le niveau d'ensemble de la voix sous « réduire les animations » : la moyenne des bandes, chacune bornée comme
    /// une pointe (non finie = 0, hors 0…1 bornée) ; aucune bande = silence.
    static func meanLevel(bands: [Float]) -> Float {
        guard !bands.isEmpty else { return 0 }
        let total = bands.reduce(CGFloat(0)) { $0 + clampedLevel($1) }
        return Float(total / CGFloat(bands.count))
    }

    /// Le même tracé SANS bornage : réservé aux tests, qui prouvent que c'est le bornage qui tient la borne.
    static func unclampedOutlineForTesting(tips: [CGPoint]) -> Path {
        outline(tips: tips) { $0 }
    }

    private static func clampedLevel(_ value: Float) -> CGFloat {
        guard value.isFinite else { return 0 }
        return CGFloat(min(1, max(0, value)))
    }

    private static func outline(tips: [CGPoint], control: (CGPoint) -> CGPoint) -> Path {
        let count = tips.count
        guard count >= 3 else { return Path() }
        let tension: CGFloat = 0.5 / 3
        var path = Path()
        path.move(to: tips[0])
        for index in 0..<count {
            let before = tips[(index + count - 1) % count]
            let from = tips[index]
            let to = tips[(index + 1) % count]
            let after = tips[(index + 2) % count]
            let first = CGPoint(x: from.x + (to.x - before.x) * tension, y: from.y + (to.y - before.y) * tension)
            let second = CGPoint(x: to.x - (after.x - from.x) * tension, y: to.y - (after.y - from.y) * tension)
            path.addCurve(to: to, control1: control(first), control2: control(second))
        }
        path.closeSubpath()
        return path
    }
}
