import SwiftUI

public nonisolated enum MeeshyMedallionKind: String, Sendable, Equatable, CaseIterable {
    case accent
    case ok
    case warn
    case err
    case neutral
}

/// La forme du médaillon : un disque, un carré arrondi, une forme festonnée à
/// neuf lobes ou un contour organique.
public nonisolated enum MeeshyMedallionShape: String, Sendable, Equatable, CaseIterable {
    case disc
    case squircle
    case scallop
    case blob
}

/// `soft` : la teinte à 16 à 30 % ; `solid` : un aplat ou un dégradé, encre sombre.
public nonisolated enum MeeshyMedallionFill: String, Sendable, Equatable, CaseIterable {
    case soft
    case solid
}

/// Un seul décor à la fois : le halo, l'anneau pointillé (la chose manque ou
/// attend), le trait barré (indisponible), les ondes (un à trois anneaux).
public nonisolated enum MeeshyMedallionDecor: Sendable, Equatable {
    case none
    case halo
    case dashed
    case struck
    case waves(count: Int)
}

/// Les six diamètres du médaillon.
public nonisolated enum MeeshyMedallionSize: Int, Sendable, Equatable, CaseIterable {
    case s24 = 24
    case s36 = 36
    case s44 = 44
    case s52 = 52
    case s64 = 64
    case s96 = 96
}

public nonisolated enum MeeshyMedallionState: String, Sendable, Equatable, CaseIterable {
    case normal
    case current
    case earned
    case locked
}

