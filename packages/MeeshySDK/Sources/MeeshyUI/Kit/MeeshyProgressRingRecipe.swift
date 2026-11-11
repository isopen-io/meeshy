import SwiftUI

/// L'encre d'un anneau : celle du média, ou celle du thème quand l'hôte pose le
/// ton `theme`.
public nonisolated enum MeeshyProgressRingInk: Sendable, Equatable, CaseIterable {
    case onMedia
    case themeInk
}

/// **La recette de K09 en VALEURS** : toute mesure de l'anneau vit ici, nulle
/// part ailleurs. La géométrie vient de la fiche (trait, arc, chiffre, balayage).
///
/// - La fraction est bornée à 0…1 ; une valeur absente est indéterminée ; un
///   non-nombre vaut 0.
/// - Le trait vaut 1,5 sous 22 pt, sinon `diamètre / 11` borné de 3 à 6.
/// - L'arc dessiné vaut au moins 0,001 : un point à midi dès 0 %.
/// - Le chiffre n'existe qu'à partir de 22 pt, hors indéterminé, hors `center`
///   rempli et si le pourcentage est demandé ; le signe `%` dès 40 pt.
public nonisolated struct MeeshyProgressRingRecipe: Sendable, Equatable {
    /// Le balayage d'un arc indéterminé ou balayé : 18 % du cercle.
    public static let sweepFraction: Double = 0.18
    /// La durée tour d'un balayage : 1,1 s, linéaire, sans fin.
    public static let sweepDuration: Double = 1.1
    /// La durée de l'arc qui rejoint chaque nouvelle valeur : 200 ms, linéaire.
    public static let transitionDuration: Double = 0.2
    /// Le plancher de l'arc dessiné : un point à midi dès 0 %.
    public static let arcFloor: Double = 0.001
    /// Le diamètre minimal et maximal de l'anneau, au bord extérieur du trait.
    public static let diameterRange: ClosedRange<Double> = 10...120
    /// Sous ce diamètre : aucun chiffre.
    public static let digitsMinDiameter: Double = 22
    /// À partir de ce diamètre : le signe `%` et le chiffre grand.
    public static let signMinDiameter: Double = 40
    /// La piste à 30 % de l'encre, 60 % sous « Augmenter le contraste ».
    public static let trackOpacity: Double = MeeshyOpacity.medium
    public static let trackOpacityHighContrast: Double = 0.6

    /// La fraction bornée, `nil` quand la progression est inconnue.
    public let fraction: Double?
    public let diameter: Double
    public let stroke: Double
    public let radius: Double
    /// La part du cercle que l'arc dessine (balayage pour l'indéterminé).
    public let arcFraction: Double
    /// Le pourcentage entier, `nil` en indéterminé.
    public let percent: Int?
    /// Le chiffre affiché, `nil` quand il n'y en a pas.
    public let digits: Int?
    public let showsSign: Bool
    public let digitSize: CGFloat?
    public let isIndeterminate: Bool
    /// Vrai pour l'indéterminé et pour `sweeps` : le balayage est posé.
    public let sweeps: Bool
    /// Vrai quand le balayage tourne : jamais sous « réduire les animations ».
    public let spins: Bool
    public let trackOpacity: Double
    public let ink: MeeshyProgressRingInk
    public let reduceMotion: Bool

    public static func resolve(progress: Double?,
                               diameter: Double,
                               sweeps: Bool,
                               showsPercent: Bool,
                               hasCenter: Bool,
                               tone: MeeshyGlassTone?,
                               reduceMotion: Bool,
                               increasedContrast: Bool) -> MeeshyProgressRingRecipe {
        let bounded = min(max(diameter.isFinite ? diameter : diameterRange.lowerBound, diameterRange.lowerBound),
                          diameterRange.upperBound)
        let clamped = progress.map(clampFraction)
        let stroke = strokeWidth(diameter: bounded)
        let percent = clamped.map { Int(($0 * 100).rounded()) }
        let shown = (percent != nil && showsPercent && !hasCenter && bounded >= digitsMinDiameter) ? percent : nil
        let indeterminate = clamped == nil
        let arc = indeterminate ? sweepFraction : max(clamped ?? 0, arcFloor)
        return MeeshyProgressRingRecipe(
            fraction: clamped,
            diameter: bounded,
            stroke: stroke,
            radius: (bounded - stroke) / 2,
            arcFraction: arc,
            percent: percent,
            digits: shown,
            showsSign: shown != nil && bounded >= signMinDiameter,
            digitSize: shown == nil ? nil : (bounded >= signMinDiameter ? MeeshyFont.smallSize : MeeshyFont.microSize),
            isIndeterminate: indeterminate,
            sweeps: indeterminate || sweeps,
            spins: (indeterminate || sweeps) && !reduceMotion,
            trackOpacity: increasedContrast ? trackOpacityHighContrast : trackOpacity,
            ink: tone == .theme ? .themeInk : .onMedia,
            reduceMotion: reduceMotion
        )
    }

    /// Le trait : 1,5 sous 22 pt, puis `diamètre / 11` borné de 3 à 6.
    public static func strokeWidth(diameter: Double) -> Double {
        diameter < digitsMinDiameter ? 1.5 : min(max((diameter / 11).rounded(), 3), 6)
    }

    /// La fraction bornée : un non-nombre vaut 0, un dépassement est ramené.
    public static func clampFraction(_ value: Double) -> Double {
        value.isFinite ? min(max(value, 0), 1) : 0
    }

    /// L'arrivée d'une nouvelle valeur : linéaire 200 ms ; aucune sous « réduire
    /// les animations ».
    public var animation: Animation? {
        reduceMotion ? nil : .linear(duration: Self.transitionDuration)
    }

    /// La durée d'un tour du balayage.
    public var spinAnimation: Animation {
        .linear(duration: Self.sweepDuration).repeatForever(autoreverses: false)
    }
}

/// Les mots de K09 : la valeur dite. Le nom de l'opération reste à l'hôte.
public enum MeeshyProgressRingWords {

    /// La valeur dite, dans cet ordre : `valueText`, puis le pourcentage
    /// (« 62 % », chiffres du lecteur), puis « En cours » en indéterminé.
    public static func spokenValue(percent: Int?,
                                   valueText: String?,
                                   bundle: Bundle? = nil,
                                   locale: Locale = .current) -> String {
        if let valueText, !valueText.isEmpty { return valueText }
        guard let percent else {
            return String(
                localized: "kit.progress_ring.busy",
                defaultValue: "En cours",
                bundle: bundle ?? .module,
                locale: locale
            )
        }
        return "\(IntegerFormatStyle<Int>(locale: locale).format(percent)) %"
    }
}
