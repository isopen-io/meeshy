import Foundation

/// Les tailles de la rangée : compact (36), régulière (44), large (56), l'en-tête
/// d'une feuille (avatar de 56, titre de 22, jamais pressable) et la ligne dans
/// une phrase (avatar de 26).
public nonisolated enum MeeshyPersonRowSize: String, Sendable, Equatable, CaseIterable {
    case compact
    case regular
    case large
    case header
    case inline
}

/// Les trois tenues : normale, atténuée (avatar à 40 %, textes sourds, accessoire
/// vif) et fantôme (l'avatar cède sa place à un disque en pointillé).
public nonisolated enum MeeshyPersonRowOutfit: String, Sendable, Equatable, CaseIterable {
    case normal
    case muted
    case ghost
}

/// La sélection : aucune, un seul choix (point plein) ou plusieurs (coche).
public nonisolated enum MeeshyPersonRowSelection: Sendable, Equatable {
    case none
    case single(Bool)
    case multiple(Bool)
}

public nonisolated enum MeeshyPersonRowSelectionShape: String, Sendable, Equatable {
    case check
    case dot
}

/// **La recette de K39 en VALEURS** : la hauteur, la place de l'avatar, les
/// écarts, le retrait du filet, les polices, les opacités des tenues, la
/// sélection et la phrase dite. La rangée ne dessine aucune présence et n'en
/// garde aucune place : l'avatar est un emplacement de l'hôte.
public nonisolated struct MeeshyPersonRowRecipe: Sendable, Equatable {

    public static let leadingMargin: Double = 18
    public static let trailingMargin: Double = 18
    public static let avatarGap: Double = 14
    public static let subtitleFontSize: Double = 12.5
    public static let metaFontSize: Double = 16
    public static let metaDetailFontSize: Double = 11.5
    public static let titleAccessorySize: Double = 16
    public static let mutedAvatarOpacity: Double = 0.4
    public static let pressVeilOpacity: Double = 0.08
    public static let minimumTarget: Double = 44
    public static let largeTextScale: Double = 1.6

    public let size: MeeshyPersonRowSize
    public let avatarSize: Double
    public let leadingMargin: Double
    public let avatarGap: Double
    public let trailingMargin: Double
    public let dividerInset: Double
    public let rowHeight: Double
    public let titleFontSize: Double
    public let subtitleFontSize: Double
    public let metaFontSize: Double
    public let metaDetailFontSize: Double
    public let titleAccessorySize: Double
    public let avatarOpacity: Double
    public let isAvatarGhost: Bool
    public let isMutedText: Bool
    public let trailingOpacity: Double
    public let showsDivider: Bool
    public let isPressable: Bool
    public let pressVeil: Double
    public let pressScale: Double
    public let showsSelectionMark: Bool
    public let selectionShape: MeeshyPersonRowSelectionShape?
    public let isSelected: Bool
    public let metaBelowSubtitle: Bool

    public static func resolve(
        size: MeeshyPersonRowSize = .regular,
        outfit: MeeshyPersonRowOutfit = .normal,
        selection: MeeshyPersonRowSelection = .none,
        hasPress: Bool = false,
        isPressed: Bool = false,
        textScale: Double = 1
    ) -> MeeshyPersonRowRecipe {
        let avatar = avatarSize(for: size)
        let pressable = (hasPress || selection != .none) && size != .header
        return MeeshyPersonRowRecipe(
            size: size,
            avatarSize: avatar,
            leadingMargin: leadingMargin,
            avatarGap: avatarGap,
            trailingMargin: trailingMargin,
            dividerInset: leadingMargin + avatar + avatarGap,
            rowHeight: rowHeight(for: size),
            titleFontSize: titleFontSize(for: size),
            subtitleFontSize: subtitleFontSize,
            metaFontSize: metaFontSize,
            metaDetailFontSize: metaDetailFontSize,
            titleAccessorySize: titleAccessorySize,
            avatarOpacity: outfit == .muted ? mutedAvatarOpacity : 1,
            isAvatarGhost: outfit == .ghost,
            isMutedText: outfit != .normal,
            trailingOpacity: 1,
            showsDivider: size != .header && size != .inline,
            isPressable: pressable,
            pressVeil: pressable && isPressed ? pressVeilOpacity : 0,
            pressScale: 1,
            showsSelectionMark: selection != .none,
            selectionShape: shape(of: selection),
            isSelected: isSelected(selection),
            metaBelowSubtitle: textScale >= largeTextScale
        )
    }

    public static func avatarSize(for size: MeeshyPersonRowSize) -> Double {
        switch size {
        case .compact: return 36
        case .regular: return 44
        case .large, .header: return 56
        case .inline: return 26
        }
    }

    public static func rowHeight(for size: MeeshyPersonRowSize) -> Double {
        switch size {
        case .compact: return 52
        case .regular: return 64
        case .large: return 76
        case .header: return 88
        case .inline: return 32
        }
    }

    public static func titleFontSize(for size: MeeshyPersonRowSize) -> Double {
        switch size {
        case .header: return 22
        case .inline: return 13
        default: return 15
        }
    }

    /// Une seule phrase : les parties vides sont omises, dans l'ordre reçu.
    public static func spokenLabel(parts: [String?]) -> String {
        parts.compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ")
    }

    private static func shape(of selection: MeeshyPersonRowSelection) -> MeeshyPersonRowSelectionShape? {
        switch selection {
        case .none: return nil
        case .single: return .dot
        case .multiple: return .check
        }
    }

    private static func isSelected(_ selection: MeeshyPersonRowSelection) -> Bool {
        switch selection {
        case .none: return false
        case .single(let value), .multiple(let value): return value
        }
    }
}
