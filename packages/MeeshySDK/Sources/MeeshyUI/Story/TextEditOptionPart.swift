import Foundation
import MeeshySDK

/// **Les contrôles d'un outil de texte, un par un** (#13839, L4).
///
/// `TextEditToolOptions` peignait chaque outil d'un bloc. La barre collée au
/// clavier regroupe les huit outils en quatre familles : elle range la graisse
/// avec la police, et ne peint qu'une palette par panneau. Elle demande donc un
/// outil MOINS certaines parties ; les autres hôtes n'en omettent aucune et ne
/// changent pas d'un pixel.
public nonisolated enum TextEditOptionPart: String, CaseIterable, Hashable, Sendable {
    case size
    case fonts
    case effects
    case colors
    case weight
    case alignment
    case language
    case backgrounds
    case frameShapes
    case framePadding
    case frameBorderWidth
    case frameBorderPalette
    case borderWidth
    case borderPalette

    /// Une rangée de pastilles de couleur.
    public var isPalette: Bool {
        switch self {
        case .colors, .frameBorderPalette, .borderPalette:
            return true
        case .size, .fonts, .effects, .weight, .alignment, .language, .backgrounds,
             .frameShapes, .framePadding, .frameBorderWidth, .borderWidth:
            return false
        }
    }
}

extension TextEditToolOptions {

    /// Les parties qu'un outil peint, dans leur ordre, moins celles que l'hôte
    /// peint ailleurs.
    public nonisolated static func parts(for tool: TextEditTool,
                                         omitting: Set<TextEditOptionPart>) -> [TextEditOptionPart] {
        allParts(of: tool).filter { !omitting.contains($0) }
    }

    nonisolated static func allParts(of tool: TextEditTool) -> [TextEditOptionPart] {
        switch tool {
        case .style:      return [.size, .fonts]
        case .effect:     return [.effects]
        case .color:      return [.colors]
        case .align:      return [.weight, .alignment]
        case .background: return [.backgrounds]
        case .frame:      return [.frameShapes, .framePadding, .frameBorderWidth, .frameBorderPalette]
        case .border:     return [.borderWidth, .borderPalette]
        case .language:   return [.language]
        }
    }
}

/// **Ce qu'une palette unique colore** (#13839, doublon 4 de l'inventaire) :
/// le texte, son contour, ou le liseré de son cadre.
public nonisolated enum TextEditPaletteTarget: String, CaseIterable, Hashable, Sendable {
    case text
    case border
    case frame

    /// La rangée de pastilles qu'elle remplace.
    public var part: TextEditOptionPart {
        switch self {
        case .text:   return .colors
        case .border: return .borderPalette
        case .frame:  return .frameBorderPalette
        }
    }
}

/// **Une seule palette, trois cibles** — la même écriture que les trois rangées
/// de `TextEditToolOptions` : une couleur de contour ou de liseré posée sur une
/// épaisseur nulle rend un trait visible.
public nonisolated enum TextEditPalette {

    public static var colors: [String] { StoryTextColors.palette }

    public static func applying(_ hex: String, to target: TextEditPaletteTarget,
                                on texte: StoryTextObject) -> StoryTextObject {
        var resultat = texte
        switch target {
        case .text:
            resultat.textColor = hex
        case .border:
            resultat.borderColor = hex
            if (resultat.borderWidth ?? 0) == 0 { resultat.borderWidth = 4 }
        case .frame:
            resultat.frameBorderColor = hex
            if (resultat.frameBorderWidth ?? 0) == 0 {
                resultat.frameBorderWidth = StoryTextAttributeCycle.defaultFrameBorderWidth
            }
        }
        return resultat
    }

    /// La pastille sélectionnée parmi `palette`, ou `nil` si aucune ne
    /// correspond. Un texte sans couleur est blanc.
    public static func selected(_ target: TextEditPaletteTarget, in texte: StoryTextObject,
                                among palette: [String]) -> String? {
        let courante: String?
        switch target {
        case .text:   courante = texte.textColor ?? "FFFFFF"
        case .border: courante = texte.borderColor
        case .frame:  courante = texte.frameBorderColor
        }
        guard let courante else { return nil }
        return palette.first { $0.caseInsensitiveCompare(courante) == .orderedSame }
    }
}
