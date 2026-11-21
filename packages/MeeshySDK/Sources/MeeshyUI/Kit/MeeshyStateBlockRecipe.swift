import SwiftUI

/// Les quatre absences et le succès : l'app lit son état et choisit le genre.
public nonisolated enum MeeshyStateBlockKind: String, Sendable, Equatable, CaseIterable {
    case empty
    case error
    case denied
    case offline
    case success
}

/// La forme : un bloc plein écran, ou une rangée dans un écran qui continue.
public nonisolated enum MeeshyStateBlockSize: Sendable, Equatable {
    case regular
    case compact
}

/// Le rôle de la teinte du glyphe : un rôle, jamais une couleur en dur.
public nonisolated enum MeeshyStateBlockTone: String, Sendable, Equatable, CaseIterable {
    case accent
    case error
    case warning
    case neutral
    case success
}

/// Le gabarit du fantôme : la silhouette pointillée du composant qui manque.
public nonisolated enum MeeshyStateGhostTemplate: String, Sendable, Equatable, CaseIterable {
    case ticket
    case row
    case tile
    case pin
}

/// Une tuile fantôme LÉGENDÉE : ce qu'on pourrait poser là (« réel », « photo », « Site »), son glyphe et son mot.
public nonisolated struct MeeshyStateGhostTile: Sendable, Equatable, Hashable {
    public let systemImage: String
    public let caption: String

    public init(systemImage: String, caption: String) {
        self.systemImage = systemImage
        self.caption = caption
    }
}

/// L'image du bloc : un fantôme, une rangée de tuiles fantômes légendées, le glyphe seul de l'hôte, ou rien.
public nonisolated enum MeeshyStateArt: Sendable, Equatable {
    case ghost(MeeshyStateGhostTemplate, count: Int)
    case ghostTiles([MeeshyStateGhostTile])
    case glyph
    case none
}

/// Une sortie : un titre déjà traduit, un glyphe, un état d'attente et l'action de l'hôte.
public struct MeeshyStateBlockAction {
    public let title: String
    public let systemImage: String?
    public let isPending: Bool
    public let perform: () -> Void

    public init(title: String, systemImage: String? = nil, isPending: Bool = false, perform: @escaping () -> Void) {
        self.title = title
        self.systemImage = systemImage
        self.isPending = isPending
        self.perform = perform
    }
}

