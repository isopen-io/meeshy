import Foundation

/// Le ton de la tuile d'état : il teinte le glyphe de son en-tête, jamais la valeur.
public nonisolated enum MeeshyStatusTileKind: String, Sendable, Equatable, CaseIterable {
    case accent
    case ok
    case warn
    case err
    case neutral
}

/// **La recette de la tuile d'état (évolution de K34)** en VALEURS : ce qui change
/// quand la tuile porte un média (un fond de carte), quand elle se touche, et quand
/// ce qu'elle dit date (hors ligne). Périmée, la tuile passe en pointillé et son
/// glyphe perd sa teinte : la couleur ne promet plus une donnée vivante.
public nonisolated struct MeeshyStatusTileRecipe: Sendable, Equatable {

    public static let cornerRadius: Double = 22
    public static let padding: Double = 16
    public static let gap: Double = 10
    public static let headGap: Double = 6
    public static let headFontSize: Double = 12.5
    public static let valueFontSize: Double = 26
    public static let mediaValueFontSize: Double = 24
    public static let detailFontSize: Double = 12.5
    public static let mediaMinHeight: Double = 132
    public static let borderWidth: Double = 1
    public static let staleDash: [Double] = [5, 4]
    public static let veilLeadOpacity: Double = 0.88
    public static let veilMidOpacity: Double = 0.55
    public static let veilTailOpacity: Double = 0.1
    public static let staleMediaOpacity: Double = 0.55
    public static let pressedScale: Double = 0.97

    public let kind: MeeshyStatusTileKind
    public let isStale: Bool
    public let hasMedia: Bool
    public let isPressable: Bool
    public let borderDash: [Double]
    public let glyphKind: MeeshyStatusTileKind
    public let minHeight: Double
    public let valueFontSize: Double
    public let mediaOpacity: Double
    public let mediaIsDesaturated: Bool

    public static func resolve(kind: MeeshyStatusTileKind,
                               isStale: Bool = false,
                               hasMedia: Bool = false,
                               isPressable: Bool = false) -> MeeshyStatusTileRecipe {
        MeeshyStatusTileRecipe(
            kind: kind,
            isStale: isStale,
            hasMedia: hasMedia,
            isPressable: isPressable,
            borderDash: isStale ? staleDash : [],
            glyphKind: isStale ? .neutral : kind,
            minHeight: hasMedia ? mediaMinHeight : 0,
            valueFontSize: hasMedia ? mediaValueFontSize : valueFontSize,
            mediaOpacity: isStale ? staleMediaOpacity : 1,
            mediaIsDesaturated: isStale
        )
    }

    /// UNE phrase pour le lecteur d'écran : le libellé de l'hôte s'il en donne un, sinon
    /// « Batterie, 64 %, Peut avoir changé » — le titre, la valeur, puis le détail.
    public static func spoken(title: String, value: String, detail: String?, label: String? = nil) -> String {
        if let label, !label.isEmpty { return label }
        return [title, value, detail].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ")
    }
}
