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
        case .style:      return String(localized: "story.textEdit.tool.style", defaultValue: "Style de texte", bundle: .module)
        case .weight:     return String(localized: "story.textEdit.tool.weight", defaultValue: "Graisse du texte", bundle: .module)
        case .color:      return String(localized: "story.textEdit.tool.color", defaultValue: "Couleur du texte", bundle: .module)
        case .size:       return String(localized: "story.textEdit.tool.size", defaultValue: "Taille du texte", bundle: .module)
        case .align:      return String(localized: "story.textEdit.tool.align", defaultValue: "Alignement du texte", bundle: .module)
        case .background: return String(localized: "story.textEdit.tool.background", defaultValue: "Fond du texte", bundle: .module)
        case .frame:      return String(localized: "story.textEdit.tool.frame", defaultValue: "Cadrage du texte", bundle: .module)
        case .border:     return String(localized: "story.textEdit.tool.border", defaultValue: "Contour du texte", bundle: .module)
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
        // Audit it.90 : un texte resté VIDE à la fermeture de l'éditeur est un
        // fantôme — invisible au canvas, compté par le badge du FAB, sérialisé
        // au publish (et traduit côté gateway pour rien). On le retire au seul
        // point de sortie COMMUN (X du toolbar, tap ailleurs, changement de
        // slide, row « éditer » refermée). `deleteElement` garde déjà les
        // textes verrouillés (badge repost) et route le staging C9.
        if case .active(let id, _) = textEditingMode,
           let obj = currentEffects.textObjects.first(where: { $0.id == id }),
           obj.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            deleteElement(id: id)
        }
        textEditingMode = .inactive
    }

    /// Déplie / replie le panneau d'options d'un outil. No-op si pas en édition.
    func setExpandedTool(_ tool: TextEditTool?) {
        guard case .active(let id, _) = textEditingMode else { return }
        textEditingMode = .active(textId: id, expandedTool: tool)
    }
}
