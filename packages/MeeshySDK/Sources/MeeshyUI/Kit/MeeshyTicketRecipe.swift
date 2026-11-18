import Foundation

/// Les quatre tailles du billet : héros, rangée de liste, compact (un rail),
/// mini (vertical, pour un rail).
public nonisolated enum MeeshyTicketSize: String, Sendable, Equatable, CaseIterable {
    case hero
    case row
    case compact
    case mini
}

/// Les genres : normal, brouillon (se met à jour à la saisie), fantôme (dit ce qui
/// manque), barré (terminal : expiré, désactivé), chargement.
public nonisolated enum MeeshyTicketKind: String, Sendable, Equatable, CaseIterable {
    case normal
    case draft
    case ghost
    case struck
    case loading
}

/// Le rôle du fond : relevé, éclairci à l'appui, ou absent (le fantôme).
public nonisolated enum MeeshyTicketFill: String, Sendable, Equatable {
    case raised
    case field
    case none
}

/// **La recette de K30 en VALEURS** : la coupe par taille, la découpe, les
/// polices, les états (pressé, survolé, soulevé, sélectionné), le retournement et
/// l'encre de la pastille choisie au contraste. Aucune vue, aucune couleur nommée.
public nonisolated struct MeeshyTicketRecipe: Sendable, Equatable {

    public static let cornerRadius: Double = 22
    public static let notchDiameter: Double = 18
    public static let dashLineWidth: Double = 1.5
    public static let dashPattern: [Double] = [6, 4]
    public static let cutMargin: Double = 16
    public static let flipCrossfadeMilliseconds: Int = 160
    public static let pressedScale: Double = 0.97
    public static let draggingScale: Double = 1.03
    public static let draggingTilt: Double = 2.5
    public static let hoverLift: Double = 4
    public static let selectedBorderWidth: Double = 2
    public static let restBorderWidth: Double = 1
    public static let flipLift: Double = 1.05
    public static let darkInkHex = "0B0B12"

    public let size: MeeshyTicketSize
    public let kind: MeeshyTicketKind
    public let cut: Double
    public let cornerRadius: Double
    public let notchDiameter: Double
    public let dashLineWidth: Double
    public let dashPattern: [Double]
    public let cutMargin: Double
    public let codeFontSize: Double
    public let pastilleSize: Double
    public let glyphSize: Double
    public let width: Double?
    public let scale: Double
    public let tilt: Double
    public let lift: Double
    public let borderWidth: Double
    public let isBorderDashed: Bool
    public let fill: MeeshyTicketFill
    public let isStruck: Bool
    public let showsContent: Bool
    public let showsBack: Bool
    public let flipRotation: Double
    public let flipCrossfades: Bool

    public static func resolve(
        size: MeeshyTicketSize,
        kind: MeeshyTicketKind = .normal,
        isSelected: Bool = false,
        isPressed: Bool = false,
        isHovered: Bool = false,
        isDragging: Bool = false,
        isFlipped: Bool = false,
        reduceMotion: Bool = false
    ) -> MeeshyTicketRecipe {
        let isGhost = kind == .ghost
        return MeeshyTicketRecipe(
            size: size,
            kind: kind,
            cut: cut(for: size),
            cornerRadius: cornerRadius,
            notchDiameter: notchDiameter,
            dashLineWidth: dashLineWidth,
            dashPattern: dashPattern,
            cutMargin: cutMargin,
            codeFontSize: codeFontSize(for: size),
            pastilleSize: pastilleSize(for: size),
            glyphSize: size == .hero ? 0 : 22,
            width: width(for: size),
            scale: isDragging ? draggingScale : (isPressed ? pressedScale : 1),
            tilt: isDragging ? draggingTilt : 0,
            lift: isHovered && !isDragging ? hoverLift : 0,
            borderWidth: isGhost ? dashLineWidth : (isSelected ? selectedBorderWidth : restBorderWidth),
            isBorderDashed: isGhost,
            fill: isGhost ? .none : (isPressed ? .field : .raised),
            isStruck: kind == .struck,
            showsContent: kind != .loading,
            showsBack: isFlipped,
            flipRotation: isFlipped && !reduceMotion ? 180 : 0,
            flipCrossfades: reduceMotion
        )
    }

    /// La hauteur du corps, jusqu'au pointillé : 125 en héros, 77 en rangée, 61 en compact.
    /// Le nom dit du billet : le libellé passé, sinon titre, code, chiffre et état ; puis la pastille de titre (K41)
    /// quand il y en a une.
    public static func spokenName(label: String?, title: String, code: String, figure: String?,
                                  statusLabel: String?, titleBadge: String?) -> String {
        let name = label ?? [title, code, figure, statusLabel].compactMap { $0 }.filter { !$0.isEmpty }
            .joined(separator: ", ")
        guard let titleBadge, !titleBadge.isEmpty else { return name }
        return name.isEmpty ? titleBadge : "\(name), \(titleBadge)"
    }

    public static func cut(for size: MeeshyTicketSize) -> Double {
        switch size {
        case .hero: return 125
        case .row: return 77
        case .compact: return 61
        case .mini: return 0
        }
    }

    public static func codeFontSize(for size: MeeshyTicketSize) -> Double {
        switch size {
        case .hero: return 20
        case .row: return 12
        case .compact: return 11.5
        case .mini: return 0
        }
    }

    public static func pastilleSize(for size: MeeshyTicketSize) -> Double {
        switch size {
        case .hero: return 0
        case .row: return 44
        case .compact, .mini: return 36
        }
    }

    public static func width(for size: MeeshyTicketSize) -> Double? {
        switch size {
        case .hero, .row: return nil
        case .compact: return 150
        case .mini: return 104
        }
    }

    /// L'encre de la pastille : l'encre sombre ou le blanc, selon le meilleur
    /// contraste sur la teinte reçue ; au moins 4,5:1 sur les teintes du catalogue.
    public static func ink(onTint tint: MeeshyKitRGB) -> MeeshyKitRGB {
        let dark = MeeshyKitRGB(hex: darkInkHex) ?? .black
        let white = MeeshyKitRGB.white
        return MeeshyKitRGB.contrast(white, tint) >= MeeshyKitRGB.contrast(dark, tint) ? white : dark
    }
}
