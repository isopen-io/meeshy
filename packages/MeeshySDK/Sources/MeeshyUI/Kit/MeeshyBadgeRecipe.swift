import Foundation

/// Les quatre hauteurs de la pastille : 18 en coin, 22 en ligne, 28 sur une
/// rangée, 36 sur une bannière.
public nonisolated enum MeeshyBadgeSize: Int, Sendable, Equatable, CaseIterable {
    case s18 = 18
    case s22 = 22
    case s28 = 28
    case s36 = 36
}

public nonisolated enum MeeshyBadgeSurface: String, Sendable, Equatable, CaseIterable {
    case glass
    case tonal
    case solid
    case outline
}

/// Un SENS, pas une couleur : `ok` dit acquis, `warn` à faire, `err` un compte à
/// rattraper, `accent` « de cette personne », `neutral` dit seulement.
public nonisolated enum MeeshyBadgeKind: String, Sendable, Equatable, CaseIterable {
    case neutral
    case accent
    case ok
    case warn
    case err
}

/// `bubble` pose la queue au bord de début, en bas.
public nonisolated enum MeeshyBadgeShape: String, Sendable, Equatable, CaseIterable {
    case capsule
    case bubble
}

/// **La loi du compte** : le portillon, le plafond « 99+ » et le vrai nombre dit.
/// Une seule loi pour toutes les pastilles de compte.
public nonisolated enum MeeshyBadgeCount {
    public static let defaultCap = 99

    /// Un compte à zéro ou négatif ne rend rien et ne réserve aucune place.
    public static func isVisible(_ count: Int) -> Bool {
        count > 0
    }

    /// Le texte vu : le nombre, ou « cap+ » au-delà du plafond. Jamais `min(count, cap)`.
    public static func text(_ count: Int, cap: Int = defaultCap) -> String? {
        guard isVisible(count) else { return nil }
        return count > cap ? "\(cap)+" : "\(count)"
    }

    /// Le nombre dit : le vrai, jamais le plafond.
    public static func spoken(_ count: Int, cap: Int = defaultCap) -> Int? {
        isVisible(count) ? count : nil
    }
}

/// **La recette de K41 en VALEURS** : rayon, marges, corps, fond, filet. Aucune
/// couleur : le sens (`kind`) est un rôle que la vue habille, et le verre ne vient
/// que de K01.
public nonisolated struct MeeshyBadgeRecipe: Sendable, Equatable {

    /// La teinte du fond tonal : le sens à 16 %.
    public static let tonalPercent = 16
    public static let staleOpacity: Double = 0.62
    public static let tapTarget: Double = 44
    public static let multilineRadius: Double = 14
    public static let outlineWidth: Double = 1
    public static let currentBorderWidth: Double = 1.5

    public let kind: MeeshyBadgeKind
    public let surface: MeeshyBadgeSurface
    public let height: Double
    public let fontSize: Double
    public let horizontalPadding: Double
    public let cornerRadius: Double
    public let minimumWidth: Double
    public let fillOpacity: Double
    public let borderWidth: Double
    public let usesGlass: Bool
    public let usesAmbientAccent: Bool
    public let opacity: Double
    public let isDesaturated: Bool
    public let isButton: Bool
    public let tapHeight: Double
    public let fillsWidth: Bool
    public let isPressed: Bool
    public let hasTail: Bool

    /// Le sens d'un compte : à rattraper, il est rouge (`err`), jamais à l'accent
    /// de la conversation (#6080).
    public static func countKind(isOverdue: Bool) -> MeeshyBadgeKind {
        isOverdue ? .err : .neutral
    }

    public static func resolve(surface: MeeshyBadgeSurface,
                               kind: MeeshyBadgeKind,
                               hasTint: Bool,
                               size: MeeshyBadgeSize,
                               shape: MeeshyBadgeShape,
                               isMultiline: Bool,
                               isCurrent: Bool,
                               isStale: Bool,
                               isInteractive: Bool,
                               isPressed: Bool) -> MeeshyBadgeRecipe {
        let measures = measures(of: size)
        let height = Double(size.rawValue)
        return MeeshyBadgeRecipe(
            kind: kind,
            surface: surface,
            height: height,
            fontSize: measures.font,
            horizontalPadding: measures.padding,
            cornerRadius: isMultiline ? multilineRadius : height / 2,
            minimumWidth: height,
            fillOpacity: fillOpacity(of: surface),
            borderWidth: borderWidth(surface: surface, isCurrent: isCurrent),
            usesGlass: surface == .glass,
            usesAmbientAccent: kind == .accent && !hasTint,
            opacity: isStale ? staleOpacity : 1,
            isDesaturated: isStale,
            isButton: isInteractive,
            tapHeight: isInteractive ? max(height, tapTarget) : height,
            fillsWidth: isMultiline,
            isPressed: isPressed,
            hasTail: shape == .bubble
        )
    }

    private static func measures(of size: MeeshyBadgeSize) -> (font: Double, padding: Double) {
        switch size {
        case .s18: return (10.5, 6)
        case .s22: return (11.5, 8)
        case .s28: return (13, 10)
        case .s36: return (14, 14)
        }
    }

    private static func fillOpacity(of surface: MeeshyBadgeSurface) -> Double {
        switch surface {
        case .tonal: return Double(tonalPercent) / 100
        case .solid: return 1
        case .glass, .outline: return 0
        }
    }

    private static func borderWidth(surface: MeeshyBadgeSurface, isCurrent: Bool) -> Double {
        let base = surface == .outline ? outlineWidth : 0
        return isCurrent ? max(base + 1, currentBorderWidth) : base
    }
}
