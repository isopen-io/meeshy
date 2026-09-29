import Foundation
import MeeshySDK
import MeeshyUI

// MARK: - La géographie des rails de la scène plein écran (#8713, #8714)
//
// > Directive porteur 2026-09-29 : « change l'emplacement de l'icône
// > animé/éclair pour la mettre après la géolocalisation et mets à sa place le
// > bouton (+) pour créer une nouvelle scène ; de même l'icône qui est au-dessus
// > du (+) [le Cadre] tu la mets après l'icône éclair. De sorte qu'en bas on a
// > undo et redo toujours, même pour les outils type dessin permettant
// > d'ajouter/supprimer, et au-dessus les options de l'outil sélectionné, qui
// > apparaissent scrollables s'il y a trop d'options. »
// >
// > « Lorsqu'on sélectionne une image, vidéo, texte ou son de la scène par le
// > simple toucher, les options d'édition apparaissent à droite en partant du
// > haut, avec en fin (x) pour quitter le mode de l'outil. »
//
// Deux règles pures, et aucune liste d'actions de plus : la colonne droite
// COMPOSE les inventaires qui existent — les contrôleurs d'un outil
// (`ComposerRailMode`), les sections de l'éditeur d'objet
// (`ComposerObjectEditorRail.entries`) et les actions d'un objet
// (`StoryCanvasContextAction.offered`, filtrées par `ComposerTrailingRailPolicy`).

/// **Les deux boutons de SCÈNE que le rail gauche porte après ses portes**
/// (#8713) : l'éclair (mode Animé), puis le Cadre.
///
/// Ils ne sont pas des PORTES — ils ne font entrer aucune matière — et ne
/// deviennent donc pas des cas de `ComposerRailDoor`, dont le niveau, la
/// pastille et le libellé décrivent ce qu'on POSE. Ils se rangent à la suite
/// de la dernière porte « de scène » : le lieu.
nonisolated enum ComposerSceneToggle: String, CaseIterable, Equatable, Sendable {
    case animated
    case frame

    var symbol: String {
        switch self {
        case .animated: return "bolt.fill"
        case .frame:    return "crop"
        }
    }
}

nonisolated enum ComposerLeadingSceneToggles {

    /// L'ordre est celui de la directive — l'éclair, PUIS le Cadre — et il ne
    /// dépend pas de ce qui est servi : un bouton qui paraît ne déplace pas
    /// son voisin sous le doigt.
    static func served(animated: Bool, frame: Bool) -> [ComposerSceneToggle] {
        ComposerSceneToggle.allCases.filter { toggle in
            switch toggle {
            case .animated: return animated
            case .frame:    return frame
            }
        }
    }

    /// **Après le lieu** quand la rangée le porte (la Story), sinon après la
    /// dernière porte de la rangée : le lieu vit en bas hors Story (#4893), et
    /// les deux boutons ne l'y suivent pas — ils règlent la SCÈNE.
    static func anchor(in sideRow: [ComposerRailDoor]) -> ComposerRailDoor? {
        sideRow.contains(.place) ? .place : sideRow.last
    }
}

/// **La colonne DROITE : les options du moment en haut, l'historique en bas**
/// (#8713, #8714).
nonisolated enum ComposerTrailingColumn {

    /// Sur quoi l'auteur agit — un outil ouvert l'emporte sur une sélection :
    /// il capture le doigt sur toute la scène.
    enum Focus: Equatable {
        case scene
        case tool([ComposerToolControl])
        case object(sections: [ComposerObjectEditorSection],
                    actions: [StoryCanvasContextAction])
    }

    enum Entry: Equatable, Identifiable {
        case toolControl(ComposerToolControl)
        case editorSection(ComposerObjectEditorSection)
        case objectAction(StoryCanvasContextAction)
        /// Le `(x)` d'un outil : il le termine et rend les portes.
        case exitTool
        /// Le `(x)` d'une sélection : il désélectionne et rend les rails de la
        /// scène.
        case exitObject

        var id: String {
            switch self {
            case .toolControl(let control):   return "tool.\(control.id)"
            case .editorSection(let section): return "section.\(section.identifier)"
            case .objectAction(let action):   return "action.\(String(describing: action))"
            case .exitTool:                   return "exit.tool"
            case .exitObject:                 return "exit.object"
            }
        }

        /// Le `(x)` — il ne défile jamais avec les options.
        var isExit: Bool {
            switch self {
            case .exitTool, .exitObject:                          return true
            case .toolControl, .editorSection, .objectAction:     return false
            }
        }
    }

    /// Le bas de la colonne — TOUJOURS l'historique, sous « Temps » quand la
    /// scène est animée. Un outil ouvert garde l'historique (« même pour les
    /// outils type dessin ») mais pas « Temps » : la frise prendrait le bas
    /// que le pinceau occupe.
    enum Foot: Equatable, Sendable {
        case time
        case undo
        case redo
    }

    static func focus(railMode: ComposerRailMode,
                      selection: (sections: [ComposerObjectEditorSection],
                                  actions: [StoryCanvasContextAction])?) -> Focus {
        if case .tool(let controls) = railMode { return .tool(controls) }
        guard let selection else { return .scene }
        return .object(sections: selection.sections, actions: selection.actions)
    }

    /// **Les options, de HAUT en bas, le `(x)` en dernier.**
    ///
    /// Pour un objet : « Modifier » d'abord (le même geste que le double
    /// toucher), puis les sections de son éditeur, puis ses actions. Le
    /// ROGNAGE n'y paraît qu'une fois — la section `.media(.trim)` et l'action
    /// `.trim` ouvrent la même plaque.
    static func options(for focus: Focus) -> [Entry] {
        switch focus {
        case .scene:
            return []
        case .tool(let controls):
            return controls.map(Entry.toolControl) + [.exitTool]
        case .object(let sections, let actions):
            let modifier = actions.contains(.edit) ? [Entry.objectAction(.edit)] : []
            let reste = actions.filter { action in
                action != .edit && !(action == .trim && sections.contains(.media(.trim)))
            }
            return modifier
                + sections.map(Entry.editorSection)
                + reste.map(Entry.objectAction)
                + [.exitObject]
        }
    }

    static func foot(for focus: Focus, timeServed: Bool) -> [Foot] {
        switch focus {
        case .tool:
            return [.undo, .redo]
        case .scene, .object:
            return (timeServed ? [.time] : []) + [.undo, .redo]
        }
    }

    /// Ce que CE meuble sait faire d'une action d'objet sur la colonne :
    /// « Modifier » (le double toucher) en plus des contrôleurs du rail.
    /// « Sortir de la scène » attend sa décision produit (#4038).
    static let servedActions: Set<StoryCanvasContextAction> =
        ComposerSceneCapabilities.controllers.union([.edit])
}
