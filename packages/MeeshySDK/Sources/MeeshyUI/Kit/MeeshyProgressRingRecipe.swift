import SwiftUI
import UIKit

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
    /// Le chiffre se réduit jusqu'à 60 % plutôt que déborder du cercle intérieur.
    public static let digitsMinimumScale: CGFloat = 0.6
    /// Le contraste minimal de l'arc (objet graphique) contre son fond.
    public static let arcMinContrast: Double = 3

    /// La fraction bornée, `nil` quand la progression est inconnue.
    public let fraction: Double?
    public let diameter: Double
    public let stroke: Double
    public let radius: Double
    /// Le cercle intérieur au trait : la boîte du chiffre et de `center`.
    public let innerDiameter: Double
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
            innerDiameter: bounded - 2 * stroke,
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

    /// L'encre de l'anneau : celle du média, ou celle du thème.
    public func inkColor(isDark: Bool) -> Color {
        switch ink {
        case .onMedia: return MeeshyColors.onMedia
        case .themeInk: return MeeshyColors.textPrimary(isDark: isDark)
        }
    }

    /// L'arrivée d'une nouvelle valeur : linéaire 200 ms ; aucune sous « réduire
    /// les animations ».
    public var animation: Animation? {
        Self.arcAnimation(animates: !reduceMotion)
    }

    /// L'arc rejoint sa valeur en 200 ms, linéaire, ou y saute.
    public static func arcAnimation(animates: Bool) -> Animation? {
        animates ? .linear(duration: transitionDuration) : nil
    }

    /// Un tour du balayage : 1,1 s, linéaire, sans fin.
    public static var spinAnimation: Animation {
        .linear(duration: sweepDuration).repeatForever(autoreverses: false)
    }

    /// Le pourcentage dans les chiffres et la ponctuation de la langue
    /// (« 62 % », « 62% », « ٦٢٪ »).
    public static func percentText(_ percent: Int, locale: Locale) -> String {
        FloatingPointFormatStyle<Double>.Percent(locale: locale)
            .precision(.fractionLength(0))
            .format(Double(percent) / 100)
    }

    /// Le chiffre affiché : nombre seul de 22 à 39, pourcentage localisé dès 40.
    public static func digitsText(_ digits: Int, showsSign: Bool, locale: Locale) -> String {
        showsSign ? percentText(digits, locale: locale) : IntegerFormatStyle<Int>(locale: locale).format(digits)
    }

    /// Le contraste WCAG d'une encre posée sur le disque d'ombre, au pire cas :
    /// le disque au-dessus d'une image blanche.
    public static func scrimContrast(of ink: Color) -> Double {
        let scrim = UIColor(MeeshyColors.scrim)
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        guard scrim.getRed(&red, green: &green, blue: &blue, alpha: &alpha) else { return 0 }
        func over(_ channel: CGFloat) -> Double { Double(alpha * channel + (1 - alpha)) }
        let backdrop = CanvasChromeScheme.luminance(red: over(red), green: over(green), blue: over(blue))
        return CanvasChromeScheme.contrastRatio(Double(ink.luminance), backdrop)
    }

    /// Le contraste WCAG le plus faible d'une encre sur des arrêts de couleur.
    public static func worstContrast(of ink: Color, on stops: [Color]) -> Double {
        let inkLuminance = Double(ink.luminance)
        return stops
            .map { CanvasChromeScheme.contrastRatio(inkLuminance, Double($0.luminance)) }
            .min() ?? 0
    }
}

/// Les mots de K09 : la valeur dite. Le nom de l'opération reste à l'hôte.
public enum MeeshyProgressRingWords {

    /// La valeur dite, dans cet ordre : `valueText`, puis le pourcentage
    /// (« 62 % », chiffres et ponctuation du lecteur), puis « En cours » en
    /// indéterminé. Jamais dans le nom.
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
        return MeeshyProgressRingRecipe.percentText(percent, locale: locale)
    }
}
