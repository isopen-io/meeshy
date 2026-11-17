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
    /// La bulle ancrée à un avatar : rayon 18, queue de 6 au coin du bas du bord de début.
    public static let bubbleRadius: Double = 18
    public static let bubbleTail: Double = 6
    /// Le code court (pays) : un carré arrondi de 7, en chasse fixe.
    public static let codeRadius: Double = 7

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
    /// Le rayon du coin de la queue ; `nil` sans queue.
    public let tailRadius: Double?
    /// Pleinement arrondie quelle que soit sa hauteur (le Dynamic Type peut la grandir).
    public let isCapsule: Bool

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
                               isPressed: Bool,
                               isCode: Bool = false) -> MeeshyBadgeRecipe {
        let measures = measures(of: size)
        let height = Double(size.rawValue)
        let hasTail = shape == .bubble
        return MeeshyBadgeRecipe(
            kind: kind,
            surface: surface,
            height: height,
            fontSize: measures.font,
            horizontalPadding: measures.padding,
            cornerRadius: cornerRadius(height: height, hasTail: hasTail, isMultiline: isMultiline, isCode: isCode),
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
            hasTail: hasTail,
            tailRadius: hasTail ? bubbleTail : nil,
            isCapsule: !hasTail && !isMultiline && !isCode
        )
    }

    private static func cornerRadius(height: Double, hasTail: Bool, isMultiline: Bool, isCode: Bool) -> Double {
        if hasTail { return bubbleRadius }
        if isMultiline { return multilineRadius }
        return isCode ? codeRadius : height / 2
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

/// Les mots de K41 : le nom dit d'une pastille. Le texte vu est déjà traduit par
/// l'hôte ; seul le quota se compose ici, dans la langue du lecteur.
public enum MeeshyBadgeWords {

    /// Le nom dit : le `label` de l'hôte d'abord ; un compte dit son vrai nombre
    /// (« 2 sur 3 » pour un quota) ; un glyphe sans nom se tait (`nil`).
    public static func spokenName(content: MeeshyBadgeContent,
                                  total: Int? = nil,
                                  label: String? = nil,
                                  bundle: Bundle? = nil,
                                  locale: Locale = .current) -> String? {
        if let label, !label.isEmpty { return label }
        switch content {
        case .label(let text), .code(let text), .time(let text):
            return text.isEmpty ? nil : text
        case .ordinal(let rank):
            return rank > 0 ? "#\(rank)" : nil
        case .glyph:
            return nil
        case .count(let count):
            guard let spoken = MeeshyBadgeCount.spoken(count) else { return nil }
            guard let total else { return "\(spoken)" }
            return String(localized: "kit.badge.count_of", defaultValue: "\(spoken) sur \(total)",
                          bundle: bundle ?? .module, locale: locale)
        }
    }
}
