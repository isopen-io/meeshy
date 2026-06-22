import Foundation
import MeeshySDK

// MARK: - TextEditTool

/// Les 6 contrôles de texte exposés en mode édition flottante. L'ordre des
/// `case` fixe l'ordre d'affichage des bulles dans la rangée.
public enum TextEditTool: String, CaseIterable, Sendable, Equatable {
    case style
    case weight
    case color
    case size
    case align
    case background
    case frame
    case border

    var sfSymbol: String {
        switch self {
        case .style:      return "textformat"
        case .weight:     return "bold"
        case .color:      return "paintpalette.fill"
        case .size:       return "textformat.size"
        case .align:      return "text.alignleft"
        case .background: return "a.square.fill"
        case .frame:      return "rectangle.roundedtop"
        case .border:     return "square"
        }
    }

    var accessibilityLabel: String {
        switch self {
        case .style:      return "Style de texte"
        case .weight:     return "Graisse du texte"
        case .color:      return "Couleur du texte"
        case .size:       return "Taille du texte"
        case .align:      return "Alignement du texte"
        case .background: return "Fond du texte"
        case .frame:      return "Cadrage du texte"
        case .border:     return "Contour du texte"
        }
    }
}

// MARK: - TextEditingMode

/// État du mode d'édition de texte flottant. Orthogonal à `BandStateMachine`.
public enum TextEditingMode: Equatable, Sendable {
    case inactive
    case active(textId: String, expandedTool: TextEditTool?)

    public var activeTextId: String? {
        if case .active(let id, _) = self { return id }
        return nil
    }

    public var expandedTool: TextEditTool? {
        if case .active(_, let tool) = self { return tool }
        return nil
    }
}

// MARK: - StoryComposerViewModel transitions

extension StoryComposerViewModel {

    /// Entre en mode édition flottante sur le texte `textId`.
    /// Aucune mutation de géométrie : seul `textEditingMode` change. Le texte
    /// continue d'être rendu à sa vraie position par le canvas.
    /// Idempotent : ré-entrer sur le même texte est un no-op.
    func enterTextEditingMode(textId: String) {
        if case .active(let current, _) = textEditingMode, current == textId { return }
        guard currentEffects.textObjects.contains(where: { $0.id == textId }) else { return }
        selectedElementId = textId
        textEditingMode = .active(textId: textId, expandedTool: nil)
    }

    /// Sort du mode édition. Rien à restaurer (la géométrie n'a jamais bougé).
    func exitTextEditingMode() {
        textEditingMode = .inactive
    }

    /// Déplie / replie le panneau d'options d'un outil. No-op si pas en édition.
    func setExpandedTool(_ tool: TextEditTool?) {
        guard case .active(let id, _) = textEditingMode else { return }
        textEditingMode = .active(textId: id, expandedTool: tool)
    }
}
