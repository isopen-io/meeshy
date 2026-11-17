import SwiftUI

/// La précision d'une position : un point exact, ou une zone dont le rayon est
/// DÉJÀ mesuré en points d'écran par l'hôte (l'épingle ne convertit aucun mètre).
public nonisolated enum MeeshyMapPinPrecision: Sendable, Equatable {
    case exact
    case area(radius: Double)
    case wide(radius: Double)

    /// Le rayon à l'écran ; `exact` n'en a pas. `area` et `wide` se dessinent pareil.
    public var radius: Double {
        switch self {
        case .exact: return 0
        case .area(let radius), .wide(let radius): return radius.isFinite ? max(radius, 0) : 0
        }
    }
}

/// Une personne, moi, ou un repère fantôme (contour pointillé, ni disque ni onde).
public nonisolated enum MeeshyMapPinKind: String, Sendable, Equatable, CaseIterable {
    case other
    case own
    case ghost
}

/// **La recette de K36 en VALEURS** : tailles, disque de flou, onde, pointe,
/// anneau de sélection, appui. Aucune couleur (la teinte vient de l'hôte), aucune
/// coordonnée, aucune personne.
public nonisolated struct MeeshyMapPinRecipe: Sendable, Equatable {

    public static let defaultDiameter: Double = 48
    public static let selectedDiameter: Double = 56
    public static let ownDiameter: Double = 38
    public static let minimumTarget: Double = 44
    public static let rimWidth: Double = 3
    public static let ownRimWidth: Double = 2.5
    /// Sous ce rayon, le disque ne dépasserait pas l'épingle : il n'est pas dessiné.
    public static let discMinimumRadius: Double = 32
    public static let discOpacity: Double = 0.18
    public static let selectedDiscOpacity: Double = 0.28
    public static let discBorderWidth: Double = 1.5
    public static let discBreathAmplitude: Double = 0.05
    public static let discBreathSeconds: Double = 5
    public static let waveRingWidth: Double = 2
    public static let waveInset: Double = 6
    public static let waveScaleFrom: Double = 0.7
    public static let waveScaleTo: Double = 2.3
    public static let waveSeconds: Double = 2.4
    public static let tipSide: Double = 14
    public static let pressedScale: Double = 0.94
    public static let captionLimit = 18
    public static let clusterCellDiameter: Double = 36
    public static let clusterOverlap: Double = 8
    public static let clusterMaxContents = 3
    public static let clusterCountCeiling = 99

    public let contentDiameter: Double
    public let rimWidth: Double
    public let hitTarget: Double
    public let showsWave: Bool
    public let waveIsPermanent: Bool
    public let showsDisc: Bool
    public let discDiameter: Double
    public let discOpacity: Double
    public let discIsDashed: Bool
    public let showsTip: Bool
    public let tipIsWhite: Bool
    public let showsSelectionRing: Bool
    public let isGrayed: Bool
    public let pressScale: Double

    public static func resolve(kind: MeeshyMapPinKind,
                               precision: MeeshyMapPinPrecision,
                               isLive: Bool,
                               isSelected: Bool,
                               isStale: Bool,
                               isPressed: Bool,
                               reduceMotion: Bool) -> MeeshyMapPinRecipe {
        let isOther = kind == .other
        let selected = isSelected && isOther
        let size = diameterFor(kind: kind, isSelected: selected)
        let radius = precision.radius
        let drawsDisc = isOther && radius >= discMinimumRadius
        let permanent = kind == .own
        return MeeshyMapPinRecipe(
            contentDiameter: size,
            rimWidth: kind == .own ? ownRimWidth : rimWidth,
            hitTarget: max(minimumTarget, size),
            showsWave: permanent || (isOther && isLive && !isStale),
            waveIsPermanent: permanent,
            showsDisc: drawsDisc,
            discDiameter: drawsDisc ? radius * 2 : 0,
            discOpacity: selected ? selectedDiscOpacity : discOpacity,
            discIsDashed: isStale,
            showsTip: isOther && radius == 0,
            tipIsWhite: selected,
            showsSelectionRing: selected,
            isGrayed: isStale && isOther,
            pressScale: isPressed ? pressedScale : 1
        )
    }

    private static func diameterFor(kind: MeeshyMapPinKind, isSelected: Bool) -> Double {
        switch kind {
        case .own: return ownDiameter
        case .ghost: return defaultDiameter
        case .other: return isSelected ? selectedDiameter : defaultDiameter
        }
    }

    /// La légende : un mot, une ligne, coupée à 18 caractères ; vide ⇒ rien.
    public static func caption(_ text: String?) -> String? {
        guard let text else { return nil }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        guard trimmed.count > captionLimit else { return trimmed }
        let head = trimmed.prefix(captionLimit - 1).trimmingCharacters(in: .whitespaces)
        return head + "\u{2026}"
    }

    /// Le compte d'une grappe : rien sous 2, « 99+ » au-delà de 99.
    public static func clusterCountText(_ count: Int) -> String? {
        guard count >= 2 else { return nil }
        return count > clusterCountCeiling ? "\(clusterCountCeiling)+" : "\(count)"
    }

    /// Les contenus montrés d'une grappe : trois au plus, aucun sous 2.
    public static func clusterContentCount(_ count: Int) -> Int {
        guard count >= 2 else { return 0 }
        return min(count, clusterMaxContents)
    }

    /// La pose : un ressort `rise` ; sous mouvement réduit, un fondu de 150 ms.
    public static func appearAnimation(reduce: Bool) -> Animation {
        reduce ? .easeOut(duration: 0.15) : .spring(response: 0.48, dampingFraction: 0.62)
    }

    /// La sélection et le changement de précision suivent `morph`.
    public static func morphAnimation(reduce: Bool) -> Animation? {
        reduce ? nil : .spring(response: 0.32, dampingFraction: 0.7)
    }
}
