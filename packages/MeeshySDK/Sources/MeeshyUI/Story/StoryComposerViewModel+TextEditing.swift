import Foundation
import MeeshySDK

// MARK: - TextEditTool

/// Les outils de texte exposés en mode édition flottante, dans leur ordre
/// d'affichage sur la rangée.
///
/// Taille et graisse n'y figurent pas : ce sont des valeurs continues, réglées
/// par curseur dans le panneau Police. Les loger derrière une bulle chacune
/// coûtait deux places sur une rangée dont la largeur est comptée.
///
/// `nonisolated` sur le TYPE : le package pose `.defaultIsolation(MainActor
/// .self)` (SE-0466), qui isolerait cet énuméré sur le main actor et le
/// rendrait illisible depuis les helpers purs (`StoryTextAttributeCycle`) et
/// depuis un test non isolé. Une annotation par membre ne suffit pas.
public nonisolated enum TextEditTool: String, CaseIterable, Sendable, Equatable {
    case style
    case color
    case align
    case background
    case frame
    case border
    /// Langue dans laquelle le texte est ÉCRIT. Réglable ici, à côté des
    /// attributs visuels, parce qu'une langue source fausse ne se voit PAS à
    /// l'écriture — elle ne se paie qu'à la traduction (directive user
    /// 2026-07-25).
    case language
    /// L'EFFET posé par-dessus la police — lueur, ombre, relief (#4870).
    /// Ajouté EN QUEUE de l'énuméré (l'ordre des `case` porte aussi la
    /// sérialisation), mais DEUXIÈME sur la rangée : c'est la question que
    /// l'auteur se posait devant la grille des dix-huit avant que POLICE ne
    /// soit nommée pour ce qu'elle est (#4850), et elle se pose juste après.
    case effect

    /// L'ordre d'affichage de la rangée. Distinct de `allCases` pour que
    /// réordonner l'interface ne demande pas de réordonner l'énuméré, dont
    /// l'ordre des `case` porte aussi la sérialisation.
    /// **Public depuis le 2026-08-31** (#4634) : l'éditeur d'objet plein écran
    /// EMPILE les sept outils, et il vit côté app. Recopier la liste là-bas
    /// aurait fait diverger l'ordre appris par les doigts au premier outil
    /// ajouté ici — l'ordre EST la donnée, pas un détail d'affichage.
    public static let all: [TextEditTool] = [.style, .effect, .color, .align, .background, .frame, .border, .language]

    public var sfSymbol: String {
        switch self {
        case .style:      return "textformat"
        case .color:      return "paintpalette.fill"
        case .align:      return "text.alignleft"
        case .background: return "a.square.fill"
        case .frame:      return "rectangle.roundedtop"
        case .border:     return "square"
        case .language:   return "globe"
        case .effect:     return "sparkles"
        }
    }

    /// `@MainActor` malgré le type `nonisolated` : `Bundle.module`, généré par
    /// SPM sans annotation, tombe sous l'isolation par défaut du package. Seule
    /// la vue lit ce libellé — les helpers purs n'en ont pas besoin.
    @MainActor
    public var accessibilityLabel: String {
        switch self {
        case .style:      return String(localized: "story.textEdit.tool.style", defaultValue: "Style de texte", bundle: .module)
        case .color:      return String(localized: "story.textEdit.tool.color", defaultValue: "Couleur du texte", bundle: .module)
        case .align:      return String(localized: "story.textEdit.tool.align", defaultValue: "Alignement du texte", bundle: .module)
        case .background: return String(localized: "story.textEdit.tool.background", defaultValue: "Fond du texte", bundle: .module)
        case .frame:      return String(localized: "story.textEdit.tool.frame", defaultValue: "Cadrage du texte", bundle: .module)
        case .border:     return String(localized: "story.textEdit.tool.border", defaultValue: "Contour du texte", bundle: .module)
        case .language:   return String(localized: "story.textEdit.tool.language", defaultValue: "Langue du texte", bundle: .module)
        case .effect:     return String(localized: "story.textEdit.tool.effect", defaultValue: "Effet du texte", bundle: .module)
        }
    }
}

// MARK: - TextEditingMode

/// État du mode d'édition de texte flottant. Orthogonal à `BandStateMachine`.
public nonisolated enum TextEditingMode: Equatable, Sendable {
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
    ///
    /// Un texte verrouillé n'ouvre pas l'éditeur. Le seul qui l'est est le
    /// badge d'attribution d'une republication : le réécrire, le décolorer ou
    /// le pousser hors champ reviendrait à retirer l'attribution que le verrou
    /// garantit. Suppression et duplication sont gardées côté canvas
    /// (`isLockedItem`) et côté ViewModel (`deleteElement`) ; l'édition l'est
    /// ici, à son point d'entrée unique.
    public func enterTextEditingMode(textId: String) {
        if case .active(let current, _) = textEditingMode, current == textId { return }
        guard let target = currentEffects.textObjects.first(where: { $0.id == textId }),
              target.isLocked != true else { return }
        selectedElementId = textId
        textEditingMode = .active(textId: textId, expandedTool: nil)
    }

    /// Sort du mode édition. Rien à restaurer (la géométrie n'a jamais bougé).
    public func exitTextEditingMode() {
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
    public func setExpandedTool(_ tool: TextEditTool?) {
        guard case .active(let id, _) = textEditingMode else { return }
        textEditingMode = .active(textId: id, expandedTool: tool)
    }
}