/// **La recette de K45 en VALEURS** : diamètre, rayon, glyphe, fond, décors. Le
/// médaillon n'est jamais interactif : aucune cible, aucun état pressé, aucun geste.
public nonisolated struct MeeshyMedallionRecipe: Sendable, Equatable {

    public static let squircleRadiusRatio: Double = 0.34
    public static let scallopLobes = 9
    public static let glyphMinimum: Double = 14
    public static let valueRatio: Double = 0.44
    public static let haloRatio: Double = 0.11
    public static let haloOpacityValue: Double = 0.07
    public static let dashedInsetRatio: Double = 0.11
    public static let dashedStroke: Double = 2
    public static let dashedTurn: Double = 40
    public static let strikeStroke: Double = 3
    public static let strikeLengthRatio: Double = 0.64
    public static let strikeAngleDegrees: Double = -45
    public static let strikeOutlineWidth: Double = 3
    public static let maximumWaves = 3
    public static let valueMaximumLength = 3
    public static let lockedOutline: Double = 1.5

    /// La valeur est figée au diamètre (pas au Dynamic Type) : un à trois caractères.
    public static func valueFont(size: CGFloat) -> Font {
        Font.system(size: size, weight: .black, design: .rounded)
    }

    public let kind: MeeshyMedallionKind
    public let shape: MeeshyMedallionShape
    public let fill: MeeshyMedallionFill
    public let decor: MeeshyMedallionDecor
    public let diameter: Double
    public let cornerRadius: Double
    public let glyphSize: Double
    public let valueSize: Double
    public let softOpacity: Double
    public let usesDarkInk: Bool
    public let haloThickness: Double
    public let haloOpacity: Double
    public let dashedInset: Double
    public let dashedLineWidth: Double
    public let dashedTurnSeconds: Double
    public let strikeLineWidth: Double
    public let strikeLength: Double
    public let strikeAngle: Double
    public let strikeOutline: Double
    public let waveCount: Int
    public let showsStillRing: Bool
    public let animates: Bool
    public let isLocked: Bool
    public let showsLockGlyph: Bool
    public let outlineWidth: Double

    public static func resolve(kind: MeeshyMedallionKind,
                               shape: MeeshyMedallionShape,
                               fill: MeeshyMedallionFill,
                               decor: MeeshyMedallionDecor,
                               size: MeeshyMedallionSize,
                               state: MeeshyMedallionState,
                               reduceMotion: Bool,
                               supportsShape: Bool) -> MeeshyMedallionRecipe {
        let isLocked = state == .locked
        let resolvedShape = drawnShape(shape, supportsShape: supportsShape)
        let resolvedFill: MeeshyMedallionFill = (state == .current || state == .earned) ? .solid : (isLocked ? .soft : fill)
        let resolvedDecor: MeeshyMedallionDecor = isLocked ? .none : decor
        let diameter = Double(size.rawValue)
        let waves = waveCount(of: resolvedDecor)
        let rotates = resolvedDecor == .dashed
        return MeeshyMedallionRecipe(
            kind: kind,
            shape: resolvedShape,
            fill: resolvedFill,
            decor: resolvedDecor,
            diameter: diameter,
            cornerRadius: cornerRadius(of: resolvedShape, diameter: diameter),
            glyphSize: max(diameter / 2, glyphMinimum),
            valueSize: diameter * valueRatio,
            softOpacity: softOpacity(of: kind),
            usesDarkInk: resolvedFill == .solid,
            haloThickness: resolvedDecor == .halo ? diameter * haloRatio : 0,
            haloOpacity: resolvedDecor == .halo ? haloOpacityValue : 0,
            dashedInset: isDashed(resolvedDecor) ? diameter * dashedInsetRatio : 0,
            dashedLineWidth: isDashed(resolvedDecor) ? dashedStroke : 0,
            dashedTurnSeconds: dashedTurn,
            strikeLineWidth: resolvedDecor == .struck ? strikeStroke : 0,
            strikeLength: resolvedDecor == .struck ? diameter * strikeLengthRatio : 0,
            strikeAngle: strikeAngleDegrees,
            strikeOutline: resolvedDecor == .struck ? strikeOutlineWidth : 0,
            waveCount: reduceMotion ? 0 : waves,
            showsStillRing: reduceMotion && waves > 0,
            animates: !reduceMotion && (waves > 0 || rotates),
            isLocked: isLocked,
            showsLockGlyph: isLocked,
            outlineWidth: isLocked ? lockedOutline : 0
        )
    }

    /// Une forme que la plateforme ne trace pas rend un disque de même diamètre.
    public static func drawnShape(_ shape: MeeshyMedallionShape, supportsShape: Bool) -> MeeshyMedallionShape {
        (shape == .scallop || shape == .blob) && !supportsShape ? .disc : shape
    }

    /// Une valeur d'un à trois caractères remplace le glyphe.
    public static func displayedValue(_ text: String?) -> String? {
        guard let text, !text.isEmpty else { return nil }
        return String(text.prefix(valueMaximumLength))
    }

    private static func cornerRadius(of shape: MeeshyMedallionShape, diameter: Double) -> Double {
        shape == .squircle ? diameter * squircleRadiusRatio : diameter / 2
    }

    private static func waveCount(of decor: MeeshyMedallionDecor) -> Int {
        guard case .waves(let requested) = decor else { return 0 }
        return min(max(requested, 1), maximumWaves)
    }

    private static func isDashed(_ decor: MeeshyMedallionDecor) -> Bool {
        decor == .dashed
    }

    private static func softOpacity(of kind: MeeshyMedallionKind) -> Double {
        switch kind {
        case .accent: return 0.18
        case .ok: return 0.16
        case .warn: return 0.2
        case .err: return 0.16
        case .neutral: return 0.3
        }
    }
}

/// Les mots de K45 : décoratif par défaut, une image nommée avec un `label`, et
/// le nom dit « verrouillé » quand il l'est.
public enum MeeshyMedallionWords {

    public static func spokenLabel(label: String?,
                                   isLocked: Bool,
                                   bundle: Bundle? = nil,
                                   locale: Locale = .current) -> String? {
        guard let label, !label.isEmpty else { return nil }
        guard isLocked else { return label }
        let locked = String(localized: "kit.medallion.locked", defaultValue: "verrouillé",
                            bundle: bundle ?? .module, locale: locale)
        return "\(label), \(locked)"
    }

    /// La rangée dit « 3 sur 5 » en un seul élément.
    public static func rowValue(earned: Int,
                                total: Int,
                                bundle: Bundle? = nil,
                                locale: Locale = .current) -> String {
        String(localized: "kit.medallion.row_value", defaultValue: "\(earned) sur \(total)",
               bundle: bundle ?? .module, locale: locale)
    }
}