/// **La recette de K38 en VALEURS** : ce que le genre exige, ce que la forme
/// retire, ce que la sortie devient. `resolve` REFUSE (nil) un bloc qui serait un
/// cul-de-sac : une erreur sans « Réessayer », un vide plein écran sans sortie.
public nonisolated struct MeeshyStateBlockRecipe: Sendable, Equatable {

    public static let primaryHeight: Double = 50
    public static let secondaryHeight: Double = 44
    public static let compactRowHeight: Double = 60
    public static let glyphDiameter: Double = 60
    public static let glyphSize: Double = 28
    public static let glyphFloat: Double = 5
    public static let artMaxHeight: Double = 160
    public static let messageMaxWidth: Double = 310
    public static let titleMaxLines = 2
    public static let maxGhostCount = 4
    public static let maxConsequences = 4

    public let kind: MeeshyStateBlockKind
    public let tone: MeeshyStateBlockTone
    public let defaultSystemImage: String
    public let announcesOnAppear: Bool
    public let hapticOnEnter: Bool
    public let showsArt: Bool
    public let showsHalo: Bool
    public let showsMessage: Bool
    public let showsPrimary: Bool
    public let showsSecondary: Bool
    public let secondaryIsPromoted: Bool
    public let primaryIsEnabled: Bool
    public let rowHeight: Double?
    public let primaryHeight: Double
    public let secondaryHeight: Double

    public static func resolve(kind: MeeshyStateBlockKind,
                               size: MeeshyStateBlockSize,
                               hasPrimary: Bool,
                               hasSecondary: Bool,
                               hasMessage: Bool,
                               isPending: Bool,
                               isOverContent: Bool,
                               isDark: Bool,
                               reduceTransparency: Bool) -> MeeshyStateBlockRecipe? {
        let isRegular = size == .regular
        if kind == .error && !hasPrimary { return nil }
        if kind == .empty && isRegular && !hasPrimary { return nil }
        let drawsArt = isRegular && !isOverContent
        return MeeshyStateBlockRecipe(
            kind: kind,
            tone: tone(of: kind),
            defaultSystemImage: systemImage(of: kind),
            announcesOnAppear: announces(kind),
            hapticOnEnter: kind == .error,
            showsArt: drawsArt,
            showsHalo: drawsArt && isDark && !reduceTransparency,
            showsMessage: hasMessage && isRegular,
            showsPrimary: hasPrimary,
            showsSecondary: hasSecondary,
            secondaryIsPromoted: !hasPrimary && hasSecondary,
            primaryIsEnabled: !isPending,
            rowHeight: isRegular ? nil : compactRowHeight,
            primaryHeight: primaryHeight,
            secondaryHeight: secondaryHeight
        )
    }

    public static func tone(of kind: MeeshyStateBlockKind) -> MeeshyStateBlockTone {
        switch kind {
        case .empty: return .accent
        case .error: return .error
        case .denied: return .warning
        case .offline: return .neutral
        case .success: return .success
        }
    }

    public static func systemImage(of kind: MeeshyStateBlockKind) -> String {
        switch kind {
        case .empty: return "tray"
        case .error: return "exclamationmark.circle"
        case .denied: return "lock"
        case .offline: return "wifi.slash"
        case .success: return "checkmark.circle"
        }
    }

    /// Le glyphe du disque : celui que l'hôte nomme (« Personne ici », « Bloqué »), sinon celui du genre.
    public static func glyph(of kind: MeeshyStateBlockKind, override: String?) -> String {
        guard let override, !override.isEmpty else { return systemImage(of: kind) }
        return override
    }

    /// Les lignes-conséquences : le succès dit ce qui est fait, le refus ce qui est fermé (« Il ne peut plus
    /// t'écrire ») ; au plus quatre, et aucun autre genre n'en porte.
    public static func shownConsequences(_ lines: [String], kind: MeeshyStateBlockKind) -> [String] {
        guard kind == .success || kind == .denied else { return [] }
        return Array(lines.filter { !$0.isEmpty }.prefix(maxConsequences))
    }

    /// Le glyphe d'une ligne-conséquence : une coche pour ce qui est fait, un tiret pour ce qui est fermé.
    public static func consequenceSystemImage(of kind: MeeshyStateBlockKind) -> String {
        kind == .denied ? "minus.circle" : "checkmark"
    }

    /// Les genres qui s'annoncent : une erreur, un passage hors ligne.
    public static func announces(_ kind: MeeshyStateBlockKind) -> Bool {
        kind == .error || kind == .offline
    }

    /// Un bloc qui change de genre sur place s'annonce si le nouveau genre s'annonce,
    /// jamais deux fois pour le même genre.
    public static func announcesTransition(from old: MeeshyStateBlockKind, to new: MeeshyStateBlockKind) -> Bool {
        old != new && announces(new)
    }

    /// Les fantômes d'une image : de 1 à 4 silhouettes.
    public static func ghostCount(_ requested: Int) -> Int {
        min(max(requested, 1), maxGhostCount)
    }

    /// Les tuiles légendées montrées : au plus 4, dans l'ordre de l'hôte, sans légende vide.
    public static func shownGhostTiles(_ tiles: [MeeshyStateGhostTile]) -> [MeeshyStateGhostTile] {
        Array(tiles.filter { !$0.caption.isEmpty && !$0.systemImage.isEmpty }.prefix(maxGhostCount))
    }

    /// Le flottement du glyphe : un va-et-vient lent, arrêté sous mouvement réduit.
    public static func floatAnimation(reduce: Bool) -> Animation? {
        reduce ? nil : .easeInOut(duration: 2.4).repeatForever(autoreverses: true)
    }
}
